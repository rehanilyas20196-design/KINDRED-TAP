/**
 * Collaborative Clinic portal permissions and shared helpers.
 *
 * The same two rules the Clinical Advisor and Clinic Supervisor portals follow,
 * applied to a third role and a fourth permission table:
 *
 *  1. A permission is a row, not a role assumption. Holding the
 *     `collaborative_clinic` role gets you the portal; what you may do inside it
 *     comes from `clinic_permissions`. The sidebar is a convenience, never the
 *     boundary - every route re-checks.
 *
 *  2. Nothing is granted by accident. `DEFAULT_CLINIC_PERMISSIONS` is the whole
 *     operational set a new partner clinic starts with. Notably absent:
 *     anything that would let a partner set its own commission rate, approve
 *     its own commission, or edit an agreement. Those are Kindred Tap's calls,
 *     not the partner's, so no permission here unlocks them.
 *
 * Three things in here are load-bearing and used from more than one route:
 *
 *  - `requireClinic` plus `clinicOrgFor(req)`, which resolve the caller's
 *    organization from *membership*, never from a request parameter. That is
 *    what makes cross-organization isolation a property of the query rather
 *    than of the frontend.
 *  - `computeCommission`, the only place an amount is calculated. Routes call
 *    it; nothing in the web app is trusted to.
 *  - `newOpaqueCode`, which produces referral links and references. They are
 *    random, not derived from a name, and carry no client information.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, queryOne } from "../db/index.js";
import { badRequest, forbidden, notFound } from "../middleware/asyncHandler.js";
import { notify } from "./notifications.js";

export const CLINIC_ROLE = "collaborative_clinic";

/** Every permission the Collaborative Clinic portal understands (spec order). */
export const CLINIC_PERMISSIONS = [
  "collaborative_clinic.dashboard.view",

  "referrals.view",
  "referrals.create",
  "referrals.update",
  "referrals.accept",
  "referrals.decline",
  "referrals.request_information",

  "clients.view",
  "clients.track",

  "services.view",
  "services.promote",

  "partnerships.view",
  "partnerships.manage",

  "commission.view",
  "commission.request_review",
  "commission.dispute",
  "commission.statement",

  "payouts.view",

  "appointments.view",
  "appointments.manage",

  "messages.view",
  "messages.send",

  "reports.view",
  "reports.generate",

  "organization.view",
  "organization.manage",
];

export const CLINIC_PERMISSION_LABELS = {
  "collaborative_clinic.dashboard.view": "View the collaborative clinic dashboard",
  "referrals.view": "View referrals",
  "referrals.create": "Send referrals",
  "referrals.update": "Update referral status",
  "referrals.accept": "Accept referrals",
  "referrals.decline": "Decline referrals",
  "referrals.request_information": "Request referral information",
  "clients.view": "View partner clients",
  "clients.track": "Track referred clients",
  "services.view": "View available services",
  "services.promote": "Promote services",
  "partnerships.view": "View partnerships",
  "partnerships.manage": "Manage partnerships",
  "commission.view": "View commission",
  "commission.request_review": "Request a commission review",
  "commission.dispute": "Dispute a commission",
  "commission.statement": "Download commission statements",
  "payouts.view": "View payouts",
  "appointments.view": "View referral appointments",
  "appointments.manage": "Manage referral appointments",
  "messages.view": "Read partner messages",
  "messages.send": "Send partner messages",
  "reports.view": "View reports",
  "reports.generate": "Generate reports",
  "organization.view": "View the organization profile",
  "organization.manage": "Update the organization profile",
};

/** What a new partner clinic starts with: the whole operational set. */
export const DEFAULT_CLINIC_PERMISSIONS = [...CLINIC_PERMISSIONS];

/* ------------------------------------------------------------------ */
/* Referral and commission vocabularies                                 */
/* ------------------------------------------------------------------ */

export const REFERRAL_STATUSES = [
  "new",
  "under_review",
  "information_required",
  "accepted",
  "declined",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "closed",
];

/**
 * Which status changes a referral may legally make. Anything not listed here is
 * refused with a 400 rather than silently applied, so the workflow cannot be
 * walked sideways - `completed` in particular may only be reached from the
 * statuses a clinician would actually pass through.
 */
