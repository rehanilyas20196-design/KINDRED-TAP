-- 006_gemini_matching.sql
-- Stores Gemini embeddings for therapist profiles to enable semantic matching.
-- Embeddings are stored as JSON arrays (compatible with PGlite/PostgreSQL JSONB).
-- Cosine similarity is computed in Node.js for portability.

CREATE TABLE IF NOT EXISTS therapist_embeddings (
  therapist_id  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  embedding     JSONB NOT NULL,
  model         TEXT  NOT NULL DEFAULT 'text-embedding-004',
  source_text   TEXT  NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS therapist_embeddings_updated_idx
  ON therapist_embeddings (updated_at DESC);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS therapist_embeddings_touch ON therapist_embeddings;
CREATE TRIGGER therapist_embeddings_touch
  BEFORE UPDATE ON therapist_embeddings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();