/**
 * Collaborative Clinic portal: dashboard, referrals in both directions, referral
 * detail and the referral workflow.
 *
 * Four rules shape this file:
 *
 *  1. Every route answers to the `collaborative_clinic` role and a permission
 *     row. The role comes from the session, never the URL, so a therapist who
 *     edits the address bar still gets a 403.
 *
 *  2. Organization isolation is enforced in the query, not in the frontend.
 *     `clinicOrgFor(req)` resolves the caller's organization from membership, so
 *     a request can never nominate whose data to read. Every list filters on
 *     that id and every detail goes through `findReferralForOrg`, which folds
 *     the same predicate into the WHERE clause. A cross-organization read is a
 *     404, not a 403: a partner must not be able to learn that a record exists
 *     on the other side.
 *
 *  3. Minimum necessary. A referral carries an opaque `client_reference` for
 *     display and never a name, email or profile. Nothing here joins to
 *     `user_profiles` or to any clinical table. This is a partnership tracker,
 *     not a record reader.
 *
 *  4. Money is never computed in a browser. `ensureCommissionForReferral` runs
 *     inside the same transaction as the status change that made a referral
 *     eligible, and the amount comes from `computeCommission` in lib/clinic.js.
 *
 * Routed at /api/clinic together with clinicOps.routes.js.
 */

import { Router } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../db/index.js";
import {
  asyncHandler,
  badRequest,
  conflict,
  forbidden,
  notFound,
  parse,
} from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { AUDIT_ACTIONS, logAudit } from "../lib/audit.js";
import {
  assertPermission,
  clinicOrgFor,
  ensureCommissionForReferral,
  findReferralForOrg,
  kindredOrg,
  newReference,
  notifyOrgMembers,
  recordReferralEvent,
  REFERRAL_TRANSITIONS,
  requireClinicPermission,
  textOrNull,
  uuidParam,
} from "../lib/clinic.js";

export const clinicRouter = Router();

clinicRouter.use(requireAuth);

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Referral columns. Deliberately free of anything that identifies a client. */
const REFERRAL_COLUMNS = `
  r.id,
  r.reference,
  r.direction,
  r.service_name                        AS "serviceName",
  r.service_id                          AS "serviceId",
  r.client_reference                    AS "clientReference",
  r.client_alias                        AS "clientAlias",
  r.reason,
  r.priority,
  r.status,
  r.outcome_code                        AS "outcomeCode",
  r.information_requested_at            AS "informationRequestedAt",
  r.decline_reason                      AS "declineReason",
  r.accepted_at                         AS "acceptedAt",
  r.scheduled_at                        AS "scheduledAt",
  r.completed_at                        AS "completedAt",
  r.closed_at                           AS "closedAt",
  r.created_at                          AS "createdAt",
  r.updated_at                          AS "updatedAt",
  sending.name                          AS "sendingOrganization",
  receiving.name                        AS "receivingOrganization",
  r.sending_professional                 AS "sendingProfessional",
  r.assigned_professional_name           AS "assignedProfessional",
  r.sending_org_id                      AS "sendingOrgId",
  r.receiving_org_id                    AS "receivingOrgId",
  (SELECT a.status FROM referral_appointments a
    WHERE a.referral_id = r.id
    ORDER BY a.scheduled_at DESC LIMIT 1) AS "appointmentStatus",
  (SELECT min(a.scheduled_at) FROM referral_appointments a
    WHERE a.referral_id = r.id
      AND a.status IN ('scheduled', 'confirmed')
      AND a.scheduled_at >= now())       AS "nextAppointmentAt"
`;

/**
 * Referral list with filtering, search and pagination.
 *
 * `limit` is clamped here rather than trusted, so a partner asking for 100 000
 * rows gets a page instead. `direction` decides which queue is read; `view`
 * narrows further and never widens.
 */
