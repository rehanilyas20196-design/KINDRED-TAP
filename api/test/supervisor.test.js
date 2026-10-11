/**
 * Clinic Supervisor portal - API integration tests.
 *
 * Runs against the real Express app and its database driver. The PGlite data
 * directory is redirected to `.pglite-test` so the tests never touch the
 * development database the dev server holds open.
 *
 * The suite proves the three things that matter for a safety-critical portal:
 * a non-supervisor cannot get in, a supervisor can only do what a permission
 * row allows, and the core workflows write real rows a human can act on.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PGLITE_DIR = process.env.PGLITE_DIR || ".pglite-test";

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

/** Creates an active therapist directly, for workflows that need an assignee. */
async function createPractitioner(label) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, full_name, role, status, terms_accepted_at, ethics_agreed_at)
     VALUES ($1, 'x', $2, 'therapist', 'active', now(), now())
     RETURNING id`,
    [`${label}.${uniq}@example.com`, `Practitioner ${label}`]
  );
  return rows[0].id;
}

const contact = {
  phone: "+44 7700 900123",
  dateOfBirth: "1990-06-15",
  gender: "Female",
  pronouns: "she/her",
  addressLine1: "10 Downing Row",
  city: "Bristol",
  country: "United Kingdom",
  postalCode: "BS1 4ST",
  emergencyContactName: "Sam Reed",
  emergencyContactPhone: "+44 7700 900999",
  emergencyContactRelation: "Partner",
};

const supervisorProfile = {
  ...contact,
  jobTitle: "Clinical Supervisor",
  organization: "Riverbend Mental Health Trust",
  department: "Adult Services",
  registrationNumber: "BPS CS2026-118",
  registrationBody: "British Psychological Society",
  oversightRegions: ["Regional"],
  supervisionFocuses: ["caseload review"],
  practitionerTypes: ["therapist", "supporter"],
  clinicalAreas: ["anxiety"],
  languages: ["English"],
  yearsExperience: 22,
  maxSupervisees: 24,
  onCallForEscalations: true,
  safeguardingLead: true,
  qualifications: ["Doctorate in Clinical Psychology"],
  bio: "Supervising the adult therapy team.",
  consentedToPractice: true,
  termsAccepted: true,
};

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

  // A supervisor with a completed profile (which is what grants permissions).
  const sup = await call("POST", "/api/auth/signup", {
    email: `supervisor.${uniq}@example.com`,
    password: "Passw0rd123",
    fullName: "Supervisor Tester",
    role: "clinical_supervisor",
    termsAccepted: true,
    ethicsAccepted: true,
  });
  tokens.supervisor = sup.json.token;

  const savedProfile = await call("PUT", "/api/profiles/clinical_supervisor", supervisorProfile, tokens.supervisor);
  assert.equal(savedProfile.status, 200);

  // Saving the form is what sends a professional account to the admin. This
  // suite is about supervision, not the review queue, so the gate is cleared
  // directly once the profile is on file.
  await query("UPDATE users SET status = 'active' WHERE id = $1", [sup.json.user.id]);

  // A therapist and a client, both signed up but not required to be active:
  // requireAuth only blocks suspended accounts and accounts the admin has not
  // cleared yet, and the role check is what the supervisor routes rely on.
  const therapist = await call("POST", "/api/auth/signup", {
    email: `therapist.${uniq}@example.com`,
    password: "Passw0rd123",
    fullName: "Therapist Tester",
    role: "therapist",
    termsAccepted: true,
    ethicsAccepted: true,
  });
  tokens.therapist = therapist.json.token;

  const user = await call("POST", "/api/auth/signup", {
    email: `client.${uniq}@example.com`,
    password: "Passw0rd123",
    fullName: "Client Tester",
    role: "user",
    termsAccepted: true,
  });
  tokens.user = user.json.token;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (closeDb) await closeDb();
});

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

test("anonymous requests are rejected with 401", async () => {
  const res = await call("GET", "/api/supervisor/dashboard");
  assert.equal(res.status, 401);
});

test("a client cannot access the supervisor portal", async () => {
  const res = await call("GET", "/api/supervisor/dashboard", undefined, tokens.user);
  assert.equal(res.status, 403);
});

test("a therapist cannot access the supervisor portal", async () => {
  const res = await call("GET", "/api/supervisor/team", undefined, tokens.therapist);
  assert.equal(res.status, 403);
});

/* ------------------------------------------------------------------ */
/* Authorisation: the supervisor can reach the portal it is built for  */
/* ------------------------------------------------------------------ */

test("a supervisor can reach every portal section", async () => {
  const paths = [
    "/api/supervisor/dashboard",
    "/api/supervisor/safety",
    "/api/supervisor/escalations",
    "/api/supervisor/team",
    "/api/supervisor/supervision",
    "/api/supervisor/case-reviews",
    "/api/supervisor/session-reviews",
    "/api/supervisor/interventions",
    "/api/supervisor/workload",
    "/api/supervisor/clients",
    "/api/supervisor/calendar",
    "/api/supervisor/oversight/clinical",
    "/api/supervisor/oversight/ethical",
    "/api/supervisor/reports",
    "/api/supervisor/notifications",
    "/api/supervisor/settings",
    "/api/supervisor/threads/participants",
  ];
  for (const path of paths) {
    const res = await call("GET", path, undefined, tokens.supervisor);
    assert.equal(res.status, 200, `${path} returned ${res.status}`);
  }
});

test("permissions are explicit: removing them locks the portal", async () => {
  const supervisor = (await call("GET", "/api/me", undefined, tokens.supervisor)).json.user;

  await query("DELETE FROM supervisor_permissions WHERE user_id = $1", [supervisor.id]);
  const blocked = await call("GET", "/api/supervisor/dashboard", undefined, tokens.supervisor);
  assert.equal(blocked.status, 403);

  // Restore the default set so later workflow tests can run.
  const { grantDefaultSupervisorPermissions } = await import("../src/lib/supervisor.js");
  await grantDefaultSupervisorPermissions(supervisor.id);
  const restored = await call("GET", "/api/supervisor/dashboard", undefined, tokens.supervisor);
  assert.equal(restored.status, 200);
});

/* ------------------------------------------------------------------ */
/* Workflows                                                           */
/* ------------------------------------------------------------------ */

test("safety concern workflow: raise, review, resolve", async () => {
  const created = await call(
    "POST",
    "/api/supervisor/safety",
    { category: "risk_escalation", priority: "high", reason: "Client disclosed new risk; needs human review." },
    tokens.supervisor
  );
  assert.equal(created.status, 201);
  const id = created.json.concern.id;

  const reviewed = await call("POST", `/api/supervisor/safety/${id}/actions`, { action: "review" }, tokens.supervisor);
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.json.status, "under_review");

  const resolved = await call(
    "POST",
    `/api/supervisor/safety/${id}/actions`,
    { action: "resolve", detail: "Reviewed with the therapist and a plan is in place." },
    tokens.supervisor
  );
  assert.equal(resolved.status, 200);
  assert.equal(resolved.json.status, "resolved");

  const fetched = await call("GET", `/api/supervisor/safety/${id}`, undefined, tokens.supervisor);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.json.concern.status, "resolved");
  assert.ok(fetched.json.activity.length >= 3);
});

test("critical concern cannot be resolved without explicit confirmation", async () => {
  const created = await call(
    "POST",
    "/api/supervisor/safety",
    { category: "safeguarding", priority: "critical", reason: "Safeguarding concern flagged for immediate review." },
    tokens.supervisor
  );
  assert.equal(created.status, 201);
  const id = created.json.concern.id;

  const refused = await call(
    "POST",
    `/api/supervisor/safety/${id}/actions`,
    { action: "resolve", detail: "Attempt without confirmation." },
    tokens.supervisor
  );
  assert.equal(refused.status, 400);

  const confirmed = await call(
    "POST",
    `/api/supervisor/safety/${id}/actions`,
    { action: "resolve", detail: "Human confirmed safe to close.", confirm: true },
    tokens.supervisor
  );
  assert.equal(confirmed.status, 200);
});

test("escalation workflow: create, review and escalate to the advisor", async () => {
  const created = await call(
    "POST",
    "/api/supervisor/escalations",
    { priority: "high", reason: "Complex case requiring higher clinical oversight." },
    tokens.supervisor
  );
  assert.equal(created.status, 201);
  const id = created.json.escalation.id;

  const ack = await call("POST", `/api/supervisor/escalations/${id}/actions`, { action: "acknowledge" }, tokens.supervisor);
  assert.equal(ack.status, 200);

  const toAdvisor = await call(
    "POST",
    `/api/supervisor/escalations/${id}/actions`,
    { action: "escalate_to_advisor", detail: "Requesting clinical guidance." },
    tokens.supervisor
  );
  assert.equal(toAdvisor.status, 200);
  assert.equal(toAdvisor.json.status, "action_required");

  const detail = await call("GET", `/api/supervisor/escalations/${id}`, undefined, tokens.supervisor);
  assert.equal(detail.status, 200);
  assert.ok(detail.json.events.some((event) => event.action === "escalate_to_advisor"));
});

test("case review workflow: open and resolve", async () => {
  const created = await call(
    "POST",
    "/api/supervisor/case-reviews",
    { domain: "clinical", reason: "complex_case", priority: "medium", summary: "Limited progress across six sessions." },
    tokens.supervisor
  );
  assert.equal(created.status, 201);
  const id = created.json.review.id;

  const resolved = await call(
    "POST",
    `/api/supervisor/case-reviews/${id}/actions`,
    { action: "resolve", detail: "Treatment plan revised with the therapist." },
    tokens.supervisor
  );
  assert.equal(resolved.status, 200);
  assert.equal(resolved.json.status, "resolved");
});

test("intervention workflow: create, start and complete", async () => {
  const practitionerId = await createPractitioner("intervention");
  const created = await call(
    "POST",
    "/api/supervisor/interventions",
    {
      assignedTo: practitionerId,
      category: "documentation",
      title: "Complete missing session notes",
      reason: "Two completed sessions have no final note recorded.",
      steps: [{ id: "s1", text: "Complete the notes", done: false }],
      priority: "medium",
    },
    tokens.supervisor
  );
  assert.equal(created.status, 201);
  const id = created.json.intervention.id;

  const started = await call("POST", `/api/supervisor/interventions/${id}/actions`, { action: "start" }, tokens.supervisor);
  assert.equal(started.status, 200);
  assert.equal(started.json.status, "in_progress");

  const completed = await call(
    "POST",
    `/api/supervisor/interventions/${id}/actions`,
    { action: "complete", confirm: true },
    tokens.supervisor
  );
  assert.equal(completed.status, 200);
  assert.equal(completed.json.status, "completed");
});

test("intervention requires a therapist or supporter assignee", async () => {
  const me = (await call("GET", "/api/me", undefined, tokens.supervisor)).json.user;
  const res = await call(
    "POST",
    "/api/supervisor/interventions",
    { assignedTo: me.id, category: "clinical", title: "Not a practitioner", reason: "Assigning a supervisor is invalid." },
    tokens.supervisor
  );
  assert.equal(res.status, 400);
});

test("supervision workflow: schedule then complete", async () => {
  const practitionerId = await createPractitioner("supervision");

  const created = await call(
    "POST",
    "/api/supervisor/supervision",
    { practitionerId, supervisionDate: new Date().toISOString().slice(0, 10), modality: "individual", checklist: ["Documentation"] },
    tokens.supervisor
  );
  assert.equal(created.status, 201);
  const id = created.json.record.id;

  const completed = await call(
    "POST",
    `/api/supervisor/supervision/${id}/complete`,
    { checklist: ["Documentation"], actionItems: "Review treatment plan", summary: "Supervision completed." },
    tokens.supervisor
  );
  assert.equal(completed.status, 200);
  assert.equal(completed.json.record.status, "completed");
});

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */

test("a therapist cannot read client data, safety or reports", async () => {
  const paths = [
    "/api/supervisor/clients",
    "/api/supervisor/safety",
    "/api/supervisor/escalations",
    "/api/supervisor/reports",
    "/api/supervisor/case-reviews",
  ];
  for (const path of paths) {
    const res = await call("GET", path, undefined, tokens.therapist);
    assert.equal(res.status, 403, `${path} returned ${res.status}`);
  }
});

test("sensitive reads are recorded in the audit log", async () => {
  const client = (await call("GET", "/api/me", undefined, tokens.user)).json.user;
  const created = await call(
    "POST",
    "/api/supervisor/safety",
    { category: "operational", priority: "low", reason: "Audit trail verification concern.", clientId: client.id },
    tokens.supervisor
  );
  assert.equal(created.status, 201);
  const id = created.json.concern.id;
  await call("GET", `/api/supervisor/safety/${id}`, undefined, tokens.supervisor);

  const { rows } = await query(
    `SELECT action FROM audit_log WHERE action = 'sensitive.read' AND target_type = 'safety_concern' AND target_id = $1`,
    [id]
  );
  assert.ok(rows.length >= 1, "expected a sensitive.read audit row for the concern");
});
