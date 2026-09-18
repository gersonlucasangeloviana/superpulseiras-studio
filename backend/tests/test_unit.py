import asyncio
import base64
import io
from contextlib import contextmanager

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

import app
import auth


@pytest.fixture(autouse=True)
def config(monkeypatch):
    monkeypatch.setenv('STUDIO_PASSWORD', 'test-password-long')
    monkeypatch.setenv('SESSION_SECRET', 'test-secret-with-at-least-32-characters')
    monkeypatch.setenv('APP_ORIGIN', 'http://testserver')
    monkeypatch.setenv('COOKIE_SECURE', 'false')
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key-never-sent-to-openai')
    auth.failures.clear()


def png():
    output = io.BytesIO()
    Image.new('RGB', (20, 10), '#447733').save(output, format='PNG')
    return output.getvalue()


def message(role='user', **kwargs):
    return dict(id='msg', role=role, text='Quero uma pulseira', image=None, mode='flat', status='completed', **kwargs)


def test_rejects_fake_image():
    with pytest.raises(HTTPException) as error:
        app.normalize_image(b'<script>alert(1)</script>')
    assert error.value.status_code == 422


def test_normalizes_reference():
    result = app.normalize_image(png())
    with Image.open(io.BytesIO(result)) as image:
        assert image.format == 'PNG'
        assert image.size == (20, 10)


def test_context_includes_questions_and_selected_mode():
    first = message()
    answer = message('assistant')
    answer['text'] = 'Qual texto você quer na pulseira?'
    latest = message()
    latest['text'] = 'Festa da Julia'
    result = app.build_payload({'prompt_snapshot': 'Prompt salvo', 'quality': 'high'}, [first, answer, latest])
    assert result['tool_choice'] == 'auto'
    assert result['store'] is False
    assert result['instructions'] == 'Prompt salvo'
    assert result['input'][1] == {'role': 'assistant', 'content': answer['text']}
    assert 'arte plana horizontal' in result['input'][2]['content'][0]['text']
    assert 'Festa da Julia' in result['input'][2]['content'][0]['text']


def test_context_keeps_four_latest_images(monkeypatch, tmp_path):
    monkeypatch.setattr(app, 'MEDIA', tmp_path)
    history = []
    for index in range(6):
        row = message()
        row.update(id=str(index), image=f'{index}.png')
        (tmp_path / row['image']).write_bytes(png())
        history.append(row)
    result = app.build_payload({'prompt_snapshot': 'test prompt', 'quality': 'medium'}, history)
    images = [part for item in result['input'] for part in item['content'] if part['type'] == 'input_image']
    assert len(images) == 4
    assert len(result['input']) == 6


def test_auth_protects_api_and_images():
    client = TestClient(app.app)  # No lifespan: this test deliberately does not require a database.
    assert client.get('/api/chats').status_code == 401
    assert client.get('/api/images/anything.png').status_code == 401
    assert client.post('/api/auth/login', json={'password': 'wrong'}).status_code == 401
    login = client.post('/api/auth/login', json={'password': 'test-password-long'})
    assert login.status_code == 200
    assert 'HttpOnly' in login.headers['set-cookie']
    assert client.get('/api/auth/session').status_code == 200
    assert client.post('/api/auth/logout').status_code == 200
    assert client.get('/api/auth/session').status_code == 401


def test_csrf_and_body_size_rejected():
    client = TestClient(app.app)
    assert client.post('/api/auth/login', headers={'origin': 'https://evil.example'}, json={'password': 'test-password-long'}).status_code == 403
    assert client.post('/api/auth/login', headers={'content-length': str(12 * 1024 * 1024)}, json={'password': 'x'}).status_code == 413


def test_password_rotation_invalidates_session(monkeypatch):
    client = TestClient(app.app)
    client.post('/api/auth/login', json={'password': 'test-password-long'})
    monkeypatch.setenv('STUDIO_PASSWORD', 'new-password-long')
    assert client.get('/api/auth/session').status_code == 401


def test_login_throttling():
    client = TestClient(app.app)
    for _ in range(10):
        assert client.post('/api/auth/login', json={'password': 'wrong'}).status_code == 401
    assert client.post('/api/auth/login', json={'password': 'wrong'}).status_code == 429


@pytest.mark.parametrize('kind', ['text', 'image', 'both', 'refusal', 'empty', 'rate_limit', 'invalid_image'])
def test_provider_response_persistence(monkeypatch, tmp_path, kind):
    monkeypatch.setattr(app, 'MEDIA', tmp_path)
    job = dict(id='job', chat_id='chat', prompt_snapshot='Create art', quality='medium')
    queries = []

    class Cursor:
        def fetchone(self):
            return job

        def __iter__(self):
            return iter([message()])

    class Connection:
        def execute(self, sql, params=None):
            queries.append((sql, params))
            return Cursor()

    @contextmanager
    def fake_db():
        yield Connection()

    monkeypatch.setattr(app, 'db', fake_db)
    outputs = []
    if kind in ('text', 'both'):
        outputs.append({'type': 'message', 'content': [{'type': 'output_text', 'text': 'Qual é o nome do evento?'}]})
    if kind == 'refusal':
        outputs.append({'type': 'message', 'content': [{'type': 'refusal', 'refusal': 'Não consigo atender a esse pedido.'}]})
    if kind in ('image', 'both', 'invalid_image'):
        raw = png() if kind != 'invalid_image' else b'not an image'
        outputs.append({'type': 'image_generation_call', 'result': base64.b64encode(raw).decode()})
    transport = httpx.MockTransport(lambda request: httpx.Response(429 if kind == 'rate_limit' else 200, json={'output': outputs}))
    original = httpx.AsyncClient
    monkeypatch.setattr(app.httpx, 'AsyncClient', lambda **kwargs: original(transport=transport, **kwargs))

    async def run():
        app.app.state.semaphore = asyncio.Semaphore(2)
        await app.generate('job')

    asyncio.run(run())
    updates = [(sql, params) for sql, params in queries if sql.startswith('UPDATE messages')]
    assert len(updates) == 1
    sql, params = updates[0]
    failed = kind in ('empty', 'rate_limit', 'invalid_image')
    assert ("status='failed'" in sql) == failed
    if not failed:
        filename, text, _ = params
        assert bool(filename) == (kind in ('image', 'both'))
        assert bool(text) == (kind in ('text', 'both', 'refusal'))
        if filename:
            assert (tmp_path / filename).read_bytes() == png()
    else:
        assert not list(tmp_path.iterdir())