async function referralList({ organizationId, direction, view, q, status, serviceId, from, to, limit, offset }) {
  const params = [organizationId];
  const where = [
    direction === "inbound"
      ? "r.receiving_org_id = $1"
      : direction === "outbound"
        ? "r.sending_org_id = $1"
        : "(r.receiving_org_id = $1 OR r.sending_org_id = $1)",
  ];
  const push = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (status) where.push(`r.status = ${push(status)}`);
  if (serviceId) where.push(`r.service_id = ${push(serviceId)}`);
  if (from) where.push(`r.created_at >= ${push(from)}::date`);
  if (to) where.push(`r.created_at < (${push(to)}::date + interval '1 day')`);

  // Search covers the referral reference, the opaque client reference and the
  // service name. It deliberately does not match client identity, because the
  // portal does not hold it - and must not acquire it through a search box.
  if (q) {
    const pattern = push(`%${q}%`);
    where.push(
      `(r.reference ILIKE ${pattern} OR r.client_reference ILIKE ${pattern} OR r.service_name ILIKE ${pattern})`
    );
  }

  if (view === "active") where.push(`r.status NOT IN ('completed', 'closed', 'declined', 'cancelled')`);
  else if (view === "completed") where.push(`r.status IN ('completed', 'closed')`);
  else if (view === "declined") where.push(`r.status = 'declined'`);
  else if (view === "cancelled") where.push(`r.status = 'cancelled'`);
  else if (view === "pending") where.push(`r.status IN ('new', 'under_review', 'information_required')`);

  const clause = where.join(" AND ");
  const take = Math.min(Math.max(limit, 1), 100);
  const skip = Math.max(offset, 0);

  const [list, counts] = await Promise.all([
    query(
      `SELECT ${REFERRAL_COLUMNS}
         FROM referrals r
         JOIN partner_organizations sending   ON sending.id = r.sending_org_id
         JOIN partner_organizations receiving ON receiving.id = r.receiving_org_id
        WHERE ${clause}
        ORDER BY r.created_at DESC
        LIMIT ${take} OFFSET ${skip}`,
      params
    ),
    query(`SELECT count(*)::int AS total FROM referrals r WHERE ${clause}`, params),
  ]);

  return {
    referrals: list.rows,
    total: counts.rows[0]?.total ?? 0,
    limit: take,
    offset: skip,
  };
}

const parseListQuery = (raw) =>
  parse(
    z.object({
      direction: z.enum(["inbound", "outbound", "all"]).optional().default("all"),
      view: z.enum(["all", "active", "completed", "declined", "cancelled", "pending"]).optional().default("all"),
      status: z.string().trim().max(40).optional(),
      serviceId: z.string().uuid().optional(),
      q: z.string().trim().max(120).optional(),
      from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.coerce.number().int().positive().max(200).optional().default(25),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }),
    raw
  );

/**
 * Which actions this organization may take on this referral, derived from the
 * side it sits on. Returned to the client so the UI shows exactly the buttons
 * the API will honour rather than a hopeful subset.
 */
