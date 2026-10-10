-- 017_admin_accounts.sql
-- The admin identity, stored in the database.
--
-- A row here is what /admin checks when ADMIN_EMAIL/ADMIN_PASSWORD_HASH are
-- not set in the environment, so the panel can be used without editing a file
-- on every machine. It is deliberately a separate table from `users`: nothing
-- here shows up in the admin's own account list, no approval flow can reach
-- it, and no portal code ever reads it.
--
-- Set both ADMIN_EMAIL and ADMIN_PASSWORD_HASH in the environment to override
-- a row here (handy for a one-off login without touching the database).

CREATE TABLE IF NOT EXISTS admin_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Logins are looked up case-insensitively, so the uniqueness has to be too.
CREATE UNIQUE INDEX IF NOT EXISTS admin_accounts_email_uk
  ON admin_accounts (lower(email));

CREATE INDEX IF NOT EXISTS admin_accounts_active_idx
  ON admin_accounts (is_active) WHERE is_active;
