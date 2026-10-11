-- Migration 021: conversation memory for Ask Cube, plus a record of the
-- knowledge base's synchronisation runs.
--
-- Two separate concerns that both need somewhere durable to live:
--
--   * Conversations belong to a person. Every read is scoped by user_id, and
--     the assistant router checks ownership before it loads anything, so an
--     id lifted out of a URL can never surface somebody else's chat.
--   * Sync runs are operational, not personal. They exist so an admin can
--     see that the knowledge base last rebuilt, and read the error when it
--     did not, instead of having to infer both from whether answers work.

CREATE TABLE IF NOT EXISTS assistant_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_conversations_user_idx
  ON assistant_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES assistant_conversations (id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'conversation',
  citations       JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_messages_conversation_idx
  ON assistant_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS kb_sync_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status            TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'ok', 'failed')),
  documents_seen    INTEGER NOT NULL DEFAULT 0,
  documents_indexed INTEGER NOT NULL DEFAULT 0,
  documents_removed INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS kb_sync_runs_started_idx ON kb_sync_runs (started_at DESC);

-- Whether a document was built automatically from a repository source or
-- written by an admin. Sync removes documents that its own source no longer
-- produces, so it must be able to tell the two apart: a document an admin
-- authored by hand has no automatic successor and would be deleted the moment
-- the next sync decided it was stale.
ALTER TABLE kb_documents ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT false;
