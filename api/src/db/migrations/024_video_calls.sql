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
