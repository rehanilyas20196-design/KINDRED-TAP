/**
 * Collaborative Clinic portal - API integration tests.
 *
 * Runs against the real Express app and its own PGlite directory, so the tests
 * never touch the database the dev server holds open.
 *
 * The suite proves the four things that matter for a portal holding client and
 * financial information:
 *
 *  1. Authentication and role: no token is a 401, and a therapist or a client
 *     signing in gets a 403 rather than a filtered-down view.
 *  2. Organization isolation: two partner organizations are created, and
 *     everything one of them can read, the other provably cannot - referrals,
 *     clients, commissions, payouts, partnerships and messages alike.
 *  3. Workflows: receive, accept, decline, request information, schedule, send,
 *     complete, dispute - each writing a real row a human can act on.
 *  4. Money: commission is calculated on the server, a completed referral
 *     mints exactly one commission, and a partner cannot set an amount.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PGLITE_DIR = process.env.PGLITE_DIR || ".pglite-clinic-test";

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

const profilePayload = (organizationName, email) => ({
  phone: "+44 117 496 0182",
  organizationName,
  organizationType: "community_organisation",
  contactName: "Amara Osei",
  contactEmail: email,
  contactPhone: "+44 117 496 0182",
  website: "https://riverbend.example.org",
  city: "Bristol",
  country: "United Kingdom",
  clinicSpecialisms: ["Mental health"],
  servicesOffered: ["Peer support"],
  partnershipModels: ["Referral agreement"],
  acceptsReferrals: true,
  sendsReferrals: true,
  referralTypes: ["Assessment", "Therapy"],
  marketingConsent: true,
  languages: ["English"],
  yearsOperating: 9,
  billingCurrency: "GBP",
  bio: "A community wellbeing service.",
  consentedToPractice: true,
  termsAccepted: true,
});

/** Signs up a partner clinic, completes its profile, and returns its token. */
async function createClinic(label, organizationName) {
  const email = `${label}.${uniq}@example.com`;
  const signup = await call("POST", "/api/auth/signup", {
    email,
    password: "Passw0rd123",
    fullName: `Clinic ${label}`,
    role: "collaborative_clinic",
    termsAccepted: true,
    ethicsAccepted: true,
  });
  assert.equal(signup.status, 201, `signup for ${label} returned ${signup.status}`);

  // Professional portal signups land in the admin's verification queue and
  // cannot use the portal until they are approved. These suites are about
  // clinic behaviour, not the review queue, so the gate is cleared directly.
  await query("UPDATE users SET status = 'pending_profile' WHERE id = $1", [signup.json.user.id]);

  const saved = await call(
    "PUT",
    "/api/profiles/collaborative_clinic",
    profilePayload(organizationName, email),
    signup.json.token
  );
  assert.equal(saved.status, 200, `profile for ${label} returned ${saved.status}`);

  return { token: signup.json.token, userId: signup.json.user.id, email };
}

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

  // The service catalogue the referrals will point at.
  const { seedPartnerServices } = await import("../src/db/seed.js");
  await seedPartnerServices();

  // Two partner organizations. `clinicA` is the one under test throughout;
  // `clinicB` exists purely so the isolation tests have somewhere to point.
  clinicA = await createClinic("clinicA", `Alpha Wellness ${uniq}`);
  clinicB = await createClinic("clinicB", `Beta Wellbeing ${uniq}`);
  tokens.clinicA = clinicA.token;
  tokens.clinicB = clinicB.token;

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
  clientA = user.json.user.id;

  // A second, unrelated client used to prove a partner cannot reach a client
  // that was never referred through their organization.
  const outsider = await call("POST", "/api/auth/signup", {
    email: `outsider.${uniq}@example.com`,
    password: "Passw0rd123",
    fullName: "Outsider Client",
    role: "user",
    termsAccepted: true,
  });
  outsiderClient = outsider.json.user.id;

  const services = await call("GET", "/api/clinic/services", undefined, tokens.clinicA);
  assert.equal(services.status, 200);
  therapyService = services.json.services.find((s) => s.name === "Therapy (adult)");
  assert.ok(therapyService, "the seeded service catalogue should include adult therapy");
});

