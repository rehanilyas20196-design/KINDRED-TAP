/**
 * Admin verification - API integration tests.
 *
 * Runs against the real Express app and its database driver, with the PGlite
 * data directory redirected to `.pglite-admin-test` so the suite never touches
 * the development database the dev server holds open.
 *
 * The suite proves the four things that matter for the gate: a portal token
 * can never reach /api/admin, an account only reaches the queue once its form
 * is submitted, an unverified professional account can never reach a portal
 * route, and the admin's decision is what opens the dashboard.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PGLITE_DIR = process.env.PGLITE_DIR || ".pglite-admin-test";
// Read by api/src/env.js when it is imported inside `before`.
process.env.ADMIN_EMAIL = "admin@example.com";
process.env.ADMIN_PASSWORD = "Sup3rSecret!";

let server;
let base;
let closeDb;

const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ADMIN = { email: "admin@example.com", password: "Sup3rSecret!" };

const ADVISOR = {
  email: `advisor.${uniq}@example.com`,
  password: "Passw0rd123",
  fullName: "Advisor Tester",
  role: "clinical_advisor",
  termsAccepted: true,
  ethicsAccepted: true,
};

async function call(method, path, { body, token } = {}) {
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

async function adminToken() {
  const login = await call("POST", "/api/admin/login", { body: ADMIN });
  assert.equal(login.status, 200, `admin login returned ${login.status}`);
  return login.json.token;
}

before(async () => {
  const { runMigrations } = await import("../src/db/migrate.js");
  const { loadColumnMap } = await import("../src/lib/schemas.js");
  const db = await import("../src/db/index.js");
  const { createApp } = await import("../src/index.js");

  closeDb = db.closeDb;

  await runMigrations({ log: () => {} });
  await loadColumnMap(await db.getDriver());

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

test("the admin panel refuses a wrong password", async () => {
  const bad = await call("POST", "/api/admin/login", {
    body: { email: ADMIN.email, password: "not-the-password" },
  });
  assert.equal(bad.status, 401);
});

test("a portal token cannot reach any admin route", async () => {
  const signup = await call("POST", "/api/auth/signup", {
    body: {
      email: `member.${uniq}@example.com`,
      password: "Passw0rd123",
      fullName: "Portal Member",
      role: "user",
      termsAccepted: true,
    },
  });
  assert.equal(signup.status, 201);

  const stats = await call("GET", "/api/admin/stats", { token: signup.json.token });
  assert.equal(stats.status, 401);

  const list = await call("GET", "/api/admin/users", { token: signup.json.token });
  assert.equal(list.status, 401);
});

test("an admin token cannot reach a portal route", async () => {
  const token = await adminToken();
  const me = await call("GET", "/api/me", { token });
  assert.equal(me.status, 401);
});

test("a professional signup opens the form, not the portal", async () => {
  const signup = await call("POST", "/api/auth/signup", { body: ADVISOR });
  assert.equal(signup.status, 201);
  assert.equal(signup.json.user.status, "pending_profile");
  assert.equal(signup.json.next, "/portal/clinical_advisor/profile");

  // "Who am I" answers, so the form has something to greet them with.
  const me = await call("GET", "/api/me", { token: signup.json.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.status, "pending_profile");
  assert.equal(me.json.next, "/portal/clinical_advisor/profile");

  // The queue holds submitted forms, so an untouched signup is not in it
  // yet - there is nothing for a reviewer to look at.
  const token = await adminToken();
  const early = await call("GET", "/api/admin/users?status=pending_review", { token });
  assert.equal(early.status, 200);
  assert.equal(
    early.json.users.some((entry) => entry.email === ADVISOR.email),
    false,
    "an unfilled signup must not be waiting for verification"
  );

  // The form itself is reachable: nothing may block the step that produces
  // the information the admin is meant to review.
  const profile = await call("PUT", "/api/profiles/clinical_advisor", {
    body: {},
    token: signup.json.token,
  });
  assert.notEqual(profile.status, 403);
});

test("filling the form hands the admin the account and the details on it", async () => {
  const login = await call("POST", "/api/auth/login", {
    body: { email: ADVISOR.email, password: ADVISOR.password, portal: ADVISOR.role },
  });
  assert.equal(login.status, 200);
  assert.equal(login.json.next, "/portal/clinical_advisor/profile");

  const saved = await call("PUT", "/api/profiles/clinical_advisor", {
    token: login.json.token,
    body: {
      termsAccepted: true,
      discipline: "Clinical psychology",
      maxSupervisees: 6,
      consentedToPractice: true,
    },
  });
  assert.equal(saved.status, 200, `profile save returned ${saved.status}: ${JSON.stringify(saved.json)}`);
  assert.equal(saved.json.user.status, "pending_review");
  assert.equal(saved.json.next, "/verification/pending");

  // Saving is the submission: the portal closes behind them...
  const me = await call("GET", "/api/me", { token: login.json.token });
  assert.equal(me.json.user.status, "pending_review");
  assert.equal(me.json.next, "/verification/pending");

  const sessions = await call("GET", "/api/sessions", { token: login.json.token });
  assert.equal(sessions.status, 403);
  assert.equal(sessions.json.code, "verification_required");

  // ...and everything on the form lands on the admin's desk with it.
  const token = await adminToken();
  const list = await call("GET", "/api/admin/users?status=pending_review", { token });
  assert.equal(list.status, 200);
  const row = list.json.users.find((entry) => entry.email === ADVISOR.email);
  assert.ok(row, "the submitted form should be in the verification queue");

  const detail = await call("GET", `/api/admin/users/${row.id}`, { token });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.profile.discipline, "Clinical psychology");
});

test("the admin sees the request and can reject it with a note", async () => {
  const token = await adminToken();

  const list = await call("GET", "/api/admin/users?status=pending_review", { token });
  assert.equal(list.status, 200);
  const row = list.json.users.find((entry) => entry.email === ADVISOR.email);
  assert.ok(row, "the pending signup should be in the verification queue");

  const detail = await call("GET", `/api/admin/users/${row.id}`, { token });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.user.email, ADVISOR.email);
  assert.equal(detail.json.user.termsAcceptedAt !== null, true);

  const rejected = await call("POST", `/api/admin/users/${row.id}/reject`, {
    token,
    body: { note: "Registration documents not on file" },
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.json.user.status, "rejected");
});

test("a rejected account can sign in and read the reason, but not use the portal", async () => {
  const login = await call("POST", "/api/auth/login", {
    body: { email: ADVISOR.email, password: ADVISOR.password, portal: ADVISOR.role },
  });
  assert.equal(login.status, 200);
  assert.equal(login.json.next, "/verification/rejected");

  const me = await call("GET", "/api/me", { token: login.json.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.status, "rejected");
  assert.equal(me.json.user.reviewNote, "Registration documents not on file");

  const sessions = await call("GET", "/api/sessions", { token: login.json.token });
  assert.equal(sessions.status, 403);
  assert.equal(sessions.json.code, "account_rejected");
});

test("approving a submitted form opens the dashboard", async () => {
  const token = await adminToken();

  const list = await call("GET", "/api/admin/users?q=" + encodeURIComponent(ADVISOR.email), {
    token,
  });
  const row = list.json.users.find((entry) => entry.email === ADVISOR.email);
  assert.ok(row, "the rejected account should still be listed");

  const approved = await call("POST", `/api/admin/users/${row.id}/approve`, { token });
  assert.equal(approved.status, 200);
  // The form was already on file when it reached the queue, so approval is
  // the door opening rather than a request for more information.
  assert.equal(approved.json.user.status, "active");
  assert.equal(approved.json.user.reviewNote, null);

  const login = await call("POST", "/api/auth/login", {
    body: { email: ADVISOR.email, password: ADVISOR.password, portal: ADVISOR.role },
  });
  assert.equal(login.json.next, "/portal/clinical_advisor");

  const me = await call("GET", "/api/me", { token: login.json.token });
  assert.equal(me.json.user.status, "active");
  assert.equal(me.json.next, "/portal/clinical_advisor");
});

test("a public signup is not held for verification", async () => {
  const signup = await call("POST", "/api/auth/signup", {
    body: {
      email: `plain.${uniq}@example.com`,
      password: "Passw0rd123",
      fullName: "Plain Person",
      role: "user",
      termsAccepted: true,
    },
  });
  assert.equal(signup.status, 201);
  assert.equal(signup.json.user.status, "pending_profile");
  assert.equal(signup.json.next, "/portal/user/profile");
});

test("signing out of the panel revokes the admin session", async () => {
  const token = await adminToken();

  const out = await call("POST", "/api/admin/logout", { token });
  assert.equal(out.status, 200);

  const stats = await call("GET", "/api/admin/stats", { token });
  assert.equal(stats.status, 401);
});
