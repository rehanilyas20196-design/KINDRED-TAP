-- 018_therapist_matching_on_profile.sql
-- Semantic matching lives on the therapist row.
--
-- Migration 006 was rewritten to put the vector on `therapist_profiles`
-- instead of a side table, but 006 has already run in its original form on
-- existing databases, so this catches them up. Everything here is idempotent:
-- a database that only ever saw the rewritten 006 is left alone.

ALTER TABLE therapist_profiles ADD COLUMN IF NOT EXISTS matching_embedding TEXT;
ALTER TABLE therapist_profiles ADD COLUMN IF NOT EXISTS matching_text TEXT;
ALTER TABLE therapist_profiles ADD COLUMN IF NOT EXISTS matching_embedding_updated_at TIMESTAMPTZ;

-- The rewritten 006 declared this as TEXT; a timestamp needs a real type.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'therapist_profiles'
       AND column_name = 'matching_embedding_updated_at'
       AND data_type = 'text'
  ) THEN
    ALTER TABLE therapist_profiles
      ALTER COLUMN matching_embedding_updated_at TYPE TIMESTAMPTZ
      USING NULLIF(matching_embedding_updated_at, '')::timestamptz;
  END IF;
END $$;

-- Carry the vectors over from the old side table rather than silently
-- discarding them, then remove the table.
DO $$
BEGIN
  IF to_regclass('therapist_embeddings') IS NOT NULL THEN
    UPDATE therapist_profiles p
       SET matching_embedding           = e.embedding::text,
           matching_text                = e.source_text,
           matching_embedding_updated_at = e.updated_at
      FROM therapist_embeddings e
     WHERE e.therapist_id = p.user_id;

    DROP TABLE therapist_embeddings;
  END IF;
END $$;

-- Deliberately no index on matching_embedding. A gemini-embedding-001 vector
-- serialises to roughly 21KB of JSON, which no btree index can hold, and the
-- read path needs every vector at once anyway.