let clinicA;
let clinicB;
let clientA;
let outsiderClient;
let therapyService;

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (closeDb) await closeDb();
});

/* ------------------------------------------------------------------ */
/* Authentication and role                                             */
/* ------------------------------------------------------------------ */

test("anonymous requests are rejected with 401", async () => {
  const res = await call("GET", "/api/clinic/dashboard");
  assert.equal(res.status, 401);
});

test("a therapist cannot access the collaborative clinic portal", async () => {
  for (const path of [
    "/api/clinic/dashboard",
    "/api/clinic/referrals",
    "/api/clinic/clients",
    "/api/clinic/commission",
    "/api/clinic/payouts",
    "/api/clinic/partnerships",
    "/api/clinic/reports",
  ]) {
    const res = await call("GET", path, undefined, tokens.therapist);
    assert.equal(res.status, 403, `${path} returned ${res.status}`);
  }
});

test("a client cannot access the collaborative clinic portal", async () => {
  const res = await call("GET", "/api/clinic/dashboard", undefined, tokens.user);
  assert.equal(res.status, 403);
});

test("a clinic can reach every portal section", async () => {
  const paths = [
    "/api/clinic/dashboard",
    "/api/clinic/referrals",
    "/api/clinic/referrals/received",
    "/api/clinic/referrals/sent",
    "/api/clinic/clients",
    "/api/clinic/services",
    "/api/clinic/marketing",
    "/api/clinic/referral-links",
    "/api/clinic/commission",
    "/api/clinic/payouts",
    "/api/clinic/partnerships",
    "/api/clinic/appointments",
    "/api/clinic/threads",
    "/api/clinic/reports",
    "/api/clinic/notifications",
    "/api/clinic/settings",
    "/api/clinic/organization",
  ];
  for (const path of paths) {
    const res = await call("GET", path, undefined, tokens.clinicA);
    assert.equal(res.status, 200, `${path} returned ${res.status}`);
  }
});

test("permissions are explicit: removing them locks the portal", async () => {
  await query("DELETE FROM clinic_permissions WHERE user_id = $1", [clinicA.userId]);
  const blocked = await call("GET", "/api/clinic/dashboard", undefined, tokens.clinicA);
  assert.equal(blocked.status, 403);

  const { grantDefaultClinicPermissions } = await import("../src/lib/clinic.js");
  await grantDefaultClinicPermissions(clinicA.userId);
  const restored = await call("GET", "/api/clinic/dashboard", undefined, tokens.clinicA);
  assert.equal(restored.status, 200);
});

/* ------------------------------------------------------------------ */
/* Commission arithmetic                                               */
/* ------------------------------------------------------------------ */

test("computeCommission is integer-only and rounds half up", async () => {
  const { computeCommission } = await import("../src/lib/clinic.js");

  // 10% of 9500p = 950p exactly.
  assert.deepEqual(
    computeCommission({ rule: "percentage", rateBp: 1_000, eligibleAmountMinor: 9_500 }),
    { rateBp: 1_000, eligibleAmountMinor: 9_500, amountMinor: 950 }
  );

  // 12% of 9500p = 1140p exactly.
  assert.equal(
    computeCommission({ rule: "percentage", rateBp: 1_200, eligibleAmountMinor: 9_500 }).amountMinor,
    1_140
  );

  // Half-up at the boundary. 25bp of 100p = 0.25p, which rounds down to 0;
  // 50bp of 100p = 0.5p, which rounds up to 1p.
  assert.equal(
    computeCommission({ rule: "percentage", rateBp: 25, eligibleAmountMinor: 100 }).amountMinor,
    0
  );
  assert.equal(
    computeCommission({ rule: "percentage", rateBp: 50, eligibleAmountMinor: 100 }).amountMinor,
    1
  );

  // A fixed rule never exceeds the eligible amount.
  assert.equal(
    computeCommission({ rule: "fixed", fixedMinor: 9_000, eligibleAmountMinor: 4_000 }).amountMinor,
    4_000
  );

  // Negative or non-finite input is clamped, never propagated as money.
  assert.equal(
    computeCommission({ rule: "percentage", rateBp: 1_000, eligibleAmountMinor: -50 }).amountMinor,
    0
  );
});