export const REFERRAL_TRANSITIONS = {
  new: ["under_review", "information_required", "accepted", "declined", "cancelled"],
  under_review: ["information_required", "accepted", "declined", "cancelled"],
  information_required: ["under_review", "accepted", "declined", "cancelled"],
  accepted: ["scheduled", "in_progress", "cancelled", "declined"],
  scheduled: ["in_progress", "cancelled", "accepted"],
  in_progress: ["completed", "cancelled"],
  completed: ["closed"],
  declined: [],
  cancelled: ["closed"],
  closed: [],
};

export const COMMISSION_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "scheduled",
  "paid",
  "cancelled",
  "disputed",
];

/** Statuses a commission may be in before it can be pulled into a payout. */
export const PAYOUT_ELIGIBLE_COMMISSION = ["approved", "scheduled"];

/* ------------------------------------------------------------------ */
/* Validation helpers                                                   */
/* ------------------------------------------------------------------ */

const uuidSchema = z.string().uuid();

/** Validates a UUID path parameter, answering 400 rather than letting SQL see it. */
export function uuidParam(value, label) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw badRequest(`${label} is not a valid id`);
  return parsed.data;
}

/** Optional free text that normalises an empty value to null. */
export const textOrNull = (max = 8000) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

/** `2026-10-05` style date, or null when cleared. */
export const dateOrNull = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .nullable()
  .optional();

/* ------------------------------------------------------------------ */
/* References and opaque codes                                          */
/* ------------------------------------------------------------------ */

/**
 * A human-quotable queue reference: `REF-2026-483920`, `COM-...`, `PAY-...`.
 *
 * Random rather than sequential so two records raised in the same second
 * cannot collide; the column is UNIQUE, so a collision is a failed insert
 * rather than a duplicate record.
 */
export function newReference(prefix) {
  const year = new Date().getFullYear();
  const suffix = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return `${prefix}-${year}-${suffix}`;
}

/**
 * The opaque identifier behind a referral link.
 *
 * Uses `crypto.randomUUID` rather than `Math.random` because this value lives in
 * a URL that anybody may see. It is deliberately not derived from the
 * organization name, slug or id: a code that encodes its organization would let
 * anyone enumerate every partner in the system, and the whole point is that the
 * code identifies a link and nothing more.
 */
export function newOpaqueCode() {
  return randomUUID().replace(/-/g, "");
}

/* ------------------------------------------------------------------ */
/* Money                                                                */
/* ------------------------------------------------------------------ */

/**
 * The commission for one referral, computed on the server.
 *
 * `rate_bp` is basis points (100 = 1%) so the arithmetic is integer-only: no
 * float ever touches money. The result is rounded half-up to the nearest minor
 * unit, and the frozen `rate_bp` is returned alongside it so the row can record
 * the rule that was in force at the moment of calculation rather than
 * re-deriving it later from a service that may since have changed.
 *
 * @param {{ rule: 'percentage' | 'fixed',
 *           rateBp: number,
 *           fixedMinor?: number,
 *           eligibleAmountMinor: number }} input
 * @returns {{ rateBp: number, eligibleAmountMinor: number, amountMinor: number }}
 */
export function computeCommission({ rule, rateBp, fixedMinor = 0, eligibleAmountMinor }) {
  const rate = Number.isFinite(rateBp) ? Math.max(0, Math.min(10_000, Math.trunc(rateBp))) : 0;
  const eligible = Number.isFinite(eligibleAmountMinor)
    ? Math.max(0, Math.trunc(eligibleAmountMinor))
    : 0;

  if (rule === "fixed") {
    const amount = Math.max(0, Math.min(eligible, Math.trunc(fixedMinor || 0)));
    return { rateBp: 0, eligibleAmountMinor: eligible, amountMinor: amount };
  }

  // Integer half-up rounding: floor(value/2 + 0.5) without leaving integers.
  const raw = (eligible * rate + 5_000) / 10_000;
  const amount = Math.max(0, Math.floor(raw));
  return { rateBp: rate, eligibleAmountMinor: eligible, amountMinor: amount };
}

