-- =============================================================================
-- Kindred Tap - query reference
-- =============================================================================
-- You can paste this ENTIRE file into the Supabase SQL editor and press Run.
-- It executes cleanly and changes nothing.
--
--   SECTION 1  Documentation only. Wrapped in a block comment, so it is
--              skipped no matter how you run it. Read it, don't execute it.
--   SECTION 2  Real queries you can run. Valid SQL, no placeholders. Every
--              UPDATE is written to match zero rows until you swap in a real
--              email, so running this file is harmless.
--
-- To install the database itself, paste supabase/schema.sql instead.
--
-- None of these queries read password_hash - there is no reason to pull a
-- password hash into a spreadsheet.
-- =============================================================================


/*
===============================================================================
SECTION 1 - what the API runs at runtime (documentation, not runnable)
===============================================================================

These use $1/$2 bind parameters and <portal_table> placeholders, which is why
they cannot be pasted into the SQL editor. The API supplies those values as
parameters; the editor has no way to.

SIGNUP - POST /api/auth/signup                        api/src/routes/auth.routes.js:33
  Identical for all six portals. Only the role value differs.

  1. Duplicate check                                          lib/users.js:30
       SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1;

  2. Create the account                                       auth.routes.js:53
       INSERT INTO users (
         email, password_hash, full_name, role, status,
         terms_accepted_at, ethics_agreed_at, ethics_version, ethics_accepted
       )
       VALUES ($1, $2, $3, $4, 'pending_profile', now(), $5, $6, $7)
       RETURNING id;
     $2 is a bcrypt hash at cost 10. ethics_* are set only for the five
     professional portals, never for 'user'.

  3. Public projection - password_hash deliberately absent     lib/users.js:35
       SELECT id, email, full_name AS "fullName", role, status,
              terms_accepted_at AS "termsAcceptedAt",
              ethics_agreed_at AS "ethicsAgreedAt",
              ethics_version AS "ethicsVersion",
              ethics_accepted,
              test_completed AS "testCompleted",
              personality_type AS "personalityType",
              personality_label AS "personalityLabel",
              personality_scores AS "personalityScores",
              onboarded_at AS "onboardedAt",
              last_login_at AS "lastLoginAt",
              created_at AS "createdAt"
         FROM users WHERE id = $1 LIMIT 1;

  4. Open a session                                         auth.routes.js:25
     The SHA-256 of the JWT is stored. The JWT itself never touches the
     database, so a database leak cannot be replayed as a login.
       INSERT INTO auth_tokens (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + interval '7 days');

  5. Stamp the login time                                    auth.routes.js:29
       UPDATE users SET last_login_at = now() WHERE id = $1;


LOGIN - POST /api/auth/login                              api/src/routes/auth.routes.js:83

  1. SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1;
     Returns password_hash. bcrypt.compare runs against this hash OR against a
     dummy hash when nothing matched, so response timing cannot be used to
     discover which email addresses are registered.

  2. The same public projection as signup step 3.
  3. INSERT INTO auth_tokens (token_hash, user_id, expires_at) VALUES (...).
  4. UPDATE users SET last_login_at = now() WHERE id = $1.


AUTH GUARD - runs before every protected route            api/src/middleware/auth.js:4

  One round trip proves the session is live AND loads the user.
       SELECT u.id, u.email, u.full_name, u.role, u.status, u.test_completed,
              u.ethics_accepted, u.personality_type, u.personality_scores
         FROM auth_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1
          AND t.expires_at > now();
  No row means logged out, expired or revoked, whatever the JWT claims.


LOGOUT - POST /api/auth/logout                            api/src/routes/auth.routes.js:120
  This is what makes logout real. The JWT stays cryptographically valid until it
  expires, but deleting the row makes requireAuth reject it immediately.
       DELETE FROM auth_tokens WHERE token_hash = $1;


PROFILE READ - GET /api/profiles/:role                        lib/users.js:58
  <portal_table> is looked up in ROLE_TABLES (lib/roles.js:18) and rejected if
  unknown, so the URL can never choose the table name.
       SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1;
  One of: user_profiles, supporter_profiles, therapist_profiles,
          clinical_advisor_profiles, clinical_supervisor_profiles,
          collaborative_clinic_profiles


PROFILE WRITE - PUT /api/profiles/:role                  api/src/routes/profile.routes.js:39
  Both statements run in one transaction, so nobody is left marked 'active'
  with no profile row.

  1. Activate the account and lock in the portal
       UPDATE users
          SET role = $2, status = 'active',
              onboarded_at = COALESCE(onboarded_at, now()), updated_at = now()
        WHERE id = $1;

  2. Upsert the portal profile, so editing is re-runnable
       INSERT INTO user_profiles (user_id, <cols>, updated_at)
       VALUES ($1, $2, ..., now())
     ON CONFLICT (user_id) DO UPDATE
       SET <col> = EXCLUDED.<col>, ..., updated_at = now();
  Column names are discovered from information_schema at boot (lib/schemas.js:334)
  and can only ever be columns that already exist.


NAME UPDATE - PATCH /api/me                               api/src/routes/me.routes.js:41
     UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1;


PERSONALITY TEST                                     api/src/routes/personality.routes.js
  GET /api/personality/questions                                    :16
       SELECT id, position, prompt, hint, trait
         FROM personality_questions WHERE active = true ORDER BY position;

  POST /api/personality/submit - read the scoring keys              :34
       SELECT id, position, trait, reverse
         FROM personality_questions WHERE active = true ORDER BY position;

  POST /api/personality/submit - store the result                   :49
  Scoring runs in Node, never in the browser, so a result cannot be forged by
  editing client-side state. One attempt per account; retaking returns 409.
       UPDATE users
          SET test_completed = true, personality_type = $2,
              personality_label = $3, personality_scores = $4,
              personality_answers = $5, updated_at = now()
        WHERE id = $1;

  GET /api/personality/result                                      :83
       SELECT id, email, role, status, personality_type, personality_label,
              personality_scores
         FROM users WHERE id = $1 LIMIT 1;


BOOT - schema drift guard, once per portal table         api/src/lib/schemas.js:337
  If an API field is renamed without a matching migration, the column set no
  longer matches and boot fails loudly instead of silently dropping the field.
       SELECT column_name FROM information_schema.columns WHERE table_name = $1;


SEED - idempotent, safe on every boot                          api/src/db/seed.js:15
       INSERT INTO personality_questions
         (position, prompt, hint, trait, reverse, active)
       VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (position) DO UPDATE
       SET prompt = EXCLUDED.prompt, hint = EXCLUDED.hint,
           trait = EXCLUDED.trait, reverse = EXCLUDED.reverse, active = true;

     DELETE FROM auth_tokens WHERE expires_at <= now();

===============================================================================
END SECTION 1
===============================================================================
*/