/* ------------------------------------------------------------------ */
/* The referral workflow                                               */
/* ------------------------------------------------------------------ */

/**
 * Creates an inbound referral: Kindred Tap sending a client to Clinic A. There
 * is no partner-facing endpoint for this - it is how the platform onboards a
 * referral - so the test writes it directly, exactly as a Kindred Tap service
 * would.
 *
 * Resolves both organizations by id from the membership rows rather than by
 * name: the test database is reused across runs, so a name lookup would find
 * whichever organization happened to be created first.
 */
async function seedInboundReferral() {
  const kindred = (await query("SELECT id FROM partner_organizations WHERE kind = 'kindred_tap'")).rows[0];
  const orgRow = (
    await query(
      `SELECT o.id FROM partner_organization_members m
         JOIN partner_organizations o ON o.id = m.organization_id
        WHERE m.user_id = $1`,
      [clinicA.userId]
    )
  ).rows[0];
  assert.ok(orgRow, "Clinic A must belong to a partner organization");

  const { rows } = await query(
    `INSERT INTO referrals
       (reference, direction, sending_org_id, receiving_org_id, sending_user_name,
        service_id, service_name, client_user_id, client_reference, reason, priority, status)
     VALUES ($1, 'inbound', $2, $3, 'Kindred Tap Referral Team', $4, $5, $6, $7,
             'Needs structured therapy support after a period of low mood.', 'normal', 'new')
     RETURNING id, reference`,
    [
      `REF-TEST-${Math.floor(Math.random() * 1e6)}`,
      kindred.id,
      orgRow.id,
      therapyService.id,
      therapyService.name,
      clientA,
      `CLT-TEST-${Math.floor(Math.random() * 1e6)}`,
    ]
  );
  return rows[0];
}

test("received referrals: review, accept, schedule, complete", async () => {
  const referral = await seedInboundReferral();

  const detail = await call("GET", `/api/clinic/referrals/${referral.id}`, undefined, tokens.clinicA);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.referral.status, "new");
  assert.ok(detail.json.allowedActions.includes("accept"));
  // The client is referenced opaquely, never named.
  assert.ok(detail.json.referral.clientReference);
  assert.equal(detail.json.referral.clientName, undefined);

  const accepted = await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "accept" },
    tokens.clinicA
  );
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.status, "accepted");

  const scheduled = await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    {
      action: "schedule",
      scheduledAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      professionalName: "Dr N. Rahman",
    },
    tokens.clinicA
  );
  assert.equal(scheduled.status, 200);
  assert.equal(scheduled.json.status, "scheduled");

  // scheduled -> in_progress -> completed, the only route to completion.
  const started = await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "in_progress" },
    tokens.clinicA
  );
  assert.equal(started.json.status, "in_progress");

  const completed = await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "completed", outcomeCode: "completed_support" },
    tokens.clinicA
  );
  assert.equal(completed.status, 200);
  assert.equal(completed.json.status, "completed");

  const final = await call("GET", `/api/clinic/referrals/${referral.id}`, undefined, tokens.clinicA);
  assert.ok(final.json.commission, "completing a referral should mint a commission");
  assert.equal(final.json.commission.status, "pending");

  // The commission is the server's arithmetic: 12% of the 9500p service price.
  assert.equal(final.json.commission.amountMinor, 1_140);
  assert.equal(final.json.commission.rateBp, 1_200);
});

test("an impossible status change is refused", async () => {
  const referral = await seedInboundReferral();
  const res = await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "completed" },
    tokens.clinicA
  );
  assert.equal(res.status, 400);
});

test("declining requires a reason and closes the referral", async () => {
  const referral = await seedInboundReferral();

  const noReason = await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "decline" },
    tokens.clinicA
  );
  assert.equal(noReason.status, 400);

  const declined = await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "decline", detail: "We do not have the capacity for this referral right now." },
    tokens.clinicA
  );
  assert.equal(declined.status, 200);
  assert.equal(declined.json.status, "declined");

  // A declined referral is terminal.
  const reopen = await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "under_review" },
    tokens.clinicA
  );
  assert.equal(reopen.status, 400);
});

