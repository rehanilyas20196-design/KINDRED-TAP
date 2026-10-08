-- 005_true_false_questions.sql
-- Test 1 is True/False (MMPI-style), which the question_type CHECK did not
-- allow. Widening the enum rather than overloading 'yes_no' so the instrument
-- a question belongs to stays visible in the data.
--
-- Altering a CHECK constraint in place: drop and re-add with the wider set.
-- Existing rows are unaffected, and 'yes_no' is kept so anything already using
-- it keeps working.

ALTER TABLE assessment_questions
  DROP CONSTRAINT IF EXISTS assessment_questions_question_type_check;

ALTER TABLE assessment_questions
  ADD CONSTRAINT assessment_questions_question_type_check
  CHECK (question_type IN ('likert', 'multiple_choice', 'text', 'yes_no', 'true_false'));

-- answer_value stays 1..5. True/False arrives as 1/2 and the four-option
-- severity scale as 1..4, both of which already fit, so no change is needed
-- here. The scorer in services/aiAnalysis.js is what maps them onto a common
-- 1..5 concern scale.