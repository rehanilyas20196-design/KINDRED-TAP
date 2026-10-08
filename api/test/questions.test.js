/**
 * Assessment question listing - API integration tests.
 *
 * The same list is mounted at two paths: the current one the test screen calls
 * (/api/clinical/questions) and the earlier one (/api/assessment/questions).
 * Both must stay auth-protected and answer identically, which is why they share
 * a single handler - a second copy of the query would be free to drift.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PGLITE_DIR = process.env.PGLITE_DIR || ".pglite-questions-test";

let server;
let base;
let token;

const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function call(method, path, token_) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: token_ ? { Authorization: `Bearer ${token_}` } : {},
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

before(async () => {
  const { runMigrations } = await import("../src/db/migrate.js");
  const { loadColumnMap } = await import("../src/lib/schemas.js");
  const db = await import("../src/db/index.js");
  const { createApp } = await import("../src/index.js");

  await runMigrations({ log: () => {} });
  await loadColumnMap(await db.getDriver());

  // Questions validate their category against the issue vocabulary, so the
  // vocabulary has to exist first or every question is skipped as unknown.
  const { seedIssues, seedAssessmentQuestions } = await import("../src/db/seed.js");
  await seedIssues();
  await seedAssessmentQuestions();

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${base}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `questions.${uniq}@example.com`,
      password: "Passw0rd123",
      fullName: "Question Tester",
      role: "user",
      termsAccepted: true,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, `signup returned ${response.status}`);
  token = body.token;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  const db = await import("../src/db/index.js");
  await db.closeDb().catch(() => {});
});

test("question lists need a token on both paths", async () => {
  for (const path of ["/api/clinical/questions", "/api/assessment/questions"]) {
    const anonymous = await call("GET", path);
    assert.equal(anonymous.status, 401, `${path} without a token returned ${anonymous.status}`);
  }
});

test("both paths answer with the same seeded questions", async () => {
  const current = await call("GET", "/api/clinical/questions", token);
  const earlier = await call("GET", "/api/assessment/questions", token);

  assert.equal(current.status, 200, `current path returned ${current.status}`);
  assert.equal(earlier.status, 200, `earlier path returned ${earlier.status}`);
  assert.equal(current.json.total, earlier.json.total);
  assert.ok(current.json.total > 0, "expected seeded questions");
  assert.deepEqual(current.json.questions, earlier.json.questions);
});

test("the test parameter filters identically on both paths", async () => {
  for (const path of ["/api/clinical/questions", "/api/assessment/questions"]) {
    const one = await call("GET", `${path}?test=1`, token);
    assert.equal(one.status, 200, `${path}?test=1 returned ${one.status}`);
    assert.ok(one.json.questions.length > 0, `${path}?test=1 returned nothing`);
    assert.ok(one.json.questions.every((q) => q.testNumber === 1));

    const bad = await call("GET", `${path}?test=9`, token);
    assert.equal(bad.status, 400, `${path}?test=9 returned ${bad.status}`);
  }
});
