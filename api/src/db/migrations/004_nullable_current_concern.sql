-- 004_nullable_current_concern.sql
-- Lets a safety escalation be stored without inventing an issue key.
--
-- 003 made user_current_concerns.primary_issue_key NOT NULL, which quietly
-- forced the safety path to store the concern the person picked. That defeated
-- the check: a flagged user ended up with a usable primary_issue_key and could
-- still be matched into a booking list.
--
-- The column becomes nullable so a safety result is stored with no key at all,
-- and the matcher treats a NULL key as "do not match, show the escalation".

ALTER TABLE user_current_concerns
  ALTER COLUMN primary_issue_key DROP NOT NULL;

-- A concern row must either name a real concern or be a safety escalation.
-- Enforced here rather than in application code so a direct SQL write cannot
-- create a row that matches nobody but looks valid.
ALTER TABLE user_current_concerns
  DROP CONSTRAINT IF EXISTS user_current_concerns_shape_uniq;

ALTER TABLE user_current_concerns
  ADD CONSTRAINT user_current_concerns_shape_uniq
  CHECK (primary_issue_key IS NOT NULL OR is_high_risk);

-- Same rule for stored assessment results: a high-risk sitting has no
-- categorisation to record.
ALTER TABLE assessment_results
  DROP CONSTRAINT IF EXISTS assessment_results_shape_uniq;

ALTER TABLE assessment_results
  ADD CONSTRAINT assessment_results_shape_uniq
  CHECK (primary_issue_key IS NOT NULL OR is_high_risk);