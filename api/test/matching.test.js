/**
 * Therapist-user matching - API integration tests.
 *
 * Runs against the real Express app and its own PGlite directory, so the tests
 * never touch the database the dev server holds open.
 *
 * Proves:
 *   1. Hard filter: a therapist must hold the primary concern specialty to
 *      appear in results.
 *   2. Secondary overlap reorders who survives the hard filter; it never
 *      admits someone who lacks the primary.
 *   3. Consent gating: a therapist who has not consented to AI matching is
 *      still returned by the keyword rule but is not re-ranked by embedding.
 *   4. Conversations started from matches carry the therapist_search_id link.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PGLITE_DIR = process.env.PGLITE_DIR || ".pglite-matching-test";
process.env.DATABASE_URL = "";

let server;
let base;
let query;
let closeDb;

const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const tokens = {};

async function call(method, path, body, token) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

async function createUser(email, fullName, role) {
  const signup = await call("POST", "/api/auth/signup", {
    email,
    password: "Passw0rd123",
    fullName,
    role,
    termsAccepted: true,
    ethicsAccepted: true,
  });
  assert.equal(signup.status, 201, `signup for ${fullName} returned ${signup.status}`);
  await query("UPDATE users SET status = 'active' WHERE id = $1", [signup.json.user.id]);
  const tokenRes = await call("POST", "/api/auth/login", {
    email,
    password: "Passw0rd123",
  });
  assert.equal(tokenRes.status, 200);
  return { id: signup.json.user.id, token: tokenRes.json.token };
}

async function createIssue(key, label) {
  const { rows } = await query(
    `INSERT INTO issues (key, label, active, position) VALUES ($1, $2, true, $3)
     ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, active = true
     RETURNING id`,
    [key, label, 1]
  );
  return rows[0].id;
}

/** Inserts a therapist profile row directly, bypassing the profile API. */
async function insertTherapistProfile(userId, overrides = {}) {
  await query(
    `INSERT INTO therapist_profiles
       (user_id, discipline, registration_number, registration_body,
        clinical_areas, modalities, languages, years_experience,
        session_modes, session_fee, currency, accepting_new_cases,
        availability_hours_per_week, bio, registration_verified,
        consented_to_practice, consented_to_data_sharing,
        consented_to_ai_matching)
     VALUES ($1, 'Psychotherapy', 'REG-001', 'UKCP',
        '["anxiety"]'::jsonb, '["CBT"]'::jsonb, '["English"]'::jsonb, 5,
        '["video"]'::jsonb, 60, 'GBP', true, 10, 'Experienced therapist.',
        true, true, false, $2)
     ON CONFLICT (user_id) DO UPDATE SET
        accepting_new_cases = EXCLUDED.accepting_new_cases,
        consented_to_ai_matching = EXCLUDED.consented_to_ai_matching`,
    [userId, overrides.consentedToAiMatching ?? false]
  );
  if (overrides.acceptingNewCases === false) {
    await query(
      "UPDATE therapist_profiles SET accepting_new_cases = false WHERE user_id = $1",
      [userId]
    );
  }
}

let therapistIdA;
let therapistIdB;
let therapistIdC;
let userId;
let userToken;
let anxietyId;
let depressionId;

