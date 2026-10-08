-- 002_support.sql
-- Direct messaging between a person seeking support and a therapist.

-- -----------------------------------------------------------------------------
-- Conversations
-- -----------------------------------------------------------------------------
-- One row per user/therapist pair. The unique constraint is what makes
-- "start a conversation" idempotent: asking twice returns the same thread
-- rather than creating a second one.
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  therapist_id UUID       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversations_pair_uniq UNIQUE (user_id, therapist_id),
  CONSTRAINT conversations_distinct_parties CHECK (user_id <> therapist_id)
);

-- Serves the "my conversations" list, which always filters on one side or the
-- other depending on who is asking.
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_therapist_idx ON conversations (therapist_id, updated_at DESC);

-- -----------------------------------------------------------------------------
-- Messages
-- -----------------------------------------------------------------------------
-- Append only. Nothing here is edited or deleted, because a message trail in a
-- mental health context is the record of what was said.
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT        NOT NULL
                  CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Thread reads are always "one conversation, oldest first".
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);
