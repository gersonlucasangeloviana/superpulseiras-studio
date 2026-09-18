import os
from contextlib import contextmanager
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

pool = None


def connect():
    global pool
    url = os.environ.get('DATABASE_URL')
    if not url or not url.startswith(('postgresql://', 'postgres://')):
        raise RuntimeError('Configure DATABASE_URL com uma conexão PostgreSQL.')
    pool = ConnectionPool(url, min_size=1, max_size=6, kwargs={'row_factory': dict_row}, open=False)
    pool.open(wait=True, timeout=30)
    with db() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(721518)')
        conn.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())')
        for migration in sorted(Path(__file__).with_name('migrations').glob('*.sql')):
            if not conn.execute('SELECT version FROM schema_migrations WHERE version=%s', (migration.name,)).fetchone():
                conn.execute(migration.read_text(encoding='utf-8'))
                conn.execute('INSERT INTO schema_migrations(version) VALUES (%s)', (migration.name,))


@contextmanager
def db():
    if pool is None:
        raise RuntimeError('Banco de dados não inicializado.')
    with pool.connection() as conn:
        with conn.transaction():
            yield conn


def close():
    if pool:
        pool.close()