-- =============================================================================
-- SECTION 2 - queries you can actually run
-- =============================================================================
-- Everything below this line is valid SQL with no placeholders. Read-only
-- queries come first, then the write queries, each of which matches zero rows
-- until you replace the example email.

-- ---------------------------------------------------------------- onboarding
-- Where everyone is in the signup funnel.
SELECT role, status, count(*) AS accounts
  FROM users
 GROUP BY role, status
 ORDER BY role, status;

-- Signed up but never finished their portal profile.
SELECT role, count(*) AS stuck, min(created_at) AS oldest
  FROM users
 WHERE status = 'pending_profile'
 GROUP BY role
 ORDER BY stuck DESC;

-- Completed the personality test, never activated a portal.
SELECT count(*) AS tested_but_inactive
  FROM users
 WHERE test_completed = true
   AND status <> 'active';

-- ------------------------------------------------------------------ ethics
-- Professionals who accepted the code of conduct, and which version.
SELECT role, count(*) AS accepted, max(ethics_agreed_at) AS most_recent
  FROM users
 WHERE ethics_accepted = true
 GROUP BY role
 ORDER BY accepted DESC;

-- Anyone whose accepted ethics version is not the current one (2026.1).
SELECT email, role, ethics_version, ethics_agreed_at
  FROM users
 WHERE ethics_accepted = true
   AND ethics_version IS DISTINCT FROM '2026.1';

-- ---------------------------------------------------------------- sessions
-- Live sessions and who they belong to.
SELECT u.email, u.role, t.created_at, t.expires_at
  FROM auth_tokens t
  JOIN users u ON u.id = t.user_id
 ORDER BY t.created_at DESC;

-- Expired sessions still on disk. The seed script clears these on every run.
SELECT count(*) AS expired_sessions
  FROM auth_tokens
 WHERE expires_at <= now();

-- ----------------------------------------------------------------- matching
-- Therapists taking new cases in a given clinical area, with a live
-- registration. Change 'anxiety' to whatever you are matching for.
SELECT u.email,
       t.discipline,
       t.clinical_areas,
       t.session_modes,
       t.session_fee,
       t.currency,
       t.years_experience
  FROM therapist_profiles t
  JOIN users u ON u.id = t.user_id
 WHERE t.accepting_new_cases = true
   AND u.status = 'active'
   AND t.clinical_areas @> '["anxiety"]'::jsonb
   AND (t.registration_expiry IS NULL OR t.registration_expiry > now())
 ORDER BY t.years_experience DESC;