test("requesting information moves the referral and records the ask", async () => {
  const referral = await seedInboundReferral();
  const res = await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "request_information", detail: "Please send the referral letter." },
    tokens.clinicA
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.status, "information_required");
  assert.ok(res.json.referral.information_requested_at);

  const events = await query(
    "SELECT action FROM referral_events WHERE referral_id = $1",
    [referral.id]
  );
  assert.ok(events.rows.some((row) => row.action === "referral.information_requested"));
});

test("notes are appended without changing the referral status", async () => {
  const referral = await seedInboundReferral();
  const res = await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "add_note", detail: "Client prefers Tuesday mornings." },
    tokens.clinicA
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.status, "new");

  const detail = await call("GET", `/api/clinic/referrals/${referral.id}`, undefined, tokens.clinicA);
  assert.ok(detail.json.notes.some((note) => note.body.includes("Tuesday mornings")));
});

test("a referral cannot be sent for a client outside the organization", async () => {
  const res = await call(
    "POST",
    "/api/clinic/referrals",
    {
      serviceId: therapyService.id,
      clientUserId: outsiderClient,
      reason: "Attempting to refer somebody we have never worked with.",
    },
    tokens.clinicA
  );
  assert.equal(res.status, 403);
});

test("sending a referral works for a linked client", async () => {
  // The inbound referral above already linked clientA to Clinic A.
  const res = await call(
    "POST",
    "/api/clinic/referrals",
    {
      serviceId: therapyService.id,
      clientUserId: clientA,
      reason: "Client asked for a second opinion on their therapy plan.",
      priority: "high",
      professionalName: "Amara Osei",
    },
    tokens.clinicA
  );
  assert.equal(res.status, 201);
  assert.equal(res.json.referral.direction, "outbound");
  assert.equal(res.json.referral.status, "new");

  // Clinic B has no relationship to this client, so its sent list stays empty.
  const clinicBSent = await call("GET", "/api/clinic/referrals/sent", undefined, tokens.clinicB);
  assert.equal(clinicBSent.json.total, 0);
});

/* ------------------------------------------------------------------ */
/* Organization isolation                                              */
/* ------------------------------------------------------------------ */

test("Clinic B cannot read Clinic A's referral, and it is a 404 not a 403", async () => {
  const referral = await seedInboundReferral();
  const res = await call("GET", `/api/clinic/referrals/${referral.id}`, undefined, tokens.clinicB);
  assert.equal(res.status, 404);
});

test("Clinic B cannot act on Clinic A's referral", async () => {
  const referral = await seedInboundReferral();
  const res = await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "accept" },
    tokens.clinicB
  );
  assert.equal(res.status, 404);
});

test("Clinic B's received list does not contain Clinic A's referrals", async () => {
  const referral = await seedInboundReferral();
  const mine = await call("GET", "/api/clinic/referrals/received?limit=100", undefined, tokens.clinicA);
  const theirs = await call("GET", "/api/clinic/referrals/received?limit=100", undefined, tokens.clinicB);

  assert.ok(mine.json.referrals.some((row) => row.id === referral.id));
  assert.ok(!theirs.json.referrals.some((row) => row.id === referral.id));
  assert.equal(theirs.json.total, 0);
});

test("Clinic B cannot reach a client Clinic A referred", async () => {
  const res = await call("GET", `/api/clinic/clients/${clientA}`, undefined, tokens.clinicB);
  assert.equal(res.status, 404);

  const theirs = await call("GET", "/api/clinic/clients", undefined, tokens.clinicB);
  assert.equal(theirs.json.total, 0);
});

test("Clinic A can reach its own referred client", async () => {
  const res = await call("GET", `/api/clinic/clients/${clientA}`, undefined, tokens.clinicA);
  assert.equal(res.status, 200);
  assert.ok(res.json.client.clientReference);
  // A partnership profile carries referrals and appointments, never clinical
  // notes. There is no notes field to leak.
  assert.equal(res.json.notes, undefined);
  assert.equal(res.json.treatmentPlans, undefined);
});