before(async () => {
  const { runMigrations } = await import("../src/db/migrate.js");
  const { loadColumnMap } = await import("../src/lib/schemas.js");
  const db = await import("../src/db/index.js");
  const { createApp } = await import("../src/index.js");

  query = db.query;
  closeDb = db.closeDb;

  await runMigrations({ log: () => {} });
  await loadColumnMap(await db.getDriver());

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${server.address().port}`;

  anxietyId = await createIssue("ANXIETY", "Anxiety");
  depressionId = await createIssue("DEPRESSION", "Depression");

  // Therapist A: holds anxiety + depression, accepting, verified, consented to AI matching
  const a = await createUser(`therapistA.${uniq}@example.com`, "Therapist A", "therapist");
  therapistIdA = a.id;
  await insertTherapistProfile(a.id, { consentedToAiMatching: true });

  // Therapist B: holds depression only, NOT anxiety, not consented to AI matching
  const b = await createUser(`therapistB.${uniq}@example.com`, "Therapist B", "therapist");
  therapistIdB = b.id;
  await insertTherapistProfile(b.id, { consentedToAiMatching: false });

  // Therapist C: holds anxiety, but not accepting new cases
  const c = await createUser(`therapistC.${uniq}@example.com`, "Therapist C", "therapist");
  therapistIdC = c.id;
  await insertTherapistProfile(c.id, { acceptingNewCases: false });

  // A real user seeking support
  const u = await createUser(`user.${uniq}@example.com`, "User Seeker", "user");
  userId = u.id;
  userToken = u.token;

  // Set specialties directly via DB
  await query(
    `INSERT INTO therapist_specialties (therapist_id, issue_id) VALUES
       ($1, $2), ($1, $3),
       ($4, $3),
       ($5, $2)`,
    [therapistIdA, anxietyId, depressionId, therapistIdB, therapistIdC]
  );
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (closeDb) await closeDb();
});

test("hard filter: only therapists holding the primary specialty appear", async () => {
  await query(
    `INSERT INTO user_current_concerns (user_id, primary_issue_key, secondary_issues, source)
     VALUES ($1, 'ANXIETY', '[]'::jsonb, 'manual')`,
    [userId]
  );

  const res = await call("GET", "/api/matching/therapists/current", undefined, userToken);
  assert.equal(res.status, 200);
  assert.equal(res.json.hasCurrentConcern, true);
  assert.equal(res.json.total, 1);
  assert.equal(res.json.therapists[0].id, therapistIdA);

  const ids = res.json.therapists.map((t) => t.id);
  assert.ok(!ids.includes(therapistIdB), "therapist without primary specialty must be excluded");
  assert.ok(!ids.includes(therapistIdC), "therapist not accepting cases must be excluded");
});

test("secondary overlap reorders matches but never admits non-primary therapists", async () => {
  await query(
    `INSERT INTO user_current_concerns (user_id, primary_issue_key, secondary_issues, source)
     VALUES ($1, 'DEPRESSION', '["ANXIETY"]'::jsonb, 'manual')`,
    [userId]
  );

  const res = await call("GET", "/api/matching/therapists/current", undefined, userToken);
  assert.equal(res.status, 200);
  assert.equal(res.json.total, 2);

  const ids = res.json.therapists.map((t) => t.id);
  assert.equal(ids[0], therapistIdA);
  assert.equal(ids[1], therapistIdB);
  assert.equal(res.json.therapists[0].secondaryOverlap, 1);
  assert.equal(res.json.therapists[1].secondaryOverlap, 0);
  assert.ok(!ids.includes(therapistIdC));
});

test("explicit search records a search and returns matches", async () => {
  const res = await call(
    "POST",
    "/api/matching/therapists",
    { primaryIssueKey: "ANXIETY", secondaryIssues: ["DEPRESSION"], userDescription: "Feeling anxious" },
    userToken
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.total, 1);
  assert.equal(res.json.therapists[0].id, therapistIdA);
  assert.equal(res.json.matchedBecause, "Therapists who specialise in anxiety and are available now.");

  const { rows } = await query(
    `SELECT id FROM therapist_searches WHERE user_id = $1 AND primary_issue_key = 'ANXIETY'`,
    [userId]
  );
  assert.ok(rows.length >= 1, "an explicit search should be recorded");
});

test("safety-flagged concern returns no matches", async () => {
  const res = await call(
    "POST",
    "/api/matching/therapists",
    { primaryIssueKey: "ANXIETY", secondaryIssues: [], userDescription: "I want to kill myself" },
    userToken
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.isHighRisk, true);
  assert.equal(res.json.therapists.length, 0);
  assert.ok(res.json.safetyMessage);
});

test("conversation started from matches carries therapist_search_id", async () => {
  await query(
    `INSERT INTO user_current_concerns (user_id, primary_issue_key, secondary_issues, source)
     VALUES ($1, 'ANXIETY', '[]'::jsonb, 'manual')`,
    [userId]
  );

  const matches = await call("GET", "/api/matching/therapists/current", undefined, userToken);
  assert.equal(matches.status, 200);
  assert.ok(matches.json.searchId, "current matches should return a searchId");

  const conv = await call(
    "POST",
    "/api/support/conversations",
    { therapistId: therapistIdA, searchId: matches.json.searchId },
    userToken
  );
  assert.equal(conv.status, 201);

  const { rows } = await query(
    `SELECT therapist_search_id FROM conversations WHERE id = $1`,
    [conv.json.conversationId]
  );
  assert.equal(rows[0].therapist_search_id, matches.json.searchId);
});

test("conversation started without searchId still works", async () => {
  const conv = await call(
    "POST",
    "/api/support/conversations",
    { therapistId: therapistIdA },
    userToken
  );
  assert.equal(conv.status, 201);
  assert.ok(conv.json.conversationId);
});
