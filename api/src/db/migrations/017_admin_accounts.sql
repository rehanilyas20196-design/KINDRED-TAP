

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
