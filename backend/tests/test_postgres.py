"""Integration suite. Only runs against an explicitly supplied, disposable *_test database."""
import os
import uuid
from urllib.parse import urlparse

import psycopg
import pytest
from fastapi.testclient import TestClient

import app
import database


@pytest.fixture
def client(monkeypatch, tmp_path):
    url = os.getenv('TEST_DATABASE_URL')
    if not url:
        pytest.skip('TEST_DATABASE_URL não configurada; PostgreSQL de testes necessário.')
    assert urlparse(url).path.endswith('_test'), 'Use um banco descartável com nome terminado em _test.'
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute('DROP SCHEMA public CASCADE')
        conn.execute('CREATE SCHEMA public')
    monkeypatch.setenv('DATABASE_URL', url)
    monkeypatch.setenv('STUDIO_PASSWORD', 'test-password-long')
    monkeypatch.setenv('SESSION_SECRET', 'test-secret-with-at-least-32-characters')
    monkeypatch.setenv('APP_ORIGIN', 'http://testserver')
    monkeypatch.setenv('COOKIE_SECURE', 'false')
    monkeypatch.setenv('OPENAI_API_KEY', 'fake-test-key')
    monkeypatch.setattr(app, 'MEDIA', tmp_path / 'images')
    monkeypatch.setattr(app, 'launch', lambda message_id: None)
    with TestClient(app.app) as test_client:
        assert test_client.post('/api/auth/login', json={'password': 'test-password-long'}).status_code == 200
        yield test_client


def send(client, chat_id, request_id=None, text='Crie uma pulseira azul'):
    return client.post(f'/api/chats/{chat_id}/messages', data={'text': text, 'mode': 'flat', 'request_id': request_id or str(uuid.uuid4())})


def test_migrations_settings_and_chat_crud(client):
    assert client.get('/api/health').status_code == 200
    settings = {'prompt': 'Crie artes e pergunte os detalhes essenciais.', 'quality': 'high'}
    assert client.put('/api/settings', json=settings).json() == settings
    assert client.get('/api/settings').json() == settings
    chat = client.post('/api/chats').json()
    assert client.patch(f"/api/chats/{chat['id']}", json={'title': 'Festival'}).json()['title'] == 'Festival'
    assert client.get('/api/chats').json()[0]['title'] == 'Festival'
    assert client.delete(f"/api/chats/{chat['id']}").status_code == 204
    assert client.get(f"/api/chats/{chat['id']}").status_code == 404


def test_idempotency_pending_lock_and_snapshot(client):
    chat_id = client.post('/api/chats').json()['id']
    request_id = str(uuid.uuid4())
    first = send(client, chat_id, request_id)
    assert first.status_code == 202
    assert send(client, chat_id, request_id).json()['id'] == first.json()['id']
    assert send(client, chat_id).status_code == 409
    assert client.delete(f'/api/chats/{chat_id}').status_code == 409
    messages = client.get(f'/api/chats/{chat_id}').json()['messages']
    assert len(messages) == 2
    assert messages[0]['role'] == 'user'
    assert messages[1]['status'] == 'pending'
    with database.db() as conn:
        job = conn.execute('SELECT * FROM messages WHERE id=%s', (first.json()['id'],)).fetchone()
        assert job['prompt_snapshot'] == client.get('/api/settings').json()['prompt']


def test_retry_does_not_duplicate_messages(client):
    chat_id = client.post('/api/chats').json()['id']
    job_id = send(client, chat_id).json()['id']
    with database.db() as conn:
        conn.execute("UPDATE messages SET status='failed', error='test' WHERE id=%s", (job_id,))
    assert client.post(f'/api/messages/{job_id}/retry').status_code == 202
    assert client.post(f'/api/messages/{job_id}/retry').status_code == 409
    assert len(client.get(f'/api/chats/{chat_id}').json()['messages']) == 2


def test_invalid_upload_and_missing_key(client, monkeypatch):
    chat_id = client.post('/api/chats').json()['id']
    invalid = client.post(f'/api/chats/{chat_id}/messages', data={'request_id': str(uuid.uuid4())}, files={'image': ('x.png', b'bad', 'image/png')})
    assert invalid.status_code == 422
    assert send(client, chat_id, text=' ').status_code == 422
    monkeypatch.delenv('OPENAI_API_KEY')
    assert send(client, chat_id).status_code == 503
    assert client.get(f'/api/chats/{chat_id}').json()['messages'] == []
