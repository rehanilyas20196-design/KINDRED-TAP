-- 022_consent_to_ai_matching.sql
-- Therapists opt in to AI-powered semantic matching. Without consent a
-- therapist is still returned by the keyword/primary-specialty rule, but their
-- embedding is not generated or used for semantic re-ranking.

ALTER TABLE therapist_profiles
ADD COLUMN IF NOT EXISTS consented_to_ai_matching BOOLEAN NOT NULL DEFAULT false;
