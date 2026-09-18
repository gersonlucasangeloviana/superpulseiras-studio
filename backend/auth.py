import hashlib
import hmac
import os
import secrets
import time

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse

router = APIRouter(prefix='/api/auth')
COOKIE = 'studio_session'
MAX_AGE = 60 * 60 * 24 * 7
# A single shared team login. Global throttling intentionally ignores spoofable proxy IP headers.
failures: list[float] = []


def validate_config():
    if len(os.getenv('STUDIO_PASSWORD', '')) < 12:
        raise RuntimeError('STUDIO_PASSWORD precisa ter pelo menos 12 caracteres.')
    if len(os.getenv('SESSION_SECRET', '')) < 32:
        raise RuntimeError('SESSION_SECRET precisa ter pelo menos 32 caracteres.')
    if not os.getenv('APP_ORIGIN', '').startswith(('http://', 'https://')):
        raise RuntimeError('Configure APP_ORIGIN com a URL pública do frontend.')


def signature(value):
    key = (os.environ['SESSION_SECRET'] + os.environ['STUDIO_PASSWORD']).encode()
    return hmac.new(key, value.encode(), hashlib.sha256).hexdigest()


def authenticated(request):
    try:
        value, supplied = request.cookies.get(COOKIE, '').rsplit('.', 1)
        expiry, nonce = value.split(':')
        return int(expiry) > time.time() and hmac.compare_digest(signature(value), supplied)
    except (ValueError, KeyError):
        return False


async def guard(request: Request, call_next):
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        origin = request.headers.get('origin')
        if origin and origin.rstrip('/') != os.environ.get('APP_ORIGIN', '').rstrip('/'):
            return JSONResponse({'detail': 'Origem da solicitação não autorizada.'}, status_code=403)
    length = request.headers.get('content-length', '0')
    if not length.isdigit() or int(length) > 11 * 1024 * 1024:
        return JSONResponse({'detail': 'Envie um arquivo de até 10 MB.'}, status_code=413)
    if request.url.path not in ('/api/health', '/api/auth/login') and not authenticated(request):
        return JSONResponse({'detail': 'Entre para acessar o Studio.'}, status_code=401)
    return await call_next(request)


class Login(BaseModel):
    password: str = Field(min_length=1, max_length=256)


@router.post('/login')
def login(body: Login, response: Response):
    instant = time.time()
    failures[:] = [stamp for stamp in failures if stamp > instant - 300]
    if len(failures) >= 10:
        raise HTTPException(429, 'Muitas tentativas. Aguarde 5 minutos antes de tentar novamente.')
    if not hmac.compare_digest(body.password.encode(), os.environ['STUDIO_PASSWORD'].encode()):
        failures.append(instant)
        raise HTTPException(401, 'Senha incorreta.')
    value = f'{int(instant) + MAX_AGE}:{secrets.token_hex(16)}'
    response.set_cookie(COOKIE, value + '.' + signature(value), max_age=MAX_AGE, httponly=True,
                        secure=os.getenv('COOKIE_SECURE', 'true').lower() == 'true', samesite='strict', path='/')
    return {'ok': True}


@router.get('/session')
def session():
    return {'ok': True}


@router.post('/logout')
def logout(response: Response):
    response.delete_cookie(COOKIE, path='/')
    return {'ok': True}
