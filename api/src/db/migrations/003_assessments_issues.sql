-- 003_assessments_issues.sql
-- AI-assisted therapist matching: configurable issue categories, a clinical
-- concern assessment, and a real many-to-many therapist specialty table.
--
-- Nothing here diagnoses anybody. An `issues` row is a routing label used to
-- find a therapist who works with that concern, not a clinical category.

-- =============================================================================
-- issues - the configurable concern vocabulary
-- =============================================================================
-- Every surface that shows a concern list (assessment, mood picker, therapist
-- specialty picker) reads this table, so adding a category is a data change
-- rather than a code change.
CREATE TABLE IF NOT EXISTS issues (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issues_active_position_idx ON issues (active, position);

-- =============================================================================
-- therapist_specialties - many-to-many, as required
-- =============================================================================
-- This is a real join table rather than a JSONB array on the profile, so a
-- specialty is a row that can be indexed, joined and administered. It sits
-- alongside `therapist_profiles.clinical_areas`, which stays in place because
-- the existing directory screen and seeded profiles already read it.
CREATE TABLE IF NOT EXISTS therapist_specialties (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_id     UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT therapist_specialties_uniq UNIQUE (therapist_id, issue_id)
);

-- The matching query always filters "therapists holding issue X", so the index
-- leads with issue_id.
CREATE INDEX IF NOT EXISTS therapist_specialties_issue_idx
  ON therapist_specialties (issue_id, therapist_id);

-- =============================================================================
-- assessment_questions
-- =============================================================================
-- `category` maps a question onto an issues.key. That mapping is what lets a
-- deterministic scorer categorise answers without an LLM, so the system keeps
-- working when no AI provider is configured.
CREATE TABLE IF NOT EXISTS assessment_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position       INTEGER NOT NULL,
  test_number    INTEGER NOT NULL DEFAULT 1
                 CHECK (test_number IN (1, 2)),
  category       TEXT,
  prompt         TEXT NOT NULL,
  question_type  TEXT NOT NULL DEFAULT 'likert'
                 CHECK (question_type IN ('likert', 'multiple_choice', 'text', 'yes_no')),
  options        JSONB,
  required       BOOLEAN NOT NULL DEFAULT true,
  active         BOOLEAN NOT NULL DEFAULT true,
  scoring_config JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assessment_questions_position_uniq UNIQUE (position)
);

CREATE INDEX IF NOT EXISTS assessment_questions_active_idx
  ON assessment_questions (active, test_number, position);

-- =============================================================================
-- assessments - one row per sitting, never overwritten
-- =============================================================================
-- History is append-only: a returning user starting a new assessment creates a
-- new row, so an old result can never be silently replaced.
CREATE TABLE IF NOT EXISTS assessments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  type         TEXT NOT NULL DEFAULT 'initial'
               CHECK (type IN ('initial', 'follow_up', 'current_concern')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessments_user_idx ON assessments (user_id, created_at DESC);

-- =============================================================================
-- assessment_answers
-- =============================================================================
CREATE TABLE IF NOT EXISTS assessment_answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
  answer_value  INTEGER CHECK (answer_value IS NULL OR answer_value BETWEEN 1 AND 5),
  answer_text   TEXT,
  score         INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assessment_answers_uniq UNIQUE (assessment_id, question_id)
);

CREATE INDEX IF NOT EXISTS assessment_answers_assessment_idx
  ON assessment_answers (assessment_id);

-- =============================================================================
-- assessment_results
-- =============================================================================
-- `primary_issue_key` / `secondary_issues` store *categorisation output*, in the
-- same vocabulary as issues.key, and are what the matcher filters on. The
-- summary text is written in neutral language on purpose: it describes
-- concerns, never a diagnosis.
CREATE TABLE IF NOT EXISTS assessment_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_issue_key TEXT,
  secondary_issues  JSONB NOT NULL DEFAULT '[]'::jsonb,
  scores            JSONB,
  selected_moods    JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_description  TEXT,
  summary           TEXT,
  confidence        JSONB,
  -- How the categorisation was reached: the model, the deterministic scorer, or
  -- the user's own manual pick. Stored so a bad AI result is auditable.
  source            TEXT NOT NULL DEFAULT 'fallback'
                    CHECK (source IN ('ai', 'fallback', 'manual', 'safety')),
  is_high_risk      BOOLEAN NOT NULL DEFAULT false,
  safety_message    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assessment_results_assessment_uniq UNIQUE (assessment_id)
);

CREATE INDEX IF NOT EXISTS assessment_results_user_idx
  ON assessment_results (user_id, created_at DESC);

-- =============================================================================
-- user_current_concerns - what the user is dealing with *right now*
-- =============================================================================
-- Deliberately separate from assessments. A first assessment must not pin every
-- future recommendation, so each sign-in writes a new row here and the matcher
-- reads only the latest one.
CREATE TABLE IF NOT EXISTS user_current_concerns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_issue_key TEXT NOT NULL,
  secondary_issues  JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_description  TEXT,
  summary           TEXT,
  source            TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('ai', 'fallback', 'manual', 'safety')),
  is_high_risk      BOOLEAN NOT NULL DEFAULT false,
  safety_message    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_current_concerns_user_idx
  ON user_current_concerns (user_id, created_at DESC);

-- =============================================================================
-- therapist_searches - a record of each matching run
-- =============================================================================
-- Lets the dashboards answer "who did we show, and why" without re-running the
-- matcher. Stores no free text beyond the issue keys already held elsewhere.
CREATE TABLE IF NOT EXISTS therapist_searches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concern_id        UUID REFERENCES user_current_concerns(id) ON DELETE SET NULL,
  assessment_id     UUID REFERENCES assessments(id) ON DELETE SET NULL,
  primary_issue_key TEXT NOT NULL,
  secondary_issues  JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_count      INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS therapist_searches_user_idx
  ON therapist_searches (user_id, created_at DESC);

-- =============================================================================
-- updated_at triggers
-- =============================================================================
-- schema.sql already defines this function, but the migration runner applies
-- files in isolation against a possibly empty database, so it is redefined
-- here with OR REPLACE to keep 003 runnable on its own.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'issues', 'assessment_questions', 'assessments',
    'assessment_results', 'user_current_concerns'
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
-- Enabled with no policies, which is the point: these tables hold assessment
-- answers and free-text descriptions. The API connects as the table owner and
-- keeps working, while any direct browser access through the Supabase anon key
-- is denied outright. Do not add "allow anon" policies here.
ALTER TABLE issues                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapist_specialties  ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_answers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_results     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_current_concerns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapist_searches     ENABLE ROW LEVEL SECURITY;