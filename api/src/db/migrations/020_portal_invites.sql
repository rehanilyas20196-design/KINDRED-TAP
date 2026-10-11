-- 020_portal_invites.sql
-- QR-code portal invites.
--
-- One row per QR invite a signed-in member of the Collaborative Clinic or the
-- Supporter Portal generates. The QR code itself never carries the owner's
-- email or password: it encodes the public join URL with the invite's random
-- code, and the owner's decision is the only thing that can turn a scanned
-- code into a session.

CREATE TABLE IF NOT EXISTS portal_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The account the invite belongs to and whose approval is required.
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Public random code embedded in the QR payload and the join URL.
  code        TEXT NOT NULL UNIQUE,
  -- Where the scanned session will land, fixed by the owner's portal so a
  -- supporter QR cannot be repointed at the clinic portal later.
  role        TEXT NOT NULL CHECK (role IN ('collaborative_clinic', 'supporter')),
  -- One scan per invite: a QR code is single-use once a joiner is approved.
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'used', 'revoked')),
  -- Who scanned and asked to join, captured on the public join page.
  joiner_email      TEXT,
  joiner_full_name  TEXT,
  joiner_note       TEXT,
  joiner_token_hash TEXT UNIQUE,
  joiner_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  joiner_ip         TEXT,
  joiner_device     TEXT,
  requested_at      TIMESTAMPTZ,
  decision_at       TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_invites_owner_idx ON portal_invites (owner_id);
CREATE INDEX IF NOT EXISTS portal_invites_status_idx ON portal_invites (status);
