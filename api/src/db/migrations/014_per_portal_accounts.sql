-- SUPERSEDED by 015_one_account_per_email.sql: the product rule is one email
-- = one account, so this migration is reverted for every database as soon as
-- the next migration runs. Kept for the record (and for databases that stop
-- here): an email was briefly unique only within a portal, which let the same
-- address hold a User Portal and a Therapist Portal account at once.
--
-- The old index is single-column, so the seed's `ON CONFLICT (lower(email))`
-- targets become `(lower(email), role)` to match the new index expression.

DROP INDEX IF EXISTS users_email_lower_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_role_uniq
  ON users (lower(email), role);
