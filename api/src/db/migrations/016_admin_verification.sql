-- 016_admin_verification.sql
-- Admin verification for the professional portals.
--
-- Signups for the Clinical Advisor, Clinical Supervisor and Collaborative
-- Clinic portals now land in `pending_review`: the account exists and can be
-- signed in to, but every other route refuses it until an admin approves or
-- rejects it from /admin. The decision is recorded on the row so the person
-- can be told why.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN (
  'pending_portal', 'pending_profile', 'pending_review',
  'active', 'suspended', 'rejected'
));

-- The admin's decision, shown to the account on /verification/*.
ALTER TABLE users ADD COLUMN IF NOT EXISTS review_note   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reviewed_by   TEXT;

-- The verification queue is the admin panel's default ordering.
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

-- Admin sessions are separate from user sessions on purpose: a user token can
-- never be replayed against /api/admin, and revoking one cannot touch the
-- other. Tokens are stored hashed, exactly like auth_tokens.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email      TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions (expires_at);
