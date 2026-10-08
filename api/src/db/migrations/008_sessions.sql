-- 008_sessions.sql
-- Booked sessions between a person seeking support and a therapist, plus the
-- star rating left after a session finishes.

-- -----------------------------------------------------------------------------
-- Sessions
-- -----------------------------------------------------------------------------
-- One row per booked appointment. Nothing about the clinical content of the
-- meeting lives here: this is a diary row, not a record of what was said.
CREATE TABLE IF NOT EXISTS sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  therapist_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER     NOT NULL DEFAULT 50
                   CHECK (duration_minutes BETWEEN 15 AND 180),
  mode             TEXT        NOT NULL DEFAULT 'online'
                   CHECK (mode IN ('online', 'phone', 'in_person')),
  status           TEXT        NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  cancel_reason    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sessions_distinct_parties CHECK (user_id <> therapist_id)
);

-- "My sessions" is always one of these two people, most recent first.
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS sessions_therapist_idx ON sessions (therapist_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions (status, scheduled_at);

-- -----------------------------------------------------------------------------
-- Session feedback
-- -----------------------------------------------------------------------------
-- Deliberately its own table with no shared column against the clinical
-- records: a star rating is an opinion about the experience of the session and
-- must never be read as part of the clinical assessment.
CREATE TABLE IF NOT EXISTS session_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID        NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT        CHECK (comment IS NULL OR length(btrim(comment)) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_feedback_user_idx ON session_feedback (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Updated at trigger
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sessions', 'session_feedback'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t || '_touch', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;
