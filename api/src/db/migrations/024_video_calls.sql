-- 024_video_calls.sql
-- One-to-one video call records between two participants in a private
-- conversation. Only metadata is stored; no audio or video is recorded.

CREATE TABLE IF NOT EXISTS video_calls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  caller_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'idle'
               CHECK (status IN (
                 'idle', 'outgoing', 'ringing', 'accepted', 'connecting',
                 'connected', 'rejected', 'missed', 'cancelled', 'ended', 'failed'
               )),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at  TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  CONSTRAINT video_calls_distinct_parties CHECK (caller_id <> receiver_id)
);

CREATE INDEX IF NOT EXISTS video_calls_conversation_idx
  ON video_calls (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_calls_caller_idx
  ON video_calls (caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_calls_receiver_idx
  ON video_calls (receiver_id, created_at DESC);

-- Only one active call per conversation at a time.
CREATE UNIQUE INDEX IF NOT EXISTS video_calls_active_conversation_idx
  ON video_calls (conversation_id)
  WHERE status IN ('outgoing', 'ringing', 'accepted', 'connecting', 'connected');

-- ---------------------------------------------------------------------------
-- Admin portal profile table (missing from 001_init.sql; needed for API boot)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_profiles (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone                TEXT,
  date_of_birth        DATE,
  gender               TEXT,
  pronouns             TEXT,
  address_line1        TEXT,
  address_line2        TEXT,
  city                 TEXT,
  state                TEXT,
  country              TEXT,
  postal_code          TEXT,
  avatar_url           TEXT,
  emergency_contact_name       TEXT,
  emergency_contact_phone      TEXT,
  emergency_contact_relation   TEXT,
  job_title            TEXT NOT NULL,
  organization         TEXT NOT NULL,
  department           TEXT,
  admin_level          TEXT NOT NULL DEFAULT 'standard'
                       CHECK (admin_level IN ('standard', 'super_admin')),
  qualifications       JSONB NOT NULL DEFAULT '[]'::jsonb,
  bio                  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