function allowedActions(referral, orgId) {
  const receiving = referral.receivingOrgId === orgId;
  const open = !["completed", "closed", "declined", "cancelled"].includes(referral.status);
  const actions = [];

  if (receiving && open) {
    actions.push("accept", "decline", "request_information", "assign", "schedule", "update_status", "add_note", "refer_back");
  }
  if (open) actions.push("add_note");
  if (["accepted", "scheduled", "in_progress", "completed"].includes(referral.status)) {
    actions.push("close_referral");
  }
  return actions;
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

/**
 * Every figure is a count or a SUM over rows belonging to this organization.
 * Nothing is stored pre-aggregated and nothing is computed in the browser, so
 * the numbers cannot drift from the referral and commission tables.
 */
clinicRouter.get(
  "/dashboard",
  requireClinicPermission("collaborative_clinic.dashboard.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const kindred = await kindredOrg();
    const orgId = org.id;

    const [
      referralCounts,
      clientStats,
      commissionStats,
      partnershipRow,
      recentReferrals,
      recentClients,
      recentCommissions,
      upcoming,
      unread,
    ] = await Promise.all([
      query(
        `SELECT
           count(*) FILTER (WHERE receiving_org_id = $1)::int                                        AS "receivedTotal",
           count(*) FILTER (WHERE sending_org_id = $1)::int                                           AS "sentTotal",
           count(*) FILTER (WHERE receiving_org_id = $1 AND status IN ('new','under_review','information_required'))::int
                                                                                                     AS "receivedPending",
           count(*) FILTER (WHERE sending_org_id = $1 AND status IN ('new','under_review','information_required'))::int
                                                                                                     AS "sentPending",
           count(*) FILTER (WHERE receiving_org_id = $1 AND status = 'completed')::int                 AS "completedReceived",
           count(*) FILTER (WHERE sending_org_id = $1 AND status = 'completed')::int                    AS "completedSent",
           count(*) FILTER (WHERE receiving_org_id = $1 AND status = 'declined')::int                  AS "declinedReceived",
           count(*) FILTER (WHERE receiving_org_id = $1 AND status = 'information_required')::int     AS "informationRequired",
           count(*) FILTER (WHERE receiving_org_id = $1
                             AND status IN ('accepted','scheduled')
                             AND NOT EXISTS (SELECT 1 FROM referral_appointments a
                                              WHERE a.referral_id = referrals.id
                                                AND a.status IN ('scheduled','confirmed')
                                                AND a.scheduled_at >= now()))::int                 AS "acceptedUnscheduled",
           count(*) FILTER (WHERE receiving_org_id = $1 AND status = 'completed'
                             AND created_at >= date_trunc('month', now()))::int                      AS "completedThisMonth"
           FROM referrals
          WHERE receiving_org_id = $1 OR sending_org_id = $1`,
        [orgId]
      ),
      query(
        `WITH tracked AS (
           SELECT DISTINCT ON (client_user_id) client_user_id, status
             FROM referrals
            WHERE client_user_id IS NOT NULL
              AND (sending_org_id = $1 OR receiving_org_id = $1)
            ORDER BY client_user_id, created_at DESC
         )
         SELECT count(*)::int                                                                   AS "activeClients",
                count(*) FILTER (WHERE status IN ('completed','closed'))::int                    AS "completedClients",
                count(*) FILTER (WHERE status IN ('accepted','scheduled','in_progress'))::int   AS "inProgressClients"
           FROM tracked`,
        [orgId]
      ),
      query(
        `SELECT
           coalesce(sum(amount_minor), 0)::int                                                AS "totalEarned",
           coalesce(sum(amount_minor) FILTER (WHERE status IN ('pending','under_review')), 0)::int
                                                                                               AS "pendingAmount",
           coalesce(sum(amount_minor) FILTER (WHERE status IN ('approved','scheduled')), 0)::int
                                                                                               AS "approvedAmount",
           coalesce(sum(amount_minor) FILTER (WHERE status = 'paid'), 0)::int                   AS "paidAmount",
           coalesce(sum(amount_minor) FILTER (WHERE status IN ('cancelled','disputed')), 0)::int
                                                                                               AS "cancelledAmount",
           count(*) FILTER (WHERE status IN ('pending','under_review','disputed'))::int        AS "needsAttention",
           coalesce(sum(amount_minor) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::int
                                                                                               AS "thisMonth",
           coalesce(sum(amount_minor) FILTER (WHERE created_at >= date_trunc('quarter', now())), 0)::int
                                                                                               AS "thisQuarter",
           coalesce(sum(amount_minor) FILTER (WHERE created_at >= date_trunc('year', now())), 0)::int
                                                                                               AS "thisYear"
           FROM commissions WHERE earning_org_id = $1`,
        [orgId]
      ),
      query(
        `SELECT id, name, status, renewal_date AS "renewalDate",
                CASE WHEN renewal_date IS NOT NULL THEN (renewal_date - CURRENT_DATE)::int ELSE NULL END
                  AS "daysToRenewal"
           FROM partnerships
          WHERE partner_org_id = $1 AND status IN ('active', 'paused')
          ORDER BY renewal_date NULLS LAST
          LIMIT 1`,
        [orgId]
      ),
      query(
        `SELECT ${REFERRAL_COLUMNS}
           FROM referrals r
           JOIN partner_organizations sending   ON sending.id = r.sending_org_id
           JOIN partner_organizations receiving ON receiving.id = r.receiving_org_id
          WHERE r.receiving_org_id = $1 OR r.sending_org_id = $1
          ORDER BY r.created_at DESC
          LIMIT 5`,
        [orgId]
      ),
      query(
        `SELECT r.id, r.reference, r.client_reference AS "clientReference",
                r.service_name AS "serviceName", r.status, r.direction,
                (SELECT min(a.scheduled_at) FROM referral_appointments a
                  WHERE a.referral_id = r.id AND a.status IN ('scheduled','confirmed')
                    AND a.scheduled_at >= now()) AS "nextAppointmentAt",
                (SELECT max(COALESCE(r2.completed_at, r2.updated_at)) FROM referrals r2
                  WHERE r2.client_user_id = r.client_user_id
                    AND (r2.sending_org_id = $1 OR r2.receiving_org_id = $1)) AS "lastActivityAt"
           FROM referrals r
          WHERE r.client_user_id IS NOT NULL
            AND (r.sending_org_id = $1 OR r.receiving_org_id = $1)
          ORDER BY "lastActivityAt" DESC NULLS LAST
          LIMIT 5`,
        [orgId]
      ),
      query(
        `SELECT id, reference, client_reference AS "clientReference",
                service_name AS "serviceName", amount_minor AS "amountMinor",
                currency, status, created_at AS "createdAt"
           FROM commissions
          WHERE earning_org_id = $1
          ORDER BY created_at DESC
          LIMIT 5`,
        [orgId]
      ),
      query(
        `SELECT count(*)::int AS total
           FROM referral_appointments a
          WHERE a.status IN ('scheduled', 'confirmed')
            AND a.scheduled_at >= now()
            AND a.scheduled_at < now() + interval '30 days'
            AND a.referral_id IN (SELECT id FROM referrals
                                   WHERE (sending_org_id = $1 OR receiving_org_id = $1))`,
        [orgId]
      ),
      query("SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL", [
        req.user.id,
      ]),
    ]);

    const counts = referralCounts.rows[0] ?? {};
    const receivedTotal = counts.receivedTotal ?? 0;
    const completedReceived = counts.completedReceived ?? 0;

    // Conversion is received referrals that reached `completed`. Derived from
    // the counts above rather than stored, so it cannot disagree with them.
    const conversionRate = receivedTotal ? Math.round((completedReceived / receivedTotal) * 100) : null;

    const commission = commissionStats.rows[0] ?? {};
    const partnership = partnershipRow.rows[0] ?? null;
    const attention = [];

    if (counts.receivedPending) {
      attention.push({
        kind: "referral",
        id: null,
        label:
          counts.informationRequired > 0
            ? `${counts.informationRequired} referral awaiting more information`
            : `${counts.receivedPending} new referral${counts.receivedPending === 1 ? "" : "s"} received`,
        detail: "Review required",
        href: "/portal/collaborative-clinic/referrals/received?view=pending",
      });
    }
    if (counts.acceptedUnscheduled) {
      attention.push({
        kind: "referral",
        id: null,
        label: `${counts.acceptedUnscheduled} accepted referral${counts.acceptedUnscheduled === 1 ? "" : "s"} not yet scheduled`,
        detail: "Requires follow-up",
        href: "/portal/collaborative-clinic/referrals/received?view=active",
      });
    }
    if (commission.needsAttention) {
      attention.push({
        kind: "commission",
        id: null,
        label: `${commission.needsAttention} commission record${commission.needsAttention === 1 ? "" : "s"} pending verification`,
        detail: "Review required",
        href: "/portal/collaborative-clinic/commission?view=pending",
      });
    }
    if (partnership && partnership.daysToRenewal !== null && partnership.daysToRenewal <= 60) {
      attention.push({
        kind: "partnership",
        id: partnership.id,
        label:
          partnership.daysToRenewal < 0
            ? "Partnership agreement has expired"
            : `Partnership agreement expires in ${partnership.daysToRenewal} day${partnership.daysToRenewal === 1 ? "" : "s"}`,
        detail: "Review required",
        href: "/portal/collaborative-clinic/partnerships",
      });
    }

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "clinic.dashboard.viewed",
      targetType: "partner_organization",
      targetId: orgId,
      detail: {},
    });

    res.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        memberRole: org.memberRole,
      },
      partnership: partnership
        ? {
            id: partnership.id,
            name: partnership.name,
            status: partnership.status,
            renewalDate: partnership.renewalDate,
            daysToRenewal: partnership.daysToRenewal,
          }
        : null,
      counts: {
        receivedReferrals: receivedTotal,
        sentReferrals: counts.sentTotal ?? 0,
        receivedPending: counts.receivedPending ?? 0,
        sentPending: counts.sentPending ?? 0,
        completedReceived,
        completedSent: counts.completedSent ?? 0,
        declinedReceived: counts.declinedReceived ?? 0,
        activeReferredClients: clientStats.rows[0]?.activeClients ?? 0,
        inProgressClients: clientStats.rows[0]?.inProgressClients ?? 0,
        completedClients: clientStats.rows[0]?.completedClients ?? 0,
        conversionRate,
        completedThisMonth: counts.completedThisMonth ?? 0,
      },
      commission: {
        currency: "GBP",
        totalEarned: commission.totalEarned ?? 0,
        pending: commission.pendingAmount ?? 0,
        approved: commission.approvedAmount ?? 0,
        paid: commission.paidAmount ?? 0,
        cancelled: commission.cancelledAmount ?? 0,
        thisMonth: commission.thisMonth ?? 0,
        thisQuarter: commission.thisQuarter ?? 0,
        thisYear: commission.thisYear ?? 0,
      },
      upcomingAppointments: upcoming.rows[0]?.total ?? 0,
      attention,
      recentReferrals: recentReferrals.rows,
      recentClients: recentClients.rows,
      recentCommissions: recentCommissions.rows,
      kindredTap: { id: kindred.id, name: kindred.name },
      unreadNotifications: unread.rows[0]?.unread ?? 0,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Referral lists                                                      */
