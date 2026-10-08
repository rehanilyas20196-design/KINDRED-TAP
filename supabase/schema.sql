-- =============================================================================
-- Kindred Tap - Supabase schema
-- =============================================================================
-- Paste this ENTIRE file into the Supabase SQL Editor and run it.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Nothing in this file is optional or commented out. It is safe to run more
-- than once: every statement is idempotent.
--
-- Requires nothing to be installed - gen_random_uuid() is built into
-- PostgreSQL 13+, so no extension is needed.
--
-- After this succeeds, set DATABASE_URL in .env (see the comments there) and
-- run `npm run seed` once so the 10 personality questions exist.
--
-- The reference list of every query the running API issues lives in
-- supabase/queries.sql. This file is the only one you need to paste.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Migration bookkeeping
-- -----------------------------------------------------------------------------
-- The API tracks applied migrations in this table (api/src/db/migrate.js).
-- Recording the migration files here stops `npm run migrate` from re-running
-- them, which is why this whole file is safe to paste over an existing database.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (name)
VALUES ('001_init.sql')
ON CONFLICT (name) DO NOTHING;

INSERT INTO schema_migrations (name)
VALUES ('002_support.sql')
ON CONFLICT (name) DO NOTHING;


-- -----------------------------------------------------------------------------
-- Accounts
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT        NOT NULL,
  password_hash       TEXT        NOT NULL,
  full_name           TEXT        NOT NULL,
  role                TEXT,
  status              TEXT        NOT NULL DEFAULT 'pending_portal'
                                  CHECK (status IN ('pending_portal', 'pending_profile', 'active', 'suspended')),
  terms_accepted_at   TIMESTAMPTZ,
  ethics_agreed_at    TIMESTAMPTZ,
  ethics_version      TEXT,
  ethics_accepted     BOOLEAN     NOT NULL DEFAULT false,
  test_completed      BOOLEAN     NOT NULL DEFAULT false,
  personality_type    TEXT,
  personality_label   TEXT,
  personality_scores  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  personality_answers JSONB       NOT NULL DEFAULT '[]'::jsonb,
  onboarded_at        TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_role_check CHECK (
    role IS NULL OR role IN (
      'user', 'supporter', 'therapist',
      'clinical_advisor', 'clinical_supervisor', 'collaborative_clinic'
    )
  )
);

-- Emails are compared case-insensitively, so uniqueness lives in an index.
-- This is what makes concurrent signups impossible to duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uniq ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);


-- -----------------------------------------------------------------------------
-- Revocable sessions. Only the SHA-256 of a token is stored, never the token.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id);
CREATE INDEX IF NOT EXISTS auth_tokens_expiry_idx ON auth_tokens (expires_at);


-- -----------------------------------------------------------------------------
-- Personality test questions (10 rows added by `npm run seed`)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS personality_questions (
  id       SERIAL PRIMARY KEY,
  position INTEGER     NOT NULL UNIQUE,
  prompt   TEXT        NOT NULL,
  hint     TEXT,
  trait    TEXT        NOT NULL CHECK (trait IN
             ('openness', 'conscientiousness', 'extraversion', 'agreeableness', 'resilience')),
  reverse  BOOLEAN     NOT NULL DEFAULT false,
  active   BOOLEAN     NOT NULL DEFAULT true
);


-- =============================================================================
-- Portal profiles - one table per portal, all keyed to users(id)
-- =============================================================================
-- Each portal table repeats the same shared contact block, then adds only the
-- fields unique to that portal. API code never builds a table name from user
-- input; it looks it up in ROLE_TABLES (api/src/lib/roles.js:18).

