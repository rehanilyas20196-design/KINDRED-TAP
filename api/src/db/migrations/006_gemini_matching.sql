ALTER TABLE therapist_profiles
ADD COLUMN IF NOT EXISTS matching_embedding TEXT;

ALTER TABLE therapist_profiles
ADD COLUMN IF NOT EXISTS matching_text TEXT;

ALTER TABLE therapist_profiles
ADD COLUMN IF NOT EXISTS matching_embedding_updated_at TEXT;