/* ------------------------------------------------------------------ */

clinicRouter.get(
  "/referrals/received",
  requireClinicPermission("referrals.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const options = parseListQuery(req.query);
    res.json(await referralList({ organizationId: org.id, ...options, direction: "inbound" }));
  })
);

clinicRouter.get(
  "/referrals/sent",
  requireClinicPermission("referrals.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const options = parseListQuery(req.query);
    res.json(await referralList({ organizationId: org.id, ...options, direction: "outbound" }));
  })
);

/** Referral history: both directions with the full filter set. */
clinicRouter.get(
  "/referrals",
  requireClinicPermission("referrals.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const options = parseListQuery(req.query);
    res.json(await referralList({ organizationId: org.id, ...options }));
  })
);

/**
 * Sends a referral into Kindred Tap.
 *
 * The client must already be linked to this organization through a previous
 * referral; a clinic cannot name an arbitrary person. The check counts this
 * organization's own referrals, so there is no way to attach a referral to
 * somebody else's client.
 */
clinicRouter.post(
  "/referrals",
  requireClinicPermission("referrals.create"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const kindred = await kindredOrg();

    const body = parse(
      z.object({
        serviceId: z.string().uuid(),
        clientUserId: z.string().uuid(),
        reason: z.string().trim().min(5, "Tell us why you are referring").max(2000),
        relevantInformation: textOrNull(2000),
        priority: z.enum(["normal", "high", "urgent"]).optional().default("normal"),
        professionalName: textOrNull(160),
        referralLinkId: z.string().uuid().nullable().optional(),
      }),
      req.body
    );

    const service = await queryOne(
      `SELECT id, name, availability FROM partner_services
        WHERE id = $1 AND marketing_status <> 'retired'`,
      [body.serviceId]
    );
    if (!service) throw notFound("That service is not available for referral");
    if (service.availability === "unavailable") {
      throw badRequest("That service is not currently available");
    }

    const linked = await queryOne(
      `SELECT 1 AS linked FROM referrals
        WHERE client_user_id = $1 AND (sending_org_id = $2 OR receiving_org_id = $2)
        LIMIT 1`,
      [body.clientUserId, org.id]
    );
    if (!linked) {
      throw forbidden("You can only refer a client already linked to your organization");
    }

    // A referral link, when supplied, must belong to this organization. This is
    // attribution integrity: the code that produced the referral has to be one
    // the partner owns, so commission cannot be pointed at somebody else's link.
    let linkId = null;
    if (body.referralLinkId) {
      const link = await queryOne(
        "SELECT id FROM referral_links WHERE id = $1 AND organization_id = $2 AND status = 'active'",
        [body.referralLinkId, org.id]
      );
      if (!link) throw badRequest("That referral link does not belong to your organization");
      linkId = link.id;
    }

    const partnership = await queryOne(
      "SELECT id FROM partnerships WHERE partner_org_id = $1 AND status = 'active' LIMIT 1",
      [org.id]
    );

    const clientReference = newReference("CLT");
    const reference = newReference("REF");
    const { rows } = await query(
      `INSERT INTO referrals
         (reference, direction, sending_org_id, receiving_org_id, sending_user_id,
          sending_user_name, sending_professional, service_id, service_name,
          partnership_id, referral_link_id, client_user_id, client_reference,
          reason, relevant_information, priority, status)
       VALUES ($1, 'outbound', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'new')
       RETURNING *`,
      [
        reference,
        org.id,
        kindred.id,
        req.user.id,
        req.user.fullName,
        body.professionalName ?? null,
        service.id,
        service.name,
        partnership?.id ?? null,
        linkId,
        body.clientUserId,
        clientReference,
        body.reason,
        body.relevantInformation ?? null,
        body.priority,
      ]
    );

    const referral = rows[0];
    await recordReferralEvent({
      referralId: referral.id,
      actorId: req.user.id,
      actorName: req.user.fullName,
      actorRole: req.user.role,
      action: "referral.sent",
      detail: body.reason.slice(0, 200),
      toStatus: "new",
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.REFERRAL_CREATED,
      targetType: "referral",
      targetId: referral.id,
      detail: { reference, direction: "outbound", serviceId: service.id },
    });

    await notifyOrgMembers(org.id, {
      type: "clinic_referral_sent",
      title: `Referral ${reference} sent to ${kindred.name}`,
      body: `${service.name} for client ${clientReference}`,
      link: `/portal/collaborative-clinic/referrals/${referral.id}`,
      key: `referral-sent:${referral.id}`,
    });

    res.status(201).json({ referral });
  })
);