/**
 * Formats minor units as a currency string. Presentation only - every decision
 * about an amount was already made in `computeCommission`.
 */
export function formatMinor(amountMinor, currency = "GBP") {
  const amount = (Number(amountMinor) || 0) / 100;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/* ------------------------------------------------------------------ */
/* Permissions                                                          */
/* ------------------------------------------------------------------ */

/** Permissions held by one user, as a Set for O(1) checks. */
export async function clinicPermissionsFor(userId) {
  const { rows } = await query(
    "SELECT permission FROM clinic_permissions WHERE user_id = $1",
    [userId]
  );
  return new Set(rows.map((row) => row.permission));
}

export async function hasClinicPermission(userId, permission) {
  const row = await queryOne(
    "SELECT 1 AS held FROM clinic_permissions WHERE user_id = $1 AND permission = $2",
    [userId, permission]
  );
  return Boolean(row);
}

/** Seeds the default set. Safe to call more than once. */
export async function grantDefaultClinicPermissions(userId, grantedBy = null) {
  for (const permission of DEFAULT_CLINIC_PERMISSIONS) {
    await query(
      `INSERT INTO clinic_permissions (user_id, permission, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [userId, permission, grantedBy]
    );
  }
}

/** Throws 403 unless the signed-in account is a collaborative clinic. */
export function checkClinic(req) {
  if (req.user?.role !== CLINIC_ROLE) {
    throw forbidden("Only collaborative clinic partners can use the partnership portal");
  }
}

/**
 * Route middleware: 403 unless the signed-in account is a partner clinic that
 * holds `permission`. The role is checked before any permission row is read, so
 * a URL can never grant this portal to a therapist.
 */
export function requireClinicPermission(permission, message) {
  return async (req, res, next) => {
    try {
      if (req.user?.role !== CLINIC_ROLE) {
        throw forbidden("Only collaborative clinic partners can use the partnership portal");
      }
      const held = await hasClinicPermission(req.user.id, permission);
      if (!held) {
        throw forbidden(
          message ??
            `You do not have permission to ${CLINIC_PERMISSION_LABELS[permission] ?? permission}.`
        );
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Same guard, for a route where any one of several permissions unlocks it. */
export function requireAnyClinicPermission(permissions, message) {
  return async (req, res, next) => {
    try {
      if (req.user?.role !== CLINIC_ROLE) {
        throw forbidden("Only collaborative clinic partners can use the partnership portal");
      }
      const held = await clinicPermissionsFor(req.user.id);
      if (!permissions.some((permission) => held.has(permission))) {
        throw forbidden(message ?? "You do not have permission to view this record.");
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Loads the caller's permission set, throwing 403 if `permission` is missing.
 * Used inside handlers that already hold the role check.
 */
export async function assertPermission(req, permission, label) {
  const held = await clinicPermissionsFor(req.user.id);
  if (!held.has(permission)) {
    throw forbidden(`You do not have permission to ${label ?? CLINIC_PERMISSION_LABELS[permission] ?? permission}.`);
  }
  return held;
}

/* ------------------------------------------------------------------ */
/* Organization isolation                                               */
/* ------------------------------------------------------------------ */

/**
 * The caller's own partner organization, resolved from membership.
 *
 * This is the spine of isolation. No route may accept an organization id from
 * the client and read rows under it; it calls this instead, so a request for
 * `?org=<somebody else>` is structurally impossible rather than merely
 * filtered out. `primary` membership wins, then the oldest membership, so a
 * user who belongs to two organizations always resolves deterministically.
 *
 * Returns the organization row with `memberRole` attached.
 */
export async function clinicOrgFor(req) {
  const row = await queryOne(
    `SELECT o.id, o.slug, o.name, o.kind, o.organization_type AS "organizationType",
            o.status, o.city, o.country, o.registration_number AS "registrationNumber",
            m.member_role AS "memberRole"
       FROM partner_organization_members m
       JOIN partner_organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1
        AND m.is_active
      ORDER BY (m.member_role = 'primary') DESC, m.added_at
      LIMIT 1`,
    [req.user.id]
  );
  if (!row) {
    throw notFound(
      "Your account is not linked to a partner organization yet. Contact Kindred Tap to have your partnership set up."
    );
  }
  return row;
}

/** Every organization the caller belongs to - used for read filters only. */
export async function clinicOrgIdsFor(userId) {
  const { rows } = await query(
    "SELECT organization_id FROM partner_organization_members WHERE user_id = $1 AND is_active",
    [userId]
  );
  return rows.map((row) => row.organization_id);
}

/** Throws 403 unless the caller belongs to `organizationId`. */
export async function assertMemberOf(organizationId, userId) {
  const row = await queryOne(
    `SELECT 1 AS member FROM partner_organization_members
      WHERE organization_id = $1 AND user_id = $2 AND is_active`,
    [organizationId, userId]
  );
  if (!row) throw forbidden("That record belongs to another organization");
  return true;
}

/**
 * The Kindred Tap side of every partnership: the organization row every
 * outbound referral and every commission is measured against. Cached per
 * process because it changes only when Kindred Tap changes it.
 */
let kindredOrgCache = null;

export async function kindredOrg() {
  if (kindredOrgCache) return kindredOrgCache;
  const row =
    (await queryOne(
      "SELECT id, slug, name, status FROM partner_organizations WHERE kind = 'kindred_tap' LIMIT 1"
    )) ??
    (await queryOne(
      `INSERT INTO partner_organizations (slug, name, kind, status)
       VALUES ('kindred-tap', 'Kindred Tap', 'kindred_tap', 'active')
       RETURNING id, slug, name, status`
    ));
  kindredOrgCache = row;
  return row;
}

/**
 * Makes sure the account has a partner organization to belong to, creating it
 * from the completed clinic profile the first time.
 *
 * Called from the profile route, so a clinic that has finished onboarding is
 * never left without an organization. Idempotent: a second call finds the
 * existing membership and changes nothing, which matters because re-saving a
 * profile is normal.
 *
 * The slug is derived from the organization name only to make the admin-facing
 * row readable. It is never used in a referral link - those carry an opaque
 * random code - and it is unique-constrained with a random suffix fallback so
 * two clinics with similar names cannot collide.
 */
export async function ensurePartnerOrganization(userId) {
  const existing = await queryOne(
    `SELECT m.organization_id FROM partner_organization_members m
      WHERE m.user_id = $1 AND m.is_active
      ORDER BY (m.member_role = 'primary') DESC, m.added_at
      LIMIT 1`,
    [userId]
  );
  if (existing) return existing.organization_id;

  const profile = await queryOne(
    `SELECT organization_name     AS "organizationName",
            organization_type     AS "organizationType",
            contact_name          AS "contactName",
            contact_email         AS "contactEmail",
            contact_phone         AS "contactPhone",
            website, city, country,
            registration_number   AS "registrationNumber"
       FROM collaborative_clinic_profiles
      WHERE user_id = $1`,
    [userId]
  );
  if (!profile?.organizationName) {
    throw badRequest("Complete your organization details first");
  }

  const name = profile.organizationName;
  const slugBase =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "partner";

  let org = null;
  for (let attempt = 0; attempt < 5 && !org; attempt += 1) {
    const slug = attempt === 0 ? slugBase : `${slugBase}-${randomUUID().slice(0, 6)}`;
    const { rows } = await query(
      `INSERT INTO partner_organizations
         (slug, name, kind, organization_type, status, contact_name, contact_email,
          contact_phone, website, city, country, registration_number)
       VALUES ($1, $2, 'partner', $3, 'pending', $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [
        slug,
        name,
        profile.organizationType ?? null,
        profile.contactName ?? null,
        profile.contactEmail ?? null,
        profile.contactPhone ?? null,
        profile.website ?? null,
        profile.city ?? null,
        profile.country ?? null,
        profile.registrationNumber ?? null,
      ]
    );
    org = rows[0] ?? null;
  }
  if (!org) throw badRequest("Could not set up your partner organization. Please try again.");

  await query(
    `INSERT INTO partner_organization_members (organization_id, user_id, member_role)
     VALUES ($1, $2, 'primary')
     ON CONFLICT DO NOTHING`,
    [org.id, userId]
  );

  return org.id;
}

/**
 * Fetches one referral, scoped to the caller's organization on whichever side of
 * the referral they sit.
 *
 * The WHERE clause is the isolation. A referral belonging to Clinic A simply is
 * not in the result set for Clinic B, so there is no branch of the code that
 * can accidentally leak it, and the 404 carries no information about whether
 * the referral exists on the other side.
 */
export async function findReferralForOrg(referralId, organizationId) {
  return queryOne(
    `SELECT id, reference, direction,
            sending_org_id                     AS "sendingOrgId",
            receiving_org_id                   AS "receivingOrgId",
            sending_user_id                    AS "sendingUserId",
            sending_user_name                  AS "sendingUserName",
            sending_professional               AS "sendingProfessional",
            service_id                         AS "serviceId",
            service_name                       AS "serviceName",
            partnership_id                     AS "partnershipId",
            referral_link_id                   AS "referralLinkId",
            client_user_id                     AS "clientUserId",
            client_reference                   AS "clientReference",
            client_alias                       AS "clientAlias",
            reason, relevant_information        AS "relevantInformation",
            priority, status,
            assigned_professional_id           AS "assignedProfessionalId",
            assigned_professional_name         AS "assignedProfessionalName",
            outcome_code                       AS "outcomeCode",
            information_requested_at           AS "informationRequestedAt",
            decline_reason                     AS "declineReason",
            accepted_at                        AS "acceptedAt",
            scheduled_at                       AS "scheduledAt",
            completed_at                       AS "completedAt",
            closed_at                          AS "closedAt",
            created_at                         AS "createdAt",
            updated_at                         AS "updatedAt"
       FROM referrals
      WHERE id = $1
        AND (receiving_org_id = $2 OR sending_org_id = $2)`,
    [referralId, organizationId]
  );
}

/**
 * Same scoping for a commission.
 *
 * Aliased rather than `SELECT *` so every read of a commission - list, detail,
 * action response - has the same camelCase shape the rest of the API returns.
 */
export async function findCommissionForOrg(commissionId, organizationId) {
  return queryOne(
    `SELECT id, reference,
            referral_id                       AS "referralId",
            earning_org_id                    AS "earningOrgId",
            partnership_id                    AS "partnershipId",
            service_id                        AS "serviceId",
            service_name                      AS "serviceName",
            client_reference                  AS "clientReference",
            referral_date                     AS "referralDate",
            rule,
            rate_bp                           AS "rateBp",
            eligible_amount_minor             AS "eligibleAmountMinor",
            amount_minor                      AS "amountMinor",
            currency, status,
            approved_by                       AS "approvedBy",
            approved_at                       AS "approvedAt",
            payout_id                         AS "payoutId",
            paid_at                           AS "paidAt",
            dispute_reason                    AS "disputeReason",
            created_at                        AS "createdAt",
            updated_at                        AS "updatedAt"
       FROM commissions
      WHERE id = $1 AND earning_org_id = $2`,
    [commissionId, organizationId]
  );
}

/* ------------------------------------------------------------------ */
/* Activity trails                                                      */
/* ------------------------------------------------------------------ */

/**
 * Writes one line on a referral's timeline. Fire-and-forget from the caller's
 * point of view: the action already happened, so a failed trail write logs a
 * warning rather than turning a 200 into a 500.
 */
export async function recordReferralEvent(input) {
  try {
    await query(
      `INSERT INTO referral_events
         (referral_id, actor_id, actor_name, actor_role, action, detail, from_status, to_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.referralId,
        input.actorId ?? null,
        input.actorName ?? null,
        input.actorRole ?? null,
        input.action,
        input.detail ?? null,
        input.fromStatus ?? null,
        input.toStatus ?? null,
      ]
    );
  } catch (err) {
    console.warn(`[referral-event] skipped ${input.action}: ${err.message}`);
  }
}

/** Same idea for a commission's financial trail. */
export async function recordCommissionEvent(input) {
  try {
    await query(
      `INSERT INTO commission_events
         (commission_id, actor_id, actor_role, action, detail, from_status, to_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.commissionId,
        input.actorId ?? null,
        input.actorRole ?? null,
        input.action,
        input.detail ?? null,
        input.fromStatus ?? null,
        input.toStatus ?? null,
      ]
    );
  } catch (err) {
    console.warn(`[commission-event] skipped ${input.action}: ${err.message}`);
  }
}

/** Tells every member of an organization about something. */
export async function notifyOrgMembers(organizationId, input) {
  try {
    const { rows } = await query(
      `SELECT user_id FROM partner_organization_members
        WHERE organization_id = $1 AND is_active`,
      [organizationId]
    );
    for (const row of rows) {
      await notify({ ...input, userId: row.user_id });
    }
  } catch (err) {
    console.warn(`[notify] skipped partner organization broadcast: ${err.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* Commission eligibility                                               */
/* ------------------------------------------------------------------ */

/**
 * Creates the commission a completed referral has earned, or returns the one
 * that already exists.
 *
 * Runs inside the caller's transaction so the commission and the status change
 * that justified it commit together. The duplicate guard is the unique
 * constraint on (referral_id, earning_org_id): a second attempt raises 23505,
 * which is caught here and answered with the existing row rather than a second
 * payment. Walking a referral through `completed` twice therefore cannot mint a
 * second commission, and the amount comes from `computeCommission` under the
 * service rule that was in force at this moment.
 *
 * Who earns: the partner that made the eligible referral, which is the
 * `sending_org` of an outbound referral or the `receiving_org` of an inbound
 * one. The decision is made from the referral row the server itself wrote, not
 * from anything the browser supplies at conversion time.
 */
export async function ensureCommissionForReferral(
  referral,
  { tx = null, actorId = null } = {}
) {
  const run = tx ? tx.query.bind(tx) : query;

  const existing = await (tx ? tx.query.bind(tx) : query)(
    "SELECT * FROM commissions WHERE referral_id = $1 AND earning_org_id = $2 LIMIT 1",
    [referral.id, referral.earningOrgId]
  ).then((r) => r.rows[0] ?? null);
  if (existing) return { commission: existing, created: false };

  const service = referral.serviceId
    ? await run(
        `SELECT name, price_minor AS "priceMinor", price_currency AS "priceCurrency",
                commission_rule AS rule, commission_rate_bp AS "rateBp",
                commission_fixed_minor AS "fixedMinor"
           FROM partner_services WHERE id = $1`,
        [referral.serviceId]
      ).then((r) => r.rows[0] ?? null)
    : null;

  const rule = service?.rule ?? "fixed";
  const rateBp = service?.rateBp ?? 0;
  const fixedMinor = service?.fixedMinor ?? 0;
  const eligibleAmountMinor = service?.priceMinor ?? 0;

  const { amountMinor } = computeCommission({ rule, rateBp, fixedMinor, eligibleAmountMinor });

  try {
    const { rows } = await run(
      `INSERT INTO commissions
         (reference, referral_id, earning_org_id, partnership_id, service_id, service_name,
          client_reference, referral_date, rule, rate_bp, eligible_amount_minor,
          amount_minor, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
       RETURNING *`,
      [
        newReference("COM"),
        referral.id,
        referral.earningOrgId,
        referral.partnershipId ?? referral.partnership_id ?? null,
        referral.serviceId ?? null,
        referral.serviceName ?? referral.service_name,
        referral.clientReference ?? referral.client_reference,
        new Date().toISOString().slice(0, 10),
        rule,
        rateBp,
        eligibleAmountMinor,
        amountMinor,
        service?.priceCurrency ?? "GBP",
      ]
    );
    return { commission: rows[0], created: true };
  } catch (err) {
    if (err?.code === "23505") {
      const raced = await run(
        "SELECT * FROM commissions WHERE referral_id = $1 AND earning_org_id = $2 LIMIT 1",
        [referral.id, referral.earningOrgId]
      );
      if (raced.rows[0]) return { commission: raced.rows[0], created: false };
    }
    throw err;
  }
}