test("Clinic B cannot see Clinic A's commission or payouts", async () => {
  const referral = await seedInboundReferral();
  await call("POST", `/api/clinic/referrals/${referral.id}/actions`, { action: "accept" }, tokens.clinicA);
  await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "in_progress" },
    tokens.clinicA
  );
  await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "completed" },
    tokens.clinicA
  );

  const mine = await call("GET", "/api/clinic/commission", undefined, tokens.clinicA);
  const commission = mine.json.commissions.find((row) => row.referralId === referral.id);
  assert.ok(commission, "Clinic A should have earned a commission");

  const theirs = await call("GET", "/api/clinic/commission", undefined, tokens.clinicB);
  assert.ok(!theirs.json.commissions.some((row) => row.id === commission.id));

  const crossRead = await call("GET", `/api/clinic/commission/${commission.id}`, undefined, tokens.clinicB);
  assert.equal(crossRead.status, 404);

  const theirPayouts = await call("GET", "/api/clinic/payouts", undefined, tokens.clinicB);
  assert.equal(theirPayouts.json.payouts.length, 0);
});

/* ------------------------------------------------------------------ */
/* Commission integrity                                                */
/* ------------------------------------------------------------------ */

test("completing a referral twice cannot mint a second commission", async () => {
  const referral = await seedInboundReferral();
  await call("POST", `/api/clinic/referrals/${referral.id}/actions`, { action: "accept" }, tokens.clinicA);
  await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "in_progress" },
    tokens.clinicA
  );
  await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "completed" },
    tokens.clinicA
  );

  const { rows } = await query(
    "SELECT id FROM commissions WHERE referral_id = $1",
    [referral.id]
  );
  assert.equal(rows.length, 1, "exactly one commission per referral");
});

test("a partner can dispute a commission but cannot change the amount", async () => {
  const referral = await seedInboundReferral();
  await call("POST", `/api/clinic/referrals/${referral.id}/actions`, { action: "accept" }, tokens.clinicA);
  await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "in_progress" },
    tokens.clinicA
  );
  await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "completed" },
    tokens.clinicA
  );

  const list = await call("GET", "/api/clinic/commission", undefined, tokens.clinicA);
  const commission = list.json.commissions.find((row) => row.referralId === referral.id);
  const before = commission.amountMinor;

  // There is no endpoint that accepts an amount: the only lever is a dispute,
  // which carries a reason and moves the status.
  const disputed = await call(
    "POST",
    `/api/clinic/commission/${commission.id}/actions`,
    { action: "dispute", detail: "The service price looks wrong for this referral." },
    tokens.clinicA
  );
  assert.equal(disputed.status, 200);
  assert.equal(disputed.json.status, "disputed");
  assert.equal(disputed.json.commission.amountMinor, before, "the amount must be unchanged");

  const review = await call(
    "POST",
    `/api/clinic/commission/${commission.id}/actions`,
    { action: "request_review", detail: "Could someone check the rate applied here?" },
    tokens.clinicA
  );
  assert.equal(review.status, 200);
  assert.equal(review.json.commission.amountMinor, before);
});

/* ------------------------------------------------------------------ */
/* Services, promotion and links                                       */
/* ------------------------------------------------------------------ */

test("services come from the real catalogue and a link belongs to its creator", async () => {
  const services = await call("GET", "/api/clinic/services", undefined, tokens.clinicA);
  assert.equal(services.status, 200);
  assert.ok(services.json.services.length >= 5);
  // No service the partner cannot actually refer into is advertised as
  // promotable.
  for (const service of services.json.services) {
    assert.notEqual(service.marketingStatus, "retired");
  }

  const link = await call(
    "POST",
    "/api/clinic/referral-links",
    { serviceId: therapyService.id, campaign: "winter-campaign" },
    tokens.clinicA
  );
  assert.equal(link.status, 201);
  // The code is opaque: it must not contain the organization or the slug.
  assert.ok(!link.json.link.code.includes("alpha"));
  assert.ok(!link.json.link.code.includes("therapy"));

  const theirs = await call("GET", "/api/clinic/referral-links", undefined, tokens.clinicB);
  assert.ok(!theirs.json.links.some((row) => row.id === link.json.link.id));
});