/* ------------------------------------------------------------------ */
/* Referral detail                                                     */
/* ------------------------------------------------------------------ */

clinicRouter.get(
  "/referrals/:id",
  requireClinicPermission("referrals.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Referral id");

    const referral = await findReferralForOrg(id, org.id);
    if (!referral) throw notFound("That referral was not found");

    const [events, notes, appointments, commission, orgs] = await Promise.all([
      query(
        `SELECT id, action, detail, from_status AS "fromStatus", to_status AS "toStatus",
                actor_name AS "actorName", actor_role AS "actorRole", created_at AS "createdAt"
           FROM referral_events WHERE referral_id = $1 ORDER BY created_at ASC`,
        [id]
      ),
      query(
        `SELECT id, body, author_name AS "authorName", created_at AS "createdAt"
           FROM referral_notes WHERE referral_id = $1 ORDER BY created_at DESC`,
        [id]
      ),
      query(
        `SELECT id, client_reference AS "clientReference", service_name AS "serviceName",
                professional_name AS "professionalName", scheduled_at AS "scheduledAt",
                status, created_at AS "createdAt"
           FROM referral_appointments WHERE referral_id = $1 ORDER BY scheduled_at DESC`,
        [id]
      ),
      query(
        `SELECT id, reference, status, amount_minor AS "amountMinor", currency,
                rate_bp AS "rateBp", eligible_amount_minor AS "eligibleAmountMinor",
                created_at AS "createdAt"
           FROM commissions WHERE referral_id = $1 LIMIT 1`,
        [id]
      ),
      query("SELECT id, name FROM partner_organizations WHERE id = ANY($1::uuid[])", [
        [referral.sendingOrgId, referral.receivingOrgId],
      ]),
    ]);

    // The counterpart's name is partnership information a partner legitimately
    // needs. Its contacts, and everything about its staff, are not returned.
    const orgName = (orgId) => orgs.rows.find((row) => row.id === orgId)?.name ?? "Partner";

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SENSITIVE_READ,
      targetType: "referral",
      targetId: id,
      detail: { organizationId: org.id },
    });

    res.json({
      referral: {
        ...referral,
        sendingOrganization: orgName(referral.sendingOrgId),
        receivingOrganization: orgName(referral.receivingOrgId),
      },
      events: events.rows,
      notes: notes.rows,
      appointments: appointments.rows,
      commission: commission.rows[0] ?? null,
      allowedActions: allowedActions(referral, org.id),
    });
  })
);