-- Therapists whose registration has lapsed.
SELECT u.email, t.registration_body, t.registration_number, t.registration_expiry
  FROM therapist_profiles t
  JOIN users u ON u.id = t.user_id
 WHERE t.registration_expiry IS NOT NULL
   AND t.registration_expiry <= now();

-- Supporters with safeguarding training, available on a given weekday.
SELECT u.email, s.lived_experience, s.support_types, s.availability_days
  FROM supporter_profiles s
  JOIN users u ON u.id = s.user_id
 WHERE s.has_safeguarding_training = true
   AND s.availability_days @> '["Mon"]'::jsonb;

-- Clinics currently sending referrals.
SELECT u.email,
       c.organization_name,
       c.organization_type,
       c.referral_types,
       c.commission_rate_percent
  FROM collaborative_clinic_profiles c
  JOIN users u ON u.id = c.user_id
 WHERE c.sends_referrals = true;

-- ------------------------------------------------------------------ consent
-- Consent coverage per portal. Anything below 100% is a row to chase.
SELECT 'user' AS portal,
       count(*) AS total,
       count(*) FILTER (WHERE consented_to_matching)     AS consented_matching,
       count(*) FILTER (WHERE consented_to_data_sharing) AS consented_sharing
  FROM user_profiles;

-- Users who declined data sharing. They must never appear in an export.
SELECT u.email, u.full_name, u.created_at
  FROM users u
  JOIN user_profiles p ON p.user_id = u.id
 WHERE p.consented_to_data_sharing = false;

-- ----------------------------------------------------------------- accounts
-- Suspended accounts.
SELECT email, role, status, last_login_at
  FROM users
 WHERE status = 'suspended';

-- Accounts that have never logged in after signing up.
SELECT role, count(*) AS never_returned, min(created_at) AS oldest
  FROM users
 WHERE last_login_at IS NULL
 GROUP BY role;

-- Most recent signups.
SELECT email, role, status, created_at, last_login_at
  FROM users
 ORDER BY created_at DESC
 LIMIT 20;

-- =============================================================================
-- WRITE QUERIES
-- Each matches zero rows until you replace the example email, so pasting this
-- file changes nothing. Swap in a real address, then run that one line only.
-- =============================================================================

-- Suspend an account. Takes effect on their next request: requireAuth returns
-- 403 "This account is suspended". Use this for a safeguarding concern.
-- UPDATE users SET status = 'suspended', updated_at = now()
--  WHERE email = 'someone@example.com';

-- Reinstate a suspended account.
-- UPDATE users SET status = 'active', updated_at = now()
--  WHERE email = 'someone@example.com';

-- Mark a therapist's registration as checked against their regulator.
-- UPDATE therapist_profiles SET registration_verified = true, updated_at = now()
--  WHERE user_id = (SELECT id FROM users WHERE email = 'therapist@example.com');

-- Stop a clinic sending referrals.
-- UPDATE collaborative_clinic_profiles SET sends_referrals = false, updated_at = now()
--  WHERE user_id = (SELECT id FROM users WHERE email = 'clinic@example.com');

-- Force someone back through onboarding. Clears their personality result too.
-- UPDATE users
--    SET status = 'pending_profile', test_completed = false,
--        personality_type = NULL, personality_label = NULL,
--        personality_scores = '{}'::jsonb, personality_answers = '[]'::jsonb,
--        updated_at = now()
--  WHERE email = 'someone@example.com';

-- Sign one person out everywhere.
-- DELETE FROM auth_tokens
--  WHERE user_id = (SELECT id FROM users WHERE email = 'someone@example.com');

-- Sign everyone out everywhere.
-- DELETE FROM auth_tokens;

-- Housekeeping: clear expired sessions early.
-- DELETE FROM auth_tokens WHERE expires_at <= now();

-- Withdraw a stale personality question from the test.
-- UPDATE personality_questions SET active = false WHERE position = 7;

-- Reactivate it.
-- UPDATE personality_questions SET active = true WHERE position = 7;

-- Close an account permanently. ON DELETE CASCADE removes the portal profile,
-- the sessions, and the stored personality answers with it. There is no undo.
-- DELETE FROM users WHERE email = 'someone@example.com';
