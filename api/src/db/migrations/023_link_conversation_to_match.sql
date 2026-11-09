-- 023_link_conversation_to_match.sql
-- Record which matching search/decision produced a conversation so the
-- pairing can be audited end-to-end (search -> decision -> conversation).

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS therapist_search_id UUID
  REFERENCES therapist_searches(id) ON DELETE SET NULL;

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS match_decision_id UUID
  REFERENCES match_decisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_therapist_search_id_idx
  ON conversations(therapist_search_id);
CREATE INDEX IF NOT EXISTS conversations_match_decision_id_idx
  ON conversations(match_decision_id);