/* ------------------------------------------------------------------ */
/* Referral actions                                                    */
/* ------------------------------------------------------------------ */

const actionSchema = z.object({
  action: z.enum([
    "accept",
    "decline",
    "request_information",
    "assign",
    "schedule",
    "update_status",
    "add_note",
    "refer_back",
    "close_referral",
  ]),
  detail: textOrNull(2000),
  toStatus: z.string().trim().max(40).optional(),
  outcomeCode: textOrNull(60),
  professionalId: z.string().uuid().nullable().optional(),
  professionalName: textOrNull(160),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  serviceId: z.string().uuid().optional(),
});

const PERMISSION_FOR_ACTION = {
  accept: "referrals.accept",
  decline: "referrals.decline",
  request_information: "referrals.request_information",
  assign: "referrals.update",
  schedule: "appointments.manage",
  update_status: "referrals.update",
  add_note: "referrals.update",
  refer_back: "referrals.update",
  close_referral: "referrals.update",
};

const RECEIVING_ONLY = ["accept", "decline", "request_information", "assign", "schedule", "refer_back"];

clinicRouter.post(
  "/referrals/:id/actions",
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Referral id");
    const body = parse(actionSchema, req.body);

    const referral = await findReferralForOrg(id, org.id);
    if (!referral) throw notFound("That referral was not found");

    const receiving = referral.receivingOrgId === org.id;

    // Only the receiving organization may decide anything. The sending side can
    // add notes and track, never accept or decline its own referral.
    if (!receiving && RECEIVING_ONLY.includes(body.action)) {
      throw forbidden("Only the organization receiving this referral can act on it");
    }

    await assertPermission(req, PERMISSION_FOR_ACTION[body.action]);

    if (referral.status === "completed") {
      throw conflict("This referral is already complete");
    }

    // A note is append-only: it changes nothing about the referral's state, so
    // it returns early without touching the status machine.
    if (body.action === "add_note") {
      if (!body.detail) throw badRequest("Write the note before saving it");
      await query(
        `INSERT INTO referral_notes (referral_id, author_id, author_name, body)
         VALUES ($1, $2, $3, $4)`,
        [id, req.user.id, req.user.fullName, body.detail]
      );
      await recordReferralEvent({
        referralId: id,
        actorId: req.user.id,
        actorName: req.user.fullName,
        actorRole: req.user.role,
        action: "referral.note_added",
        detail: body.detail.slice(0, 200),
        fromStatus: referral.status,
        toStatus: referral.status,
      });
      await logAudit({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: "referral.note_added",
        targetType: "referral",
        targetId: id,
        detail: {},
      });
      const current = await queryOne(
        `SELECT id, reference, status, created_at AS "createdAt", updated_at AS "updatedAt"
           FROM referrals WHERE id = $1`,
        [id]
      );
      return res.json({ ok: true, status: current.status, referral: current });
    }

    const now = new Date();
    const next = { to: referral.status, event: null, extra: {} };

    if (body.action === "accept") {
      next.to = "accepted";
      next.event = "referral.accepted";
      next.extra.accepted_at = now;
    } else if (body.action === "decline") {
      if (!body.detail) throw badRequest("Say why the referral is being declined");
      next.to = "declined";
      next.event = "referral.declined";
      next.extra.decline_reason = body.detail;
      next.extra.closed_at = now;
    } else if (body.action === "request_information") {
      if (!body.detail) throw badRequest("Say what information you need");
      next.to = "information_required";
      next.event = "referral.information_requested";
      next.extra.information_requested_at = now;
    } else if (body.action === "assign") {
      if (!body.professionalId) throw badRequest("Choose a professional to assign");
      const { rows } = await query(
        `SELECT full_name FROM users
          WHERE id = $1
            AND role IN ('therapist', 'supporter', 'collaborative_clinic')
            AND status = 'active'`,
        [body.professionalId]
      );
      if (!rows[0]) throw badRequest("That professional is not available");
      next.event = "referral.assigned";
      next.extra.assigned_professional_id = body.professionalId;
      next.extra.assigned_professional_name = rows[0].full_name;
    } else if (body.action === "refer_back") {
      // Referring back is recorded as its own action rather than a silent status
      // flip, because the other side has to know why.
      next.to = "declined";
      next.event = "referral.referred_back";
      next.extra.decline_reason = body.detail ?? "Referred back to the referring organization";
      next.extra.closed_at = now;
    } else if (body.action === "schedule") {
      if (!body.scheduledAt) throw badRequest("Choose a date and time for the appointment");
      const service = body.serviceId
        ? await queryOne("SELECT name FROM partner_services WHERE id = $1", [body.serviceId])
        : null;
      await query(
        `INSERT INTO referral_appointments
           (referral_id, client_user_id, client_reference, service_id, service_name,
            professional_id, professional_name, scheduled_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')`,
        [
          id,
          referral.clientUserId,
          referral.clientReference,
          body.serviceId ?? referral.serviceId,
          service?.name ?? referral.serviceName,
          body.professionalId ?? referral.assignedProfessionalId,
          body.professionalName ?? referral.assignedProfessionalName,
          body.scheduledAt,
        ]
      );
      next.to = "scheduled";
      next.event = "referral.appointment_scheduled";
      next.extra.scheduled_at = body.scheduledAt;
    } else if (body.action === "close_referral") {
      if (!["accepted", "scheduled", "in_progress", "completed"].includes(referral.status)) {
        throw badRequest("Only an accepted, scheduled or completed referral can be closed");
      }
      next.to = "closed";
      next.event = "referral.closed";
      next.extra.closed_at = now;
    } else {
      // update_status: the browser may name the next status, but only one the
      // workflow actually allows from here.
      if (!body.toStatus) throw badRequest("Choose the status to move to");
      if (!REFERRAL_TRANSITIONS[referral.status]?.includes(body.toStatus)) {
        throw badRequest(
          `A referral that is "${referral.status.replace(/_/g, " ")}" cannot move to "${body.toStatus.replace(/_/g, " ")}"`
        );
      }
      next.to = body.toStatus;
      next.event = "referral.status_changed";
      if (body.toStatus === "accepted") next.extra.accepted_at = now;
      if (body.toStatus === "completed") next.extra.completed_at = now;
      if (body.toStatus === "cancelled") next.extra.closed_at = now;
      if (body.outcomeCode) next.extra.outcome_code = body.outcomeCode;
    }

    // The commission is minted inside the transaction that records completion,
    // so a completed referral and the money it earned cannot come apart.
    const completes = next.to === "completed" && referral.status !== "completed";

    const updated = await transaction(async (tx) => {
      const columns = Object.keys(next.extra);
      const assignments = ["status = $2", "updated_at = now()"];
      const params = [id, next.to];

      for (const [key, value] of Object.entries(next.extra)) {
        params.push(value);
        assignments.push(`${key} = $${params.length}`);
      }

      const { rows } = await tx.query(
        `UPDATE referrals SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`,
        params
      );
      const referralRow = rows[0];

      if (completes) {
        // Built explicitly from the aliased `referral` rather than spreading the
        // UPDATE's RETURNING row, so the commission insert never depends on a
        // snake_case column name leaking through.
        await ensureCommissionForReferral(
          {
            id: referralRow.id,
            // Whoever earned the referral: the partner that received it and
            // completed it. Decided from the row the server itself wrote, never
            // from anything in the request.
            earningOrgId: referral.receivingOrgId,
            partnershipId: referral.partnershipId,
            serviceId: referral.serviceId,
            serviceName: referral.serviceName,
            clientReference: referral.clientReference,
          },
          { tx, actorId: req.user.id }
        );
      }
      return referralRow;
    });

    await recordReferralEvent({
      referralId: id,
      actorId: req.user.id,
      actorName: req.user.fullName,
      actorRole: req.user.role,
      action: next.event,
      detail: body.detail?.slice(0, 200) ?? null,
      fromStatus: referral.status,
      toStatus: next.to,
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: `referral.${body.action}`,
      targetType: "referral",
      targetId: id,
      detail: { from: referral.status, to: next.to },
    });

    if (completes) {
      await notifyOrgMembers(org.id, {
        type: "clinic_referral_completed",
        title: `Referral ${referral.reference} completed`,
        body: "Commission is now eligible for this referral.",
        link: `/portal/collaborative-clinic/referrals/${id}`,
        key: `referral-completed:${id}`,
      });
    }

    res.json({ ok: true, status: updated.status, referral: updated });
  })
);

export { REFERRAL_COLUMNS, parseListQuery, referralList, allowedActions, PERMISSION_FOR_ACTION };
export default clinicRouter;