-- USER PORTAL ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id                     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone                       TEXT,
  date_of_birth               DATE,
  gender                      TEXT,
  pronouns                    TEXT,
  address_line1               TEXT,
  address_line2               TEXT,
  city                        TEXT,
  state                       TEXT,
  country                     TEXT,
  postal_code                 TEXT,
  avatar_url                  TEXT,
  emergency_contact_name      TEXT,
  emergency_contact_phone     TEXT,
  emergency_contact_relation  TEXT,
  what_brought_you_here       TEXT,
  feeling_domains             JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_contact_method    TEXT,
  preferred_language          TEXT NOT NULL DEFAULT 'English',
  accessibility_needs         TEXT,
  current_support_status      TEXT CHECK (current_support_status IS NULL OR current_support_status IN
                              ('not_receiving', 'waiting_list', 'in_therapy', 'self_managing', 'seeking_support')),
  consented_to_matching       BOOLEAN NOT NULL DEFAULT false,
  consented_to_data_sharing   BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SUPPORTER PORTAL ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS supporter_profiles (
  user_id                     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone                       TEXT,
  date_of_birth               DATE,
  gender                      TEXT,
  pronouns                    TEXT,
  address_line1               TEXT,
  address_line2               TEXT,
  city                        TEXT,
  state                       TEXT,
  country                     TEXT,
  postal_code                 TEXT,
  avatar_url                  TEXT,
  emergency_contact_name      TEXT,
  emergency_contact_phone     TEXT,
  emergency_contact_relation  TEXT,
  lived_experience            TEXT,
  relationship_to_users       JSONB NOT NULL DEFAULT '[]'::jsonb,
  support_types               JSONB NOT NULL DEFAULT '[]'::jsonb,
  relevant_training           JSONB NOT NULL DEFAULT '[]'::jsonb,
  relevant_qualifications     JSONB NOT NULL DEFAULT '[]'::jsonb,
  languages                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  availability_days           JSONB NOT NULL DEFAULT '[]'::jsonb,
  availability_hours          TEXT,
  communication_preferences   JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_concurrent_sessions     INTEGER,
  has_safeguarding_training   BOOLEAN NOT NULL DEFAULT false,
  supervision_contact_name    TEXT,
  supervision_contact_phone   TEXT,
  bio                         TEXT,
  consented_to_practice       BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- THERAPIST PORTAL ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS therapist_profiles (
  user_id                     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone                       TEXT,
  date_of_birth               DATE,
  gender                      TEXT,
  pronouns                    TEXT,
  address_line1               TEXT,
  address_line2               TEXT,
  city                        TEXT,
  state                       TEXT,
  country                     TEXT,
  postal_code                 TEXT,
  avatar_url                  TEXT,
  emergency_contact_name      TEXT,
  emergency_contact_phone     TEXT,
  emergency_contact_relation  TEXT,
  discipline                  TEXT        NOT NULL,
  registration_number         TEXT        NOT NULL,
  registration_body           TEXT,
  registration_country        TEXT NOT NULL DEFAULT 'United Kingdom',
  registration_expiry         DATE,
  clinical_areas              JSONB NOT NULL DEFAULT '[]'::jsonb,
  modalities                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualifications              JSONB NOT NULL DEFAULT '[]'::jsonb,
  languages                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  years_experience            INTEGER     NOT NULL DEFAULT 0,
  session_modes               JSONB NOT NULL DEFAULT '[]'::jsonb,
  session_fee                 NUMERIC(10, 2) NOT NULL DEFAULT 0,
  currency                    TEXT        NOT NULL DEFAULT 'GBP',
  accepting_new_cases         BOOLEAN     NOT NULL DEFAULT true,
  supervision_experience      BOOLEAN     NOT NULL DEFAULT false,
  clinical_supervisor_name    TEXT,
  professional_indemnity      BOOLEAN     NOT NULL DEFAULT false,
  availability_hours_per_week INTEGER,
  bio                         TEXT,
  registration_verified       BOOLEAN     NOT NULL DEFAULT false,
  consented_to_practice       BOOLEAN NOT NULL DEFAULT false,
  consented_to_data_sharing   BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CLINICAL ADVISOR PORTAL ---------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_advisor_profiles (
  user_id                     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone                       TEXT,
  date_of_birth               DATE,
  gender                      TEXT,
  pronouns                    TEXT,
  address_line1               TEXT,
  address_line2               TEXT,
  city                        TEXT,
  state                       TEXT,
  country                     TEXT,
  postal_code                 TEXT,
  avatar_url                  TEXT,
  emergency_contact_name      TEXT,
  emergency_contact_phone     TEXT,
  emergency_contact_relation  TEXT,
  discipline                  TEXT        NOT NULL,
  registration_number         TEXT,
  registration_body           TEXT,
  registration_country        TEXT NOT NULL DEFAULT 'United Kingdom',
  clinical_areas              JSONB NOT NULL DEFAULT '[]'::jsonb,
  standards_owned             JSONB NOT NULL DEFAULT '[]'::jsonb,
  ethical_guidelines_owned    BOOLEAN     NOT NULL DEFAULT false,
  languages                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  years_experience            INTEGER     NOT NULL DEFAULT 0,
  years_supervising           INTEGER     NOT NULL DEFAULT 0,
  supervision_modes           JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_supervisees             INTEGER,
  consultation_days           JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualifications              JSONB NOT NULL DEFAULT '[]'::jsonb,
  bio                         TEXT,
  consented_to_practice       BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CLINICAL SUPERVISOR PORTAL ------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_supervisor_profiles (
  user_id                     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone                       TEXT,
  date_of_birth               DATE,
  gender                      TEXT,
  pronouns                    TEXT,
  address_line1               TEXT,
  address_line2               TEXT,
  city                        TEXT,
  state                       TEXT,
  country                     TEXT,
  postal_code                 TEXT,
  avatar_url                  TEXT,
  emergency_contact_name      TEXT,
  emergency_contact_phone     TEXT,
  emergency_contact_relation  TEXT,
  job_title                   TEXT        NOT NULL,
  organization                TEXT        NOT NULL,
  department                  TEXT,
  registration_number         TEXT,
  registration_body           TEXT,
  registration_country        TEXT NOT NULL DEFAULT 'United Kingdom',
  oversight_regions           JSONB NOT NULL DEFAULT '[]'::jsonb,
  supervision_focuses         JSONB NOT NULL DEFAULT '[]'::jsonb,
  practitioner_types          JSONB NOT NULL DEFAULT '[]'::jsonb,
  clinical_areas              JSONB NOT NULL DEFAULT '[]'::jsonb,
  languages                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  years_experience            INTEGER     NOT NULL DEFAULT 0,
  max_supervisees             INTEGER,
  on_call_for_escalations     BOOLEAN     NOT NULL DEFAULT false,
  safeguarding_lead           BOOLEAN     NOT NULL DEFAULT false,
  qualifications              JSONB NOT NULL DEFAULT '[]'::jsonb,
  bio                         TEXT,
  consented_to_practice       BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- COLLABORATIVE CLINIC PORTAL -----------------------------------------------
CREATE TABLE IF NOT EXISTS collaborative_clinic_profiles (
  user_id                       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone                         TEXT,
  date_of_birth                 DATE,
  gender                        TEXT,
  pronouns                      TEXT,
  address_line1                 TEXT,
  address_line2                 TEXT,
  city                          TEXT,
  state                         TEXT,
  country                       TEXT,
  postal_code                   TEXT,
  avatar_url                    TEXT,
  emergency_contact_name        TEXT,
  emergency_contact_phone       TEXT,
  emergency_contact_relation    TEXT,
  organization_name             TEXT        NOT NULL,
  organization_type             TEXT        NOT NULL
                                 CHECK (organization_type IN
                                   ('private_clinic', 'nhs_service', 'community_organisation',
                                    'charity', 'workplace', 'university', 'other')),
  registration_number           TEXT,
  registration_body             TEXT,
  contact_name                  TEXT,
  contact_email                 TEXT,
  contact_phone                 TEXT,
  website                       TEXT,
  clinic_specialisms            JSONB NOT NULL DEFAULT '[]'::jsonb,
  services_offered              JSONB NOT NULL DEFAULT '[]'::jsonb,
  partnership_models            JSONB NOT NULL DEFAULT '[]'::jsonb,
  accepts_referrals             BOOLEAN     NOT NULL DEFAULT true,
  sends_referrals               BOOLEAN     NOT NULL DEFAULT false,
  referral_types                JSONB NOT NULL DEFAULT '[]'::jsonb,
  marketing_consent             BOOLEAN     NOT NULL DEFAULT false,
  languages                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  years_operating               INTEGER     NOT NULL DEFAULT 0,
  cqc_or_equivalent_number      TEXT,
  billing_currency              TEXT        NOT NULL DEFAULT 'GBP',
  commission_rate_percent       NUMERIC(5, 2),
  bio                           TEXT,
  consented_to_practice         BOOLEAN NOT NULL DEFAULT false,
  consented_to_data_sharing     BOOLEAN NOT NULL DEFAULT false,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================================
-- Conversations and messages
-- =============================================================================
-- Direct messaging between a person seeking support and a therapist. This is
-- the most sensitive data in the product: never expose these tables to a
-- browser client, and do not add "allow anon" policies to them.

-- One row per user/therapist pair. The unique constraint is what makes "start a
-- conversation" idempotent: asking twice returns the same thread rather than
-- creating a second one.
CREATE TABLE IF NOT EXISTS conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  therapist_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversations_pair_uniq UNIQUE (user_id, therapist_id),
  CONSTRAINT conversations_distinct_parties CHECK (user_id <> therapist_id)
);

-- Serves the "my conversations" list, which always filters on one side or the
-- other depending on who is asking.
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_therapist_idx ON conversations (therapist_id, updated_at DESC);

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


-- =============================================================================
-- updated_at triggers
-- =============================================================================
-- The API already sets updated_at = now() on every write it makes. This keeps
-- the column honest for rows you edit by hand in the Supabase dashboard.
-- DROP ... IF EXISTS first so re-running this file stays safe.

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'user_profiles', 'supporter_profiles', 'therapist_profiles',
    'clinical_advisor_profiles', 'clinical_supervisor_profiles',
    'collaborative_clinic_profiles', 'conversations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t || '_touch', t);
  END LOOP;
END $$;


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Read this before adding any policy of your own.
--
-- The API connects as the table owner (`postgres` via DATABASE_URL), and owners
-- bypass RLS, so the API keeps working exactly as before with this enabled.
-- What it buys you: if anyone ever points the browser straight at Supabase with
-- the anon key, every query against these tables is DENIED rather than dumping
-- your users' mental-health data.
--
-- schema_migrations is deliberately left out. Only the API's own migrate
-- script reads it, and it needs to work before anything else is configured.
--
-- Do NOT add "allow anon" policies to any table in this schema.

ALTER TABLE users                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE personality_questions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE supporter_profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapist_profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_advisor_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_supervisor_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborative_clinic_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                        ENABLE ROW LEVEL SECURITY;
