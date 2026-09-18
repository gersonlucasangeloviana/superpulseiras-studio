CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), prompt TEXT NOT NULL, quality TEXT NOT NULL);
CREATE TABLE chats (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE messages (
    seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    text TEXT NOT NULL DEFAULT '', image TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'failed')),
    mode TEXT NOT NULL CHECK(mode IN ('mockup', 'flat')),
    created_at TIMESTAMPTZ NOT NULL,
    error TEXT, prompt_snapshot TEXT, quality TEXT, request_id TEXT UNIQUE
);
CREATE INDEX messages_chat ON messages(chat_id, seq);
CREATE UNIQUE INDEX one_pending_per_chat ON messages(chat_id) WHERE status='pending';
