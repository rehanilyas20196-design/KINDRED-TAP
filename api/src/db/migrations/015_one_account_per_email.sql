-- One email address owns exactly one Kindred Tap account.
--
-- 014 briefly allowed an account per portal; the product rule is instead:
-- signing up on a second portal with an email that is already registered is
-- an error, and the person has to make the account with a different email.
-- Any address that ended up with more than one account keeps its earliest
-- account, then the single-column index comes back.

DELETE FROM users u
USING users keeper
WHERE lower(u.email) = lower(keeper.email)
  AND (keeper.created_at, keeper.id) < (u.created_at, u.id);

DROP INDEX IF EXISTS users_email_role_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uniq ON users (lower(email));
