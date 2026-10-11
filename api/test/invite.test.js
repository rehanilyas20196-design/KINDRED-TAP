/**
 * QR portal invites - API integration tests.
 *
 * Runs against its own PGlite directory, like the other suites. The flow it
 * pins down is the whole reason the feature exists:
 *
 *  1. Only a signed-in supporter or clinic can generate a QR invite, and it
 *     belongs to their portal - never somebody else's.
 *  2. The scanner side is public: the code in the QR is the capability, so no
 *     session is needed to see status, scan, or claim.
 *  3. A scan grants nothing. It lands as a pending request on the owner's
 *     account, and only the owner's Accept produces a usable session.
 *  4. Declining (or revoking) shows the scanner "authentication failed".
 *  5. One-time: an accepted code can never accept a second person.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PGLITE_DIR = process.env.PGLITE_DIR || ".pglite-invite-test";

let server;
let base;
let query;
let closeDb;

const uniq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

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

async function createOwner(label, role) {
  const email = `${label}.${uniq}@example.com`;
  const signup = await call("POST", "/api/auth/signup", {
    email,
    password: "Passw0rd123",
    fullName: `Owner ${label}`,
    role,
    termsAccepted: true,
    ethicsAccepted: true,
  });
  assert.equal(signup.status, 201, `owner signup for ${label} returned ${signup.status}`);

  // Skip the admin verification queue: these suites are about the QR flow,
  // not the review gate (see clinic.test.js for the same shortcut).
  if (signup.json.user.status !== "active") {
    // Get to active by writing the profile, the way a real account would.
    const profiles = {
      supporter: {
        livedExperience: "Supported family through depression.",
        supportTypes: ["check-ins"],
        relationshipToUsers: ["friend"],
        languages: ["English"],
        availabilityDays: ["Mon"],
        communicationPreferences: ["app messaging"],
        consentedToPractice: true,
        termsAccepted: true,
      },
      collaborative_clinic: {
        organizationName: `Clinic ${label}`,
        organizationType: "community_organisation",
        contactName: "Owner Contact",
        clinicSpecialisms: ["Mental health"],
        servicesOffered: ["Peer support"],
        partnershipModels: ["Referral agreement"],
        referralTypes: ["Assessment"],
        languages: ["English"],
        consentedToPractice: true,
        termsAccepted: true,
      },
    };
    const saved = await call("PUT", `/api/profiles/${role}`, profiles[role], signup.json.token);
    if (saved.status !== 200) {
      // The profile schema is not under test here - fall back to the direct
      // status update so the suite still isolates the invite behaviour.
      await doStatusFlip(signup.json.user.id, "pending_profile");
      await call("PUT", `/api/profiles/${role}`, profiles[role], signup.json.token);
      await doStatusFlip(signup.json.user.id, "active");
    }
    await doStatusFlip(signup.json.user.id, "active");
  }

  return { token: signup.json.token, userId: signup.json.user.id, email };
}

let doStatusFlip = async () => {};

before(async () => {
  const { runMigrations } = await import("../src/db/migrate.js");
  const { loadColumnMap } = await import("../src/lib/schemas.js");
  const db = await import("../src/db/index.js");
  const { createApp } = await import("../src/index.js");

  query = db.query;
  closeDb = db.closeDb;

  doStatusFlip = async (id, status) => {
    await query("UPDATE users SET status = $2 WHERE id = $1", [id, status]);
  };

  await runMigrations({ log: () => {} });
  await loadColumnMap(await db.getDriver());

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (closeDb) await closeDb();
});

test("owner generates a one-time QR invite for their own portal", async () => {
  const owner = await createOwner("qr-sup", "supporter");
  tokens.owner = owner.token;

  const created = await call("POST", "/api/invites/generate", { role: "supporter" }, owner.token);
  assert.equal(created.status, 201);
  assert.equal(created.json.invite.role, "supporter");
  assert.equal(created.json.invite.status, "pending");
  assert.match(created.json.joinUrl, /^\/invite\/[A-Za-z0-9_-]+$/);
  assert.match(created.json.message, /one-time/i);
  tokens.code = created.json.joinUrl.split("/").pop();
  tokens.inviteId = created.json.invite.id;

  // Wrong portal is refused: a supporter cannot mint clinic codes.
  const wrong = await call(
    "POST",
    "/api/invites/generate",
    { role: "collaborative_clinic" },
    owner.token
  );
  assert.equal(wrong.status, 403);

  // No session, no invite.
  const anon = await call("POST", "/api/invites/generate", { role: "supporter" });
  assert.equal(anon.status, 401);
});

test("a fresh invite reports pending and has no joiner", async () => {
  const status = await call("GET", `/api/invites/${tokens.code}/status`);
  assert.equal(status.status, 200);
  assert.equal(status.json.state, "pending");
  assert.equal(status.json.email, null);

  // Status is public - the QR's code is the capability.
  assert.equal(status.json.code, tokens.code);
});

test("scanner submits who they are; nothing is granted yet", async () => {
  const scan = await call("POST", `/api/invites/${tokens.code}/scan`, {
    email: `scanner.${uniq}@example.com`,
    fullName: "Scan Person",
    note: "A friend from the group",
  });
  assert.equal(scan.status, 202);
  assert.equal(scan.json.state, "awaiting_decision");

  const pending = await call("GET", "/api/invites/pending", undefined, tokens.owner);
  assert.equal(pending.status, 200);
  assert.equal(pending.json.requests.length, 1);
  assert.equal(pending.json.requests[0].joinerEmail, `scanner.${uniq}@example.com`);
  assert.equal(pending.json.requests[0].status, "pending");
});

test("declining makes the scanner see authentication failed", async () => {
  const pending = await call("GET", "/api/invites/pending", undefined, tokens.owner);
  const id = pending.json.requests[0].id;

  const declined = await call("POST", `/api/invites/${id}/decline`, {}, tokens.owner);
  assert.equal(declined.status, 200);
  assert.equal(declined.json.invite.status, "declined");

  const after = await call("GET", `/api/invites/${tokens.code}/status`);
  assert.equal(after.json.state, "declined");

  // The code is spent: a second scan cannot reuse it.
  const rescan = await call("POST", `/api/invites/${tokens.code}/scan`, {
    email: `second.${uniq}@example.com`,
    fullName: "Second Person",
  });
  assert.equal(rescan.status, 409);
});

test("accepting creates the session the scanner claims exactly once", async () => {
  const owner = await createOwner("qr-sup2", "supporter");
  tokens.owner = owner.token;

  const created = await call("POST", "/api/invites/generate", { role: "supporter" }, owner.token);
  tokens.code = created.json.joinUrl.split("/").pop();
  tokens.inviteId = created.json.invite.id;

  const joinerEmail = `joiner.${uniq}@example.com`;
  const scan = await call("POST", `/api/invites/${tokens.code}/scan`, {
    email: joinerEmail,
    fullName: "Join Person",
  });
  assert.equal(scan.status, 202);

  const accept = await call("POST", `/api/invites/${tokens.inviteId}/accept`, {}, owner.token);
  assert.equal(accept.status, 200);
  assert.equal(accept.json.invite.status, "used");

  // The joiner's device claims the one-time session.
  const claim = await call("POST", `/api/invites/${tokens.code}/claim`, {});
  assert.equal(claim.status, 200);
  assert.ok(claim.json.token, "claim did not return a token");
  assert.equal(claim.json.user.email, joinerEmail);
  assert.equal(claim.json.next, "/portal/supporter/profile");

  // The claimed session actually works.
  const me = await call("GET", "/api/me", undefined, claim.json.token);
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, joinerEmail);
  // The claim response carries where to go: the "add your information" page
  // of the inviting portal. (The generic /api/me routing points active
  // accounts at their dashboard; the web app follows the claim's `next`.)
  assert.equal(claim.json.next, "/portal/supporter/profile");

  // One-time: a second claim finds nothing to hand out.
  const again = await call("POST", `/api/invites/${tokens.code}/claim`, {});
  assert.equal(again.status, 409);

  // The invite cannot hand out a second session off the same code.
  const second = await call("GET", "/api/invites/pending", undefined, owner.token);
  assert.equal(second.json.requests.length, 0);
});

test("a clinic invites into the clinic portal, not the supporter portal", async () => {
  const owner = await createOwner("qr-clinic", "collaborative_clinic");
  const created = await call(
    "POST",
    "/api/invites/generate",
    { role: "collaborative_clinic" },
    owner.token
  );
  assert.equal(created.status, 201);
  assert.equal(created.json.invite.role, "collaborative_clinic");

  const code = created.json.joinUrl.split("/").pop();
  const email = `clinicjoiner.${uniq}@example.com`;
  await call("POST", `/api/invites/${code}/scan`, { email, fullName: "Clinic Joiner" });

  const accept = await call("POST", `/api/invites/${created.json.invite.id}/accept`, {}, owner.token);
  assert.equal(accept.status, 200);

  const claim = await call("POST", `/api/invites/${code}/claim`, {});
  assert.equal(claim.status, 200);
  assert.equal(claim.json.user.role, "collaborative_clinic");
  // Accepted joiners land on their portal's add-information page.
  assert.equal(claim.json.next, "/portal/collaborative_clinic/profile");
});

test("a revoked code fails authentication for the scanner", async () => {
  const owner = await createOwner("qr-sup3", "supporter");
  const created = await call("POST", "/api/invites/generate", { role: "supporter" }, owner.token);
  const code = created.json.joinUrl.split("/").pop();

  const revoked = await call("POST", `/api/invites/${created.json.invite.id}/revoke`, {}, owner.token);
  assert.equal(revoked.status, 200);

  const scan = await call("POST", `/api/invites/${code}/scan`, {
    email: `late.${uniq}@example.com`,
    fullName: "Late Person",
  });
  assert.equal(scan.status, 409);
});

// Shared between the tests above; node:test runs tests in declaration order.
const tokens = { code: "", owner: "", inviteId: "" };