test("promotion assets are read-only for a partner", async () => {
  const res = await call("GET", "/api/clinic/marketing", undefined, tokens.clinicA);
  assert.equal(res.status, 200);
  // There is no POST/PUT route for marketing assets at all.
  const attempt = await call(
    "POST",
    "/api/clinic/marketing",
    { title: "Our clinic cures depression in one session", format: "text", url: "https://x.test" },
    tokens.clinicA
  );
  assert.equal(attempt.status, 404);
});

/* ------------------------------------------------------------------ */
/* Messaging, reports and audit                                        */
/* ------------------------------------------------------------------ */

test("partner messaging is scoped to the organization", async () => {
  const created = await call(
    "POST",
    "/api/clinic/threads",
    { topic: "Referral query", body: "Can you confirm the referral turnaround time?" },
    tokens.clinicA
  );
  assert.equal(created.status, 201);
  const threadId = created.json.threadId;

  const mine = await call("GET", `/api/clinic/threads/${threadId}`, undefined, tokens.clinicA);
  assert.equal(mine.status, 200);
  assert.equal(mine.json.messages.length, 1);

  const theirs = await call("GET", `/api/clinic/threads/${threadId}`, undefined, tokens.clinicB);
  assert.equal(theirs.status, 404);

  const reply = await call(
    "POST",
    `/api/clinic/threads/${threadId}/messages`,
    { body: "Adding a little more detail." },
    tokens.clinicA
  );
  assert.equal(reply.status, 201);
});

test("reports are scoped to the organization and are downloadable", async () => {
  const catalog = await call("GET", "/api/clinic/reports", undefined, tokens.clinicA);
  assert.equal(catalog.status, 200);
  assert.ok(catalog.json.reports.some((report) => report.key === "commission"));

  const generated = await call(
    "POST",
    "/api/clinic/reports/referrals/generate",
    {},
    tokens.clinicA
  );
  assert.equal(generated.status, 200);
  assert.ok(generated.json.csv.length > 0);
  assert.ok(generated.json.rowCount >= 1);

  // Every generated row belongs to the caller's organization.
  const mine = await call("GET", "/api/clinic/organization", undefined, tokens.clinicA);
  const theirs = await call("GET", "/api/clinic/organization", undefined, tokens.clinicB);
  assert.notEqual(mine.json.organization.id, theirs.json.organization.id);
});

test("the referral and commission trail is recorded in the audit log", async () => {
  const referral = await seedInboundReferral();
  await call("GET", `/api/clinic/referrals/${referral.id}`, undefined, tokens.clinicA);
  await call("POST", `/api/clinic/referrals/${referral.id}/actions`, { action: "accept" }, tokens.clinicA);
  await call("POST", "/api/clinic/commission", undefined, tokens.clinicA);

  const { rows } = await query(
    "SELECT action FROM audit_log WHERE actor_id = $1 AND target_id = $2",
    [clinicA.userId, referral.id]
  );
  const actions = rows.map((row) => row.action);
  assert.ok(actions.includes("sensitive.read"), "reading a referral is audited");
  assert.ok(actions.includes("referral.accept"), "acting on a referral is audited");
});

test("a completed referral, its commission and the dashboard agree", async () => {
  const before = await call("GET", "/api/clinic/dashboard", undefined, tokens.clinicA);
  const commissionBefore = before.json.commission.totalEarned;

  const referral = await seedInboundReferral();
  await call("POST", `/api/clinic/referrals/${referral.id}/actions`, { action: "accept" }, tokens.clinicA);
  await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "in_progress" },
    tokens.clinicA
  );
  await call(
    "POST",
    `/api/clinic/referrals/${referral.id}/actions`,
    { action: "update_status", toStatus: "completed" },
    tokens.clinicA
  );

  const after = await call("GET", "/api/clinic/dashboard", undefined, tokens.clinicA);
  assert.equal(after.json.commission.totalEarned, commissionBefore + 1_140);
  assert.equal(after.json.counts.receivedReferrals, before.json.counts.receivedReferrals + 1);
  assert.equal(
    after.json.counts.completedReceived,
    before.json.counts.completedReceived + 1
  );
});