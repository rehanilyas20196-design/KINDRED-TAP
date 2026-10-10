-- Migration 019: knowledge base for the support assistant (retrieval-augmented
-- generation).
--
-- Documents are admin-curated only. Nothing a user can submit is ever written
-- to these two tables, which is what keeps private records out of the
-- retrieval corpus in the first place rather than relying on a filter.

CREATE TABLE IF NOT EXISTS kb_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'doc',
  content_hash TEXT NOT NULL,
  content      TEXT NOT NULL,
  chunk_count  INTEGER NOT NULL DEFAULT 0,
  indexed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Embeddings are stored as a JSON float array in TEXT, exactly like
-- `therapist_profiles.matching_embedding`. The corpus is small enough that
-- cosine similarity runs in the application, so neither PGlite nor pgvector
-- is required and the two databases behave identically.
CREATE TABLE IF NOT EXISTS kb_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES kb_documents (id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL,
  heading      TEXT,
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS kb_chunks_document_id_idx ON kb_chunks (document_id);
