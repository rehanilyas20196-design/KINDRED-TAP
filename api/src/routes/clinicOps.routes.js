/**
 * Collaborative Clinic portal, operations half: partner clients, services and
 * promotion, commission, payouts, partnerships, appointments, partner
 * messaging, reports, notifications and the organization profile.
 *
 * The isolation and privacy rules stated in clinic.routes.js hold here too, and
 * two more matter in this file:
 *
 *  - A partner may never change money. There is no route below that sets a
 *    commission amount, a commission rate, a payout amount or a payout status.
 *    What a partner can do is `request_review` or `dispute`; a person on the
 *    Kindred Tap side then approves or pays. Amounts shown to the partner were
 *    computed server-side when the referral completed and are frozen there.
 *
 *  - Marketing content is written by Kindred Tap, never by a partner. Partners
 *    can read approved assets and copy a link; there is no endpoint that lets
 *    one create or edit a service description or a promotional claim.
 *
 * Routed at /api/clinic together with clinic.routes.js.
 */

import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../db/index.js";
import {
  asyncHandler,
  badRequest,
  forbidden,
  notFound,
  parse,
} from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { AUDIT_ACTIONS, logAudit } from "../lib/audit.js";
import {
  CLINIC_PERMISSION_LABELS,
  PAYOUT_ELIGIBLE_COMMISSION,
  assertPermission,
  clinicOrgFor,
  clinicPermissionsFor,
  findCommissionForOrg,
  kindredOrg,
  newOpaqueCode,
  newReference,
  notifyOrgMembers,
  recordCommissionEvent,
  requireAnyClinicPermission,
  requireClinicPermission,
  textOrNull,
  uuidParam,
} from "../lib/clinic.js";

export const clinicOpsRouter = Router();

clinicOpsRouter.use(requireAuth);

/* ------------------------------------------------------------------ */
/* Partner clients                                                     */
/* ------------------------------------------------------------------ */

/**
 * Clients connected to this partnership, derived from the referrals themselves.
 *
 * There is no client table on this side of the portal: a "tracked client" is a
 * `client_user_id` that appears in one of this organization's referrals. The
 * query returns the referral-shaped facts a partner needs - where the referral
 * came from, which service, who is assigned, what the next appointment is and
 * how the referral ended - and never a name, contact detail or clinical field.
 * A person is reachable only through a referral this organization genuinely
 * sent or received.
 */
clinicOpsRouter.get(
  "/clients",
  requireAnyClinicPermission(["clients.view", "clients.track"]),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const options = parse(
      z.object({
        q: z.string().trim().max(120).optional(),
        view: z.enum(["all", "active", "completed", "pending"]).optional().default("all"),
        limit: z.coerce.number().int().positive().max(200).optional().default(25),
        offset: z.coerce.number().int().min(0).optional().default(0),
      }),
      req.query
    );

    // The organization id is bound as $1 and every later parameter is appended
    // after it, so the push() helper is used from the start rather than seeded
    // separately: an id interpolated into the SQL text would be a syntax error
    // the first time PGlite saw a uuid that begins with a digit.
    const params = [];
    const push = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    const orgRef = push(org.id);
    const where = [
      `r.client_user_id IS NOT NULL`,
      `(r.sending_org_id = ${orgRef} OR r.receiving_org_id = ${orgRef})`,
    ];

    if (options.view === "active") {
      where.push(`r.status NOT IN ('completed', 'closed', 'declined', 'cancelled')`);
    } else if (options.view === "completed") {
      where.push(`r.status IN ('completed', 'closed')`);
    } else if (options.view === "pending") {
      where.push(`r.status IN ('new', 'under_review', 'information_required')`);
    }

    if (options.q) {
      const pattern = push(`%${options.q}%`);
      where.push(`(r.client_reference ILIKE ${pattern} OR r.reference ILIKE ${pattern} OR r.service_name ILIKE ${pattern})`);
    }

    const clause = where.join(" AND ");
    const take = Math.min(options.limit, 100);
    const skip = Math.max(options.offset, 0);

    const base = `
      FROM referrals r
      JOIN partner_organizations sending   ON sending.id = r.sending_org_id
      JOIN partner_organizations receiving ON receiving.id = r.receiving_org_id
      WHERE ${clause}`;

    const [rows, counts] = await Promise.all([
      query(
        `SELECT r.id, r.reference, r.client_reference AS "clientReference",
                r.direction, r.service_name AS "serviceName",
                CASE WHEN r.sending_org_id = ${orgRef} THEN sending.name ELSE receiving.name END
                  AS "referralSource",
                r.created_at AS "referralDate",
                r.assigned_professional_name AS "assignedProfessional",
                r.status AS "referralStatus",
                r.outcome_code AS "outcome",
                r.priority,
                (SELECT a.status FROM referral_appointments a
                  WHERE a.referral_id = r.id ORDER BY a.scheduled_at DESC LIMIT 1)
                  AS "appointmentStatus",
                (SELECT min(a.scheduled_at) FROM referral_appointments a
                  WHERE a.referral_id = r.id AND a.status IN ('scheduled','confirmed')
                    AND a.scheduled_at >= now()) AS "nextAppointment",
                GREATEST(r.updated_at, r.created_at) AS "lastActivity"
         ${base}
        ORDER BY "lastActivity" DESC
        LIMIT ${take} OFFSET ${skip}`,
        params
      ),
      query(`SELECT count(DISTINCT r.client_user_id)::int AS total ${base}`, params),
    ]);

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.CLIENT_REFERRAL_ACCESSED,
      targetType: "partner_organization",
      targetId: org.id,
      detail: { rows: rows.rows.length },
    });

    res.json({ clients: rows.rows, total: counts.rows[0]?.total ?? 0, limit: take, offset: skip });
  })
);

/**
 * Partnership-focused profile for one tracked client.
 *
 * Deliberately referral-shaped: their services, their referrals, their
 * appointments and the referral timeline. Private clinical notes are not
 * reachable from here at all - there is no join to `session_notes`,
 * `assessment_results` or `treatment_plans` anywhere in this file, and none is
 * added for a "convenience" client field later.
 */
clinicOpsRouter.get(
  "/clients/:id",
  requireAnyClinicPermission(["clients.view", "clients.track"]),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Client id");

    // The ownership check and the profile read are the same statement, so there
    // is no window in which an unowned client id could be resolved.
    const owned = await queryOne(
      `SELECT client_reference AS "clientReference"
         FROM referrals
        WHERE client_user_id = $1
          AND (sending_org_id = $2 OR receiving_org_id = $2)
        ORDER BY created_at DESC
        LIMIT 1`,
      [id, org.id]
    );
    if (!owned) throw notFound("That client was not found");

    const [referrals, appointments, timeline] = await Promise.all([
      query(
        `SELECT r.id, r.reference, r.direction, r.service_name AS "serviceName",
                CASE WHEN r.sending_org_id = $2 THEN sending.name ELSE receiving.name END
                  AS "partnerOrganization",
                r.status, r.outcome_code AS "outcome", r.priority,
                r.assigned_professional_name AS "assignedProfessional",
                r.created_at AS "referralDate",
                r.completed_at AS "completedAt"
           FROM referrals r
           JOIN partner_organizations sending   ON sending.id = r.sending_org_id
           JOIN partner_organizations receiving ON receiving.id = r.receiving_org_id
          WHERE r.client_user_id = $1
            AND (r.sending_org_id = $2 OR r.receiving_org_id = $2)
          ORDER BY r.created_at DESC`,
        [id, org.id]
      ),
      query(
        `SELECT a.id, a.referral_id AS "referralId", a.service_name AS "serviceName",
                a.professional_name AS "professionalName",
                a.scheduled_at AS "scheduledAt", a.status
           FROM referral_appointments a
           JOIN referrals r ON r.id = a.referral_id
          WHERE a.client_user_id = $1
            AND (r.sending_org_id = $2 OR r.receiving_org_id = $2)
          ORDER BY a.scheduled_at DESC`,
        [id, org.id]
      ),
      query(
        `SELECT e.id, e.action, e.detail, e.to_status AS "toStatus",
                e.actor_name AS "actorName", e.created_at AS "createdAt",
                r.reference
           FROM referral_events e
           JOIN referrals r ON r.id = e.referral_id
          WHERE r.client_user_id = $1
            AND (r.sending_org_id = $2 OR r.receiving_org_id = $2)
          ORDER BY e.created_at DESC
          LIMIT 50`,
        [id, org.id]
      ),
    ]);

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SENSITIVE_READ,
      targetType: "partner_client",
      targetId: id,
      detail: { organizationId: org.id },
    });

    res.json({
      client: {
        id,
        clientReference: owned.clientReference,
        services: [...new Set(referrals.rows.map((row) => row.serviceName))],
        referralCount: referrals.rows.length,
      },
      referrals: referrals.rows,
      appointments: appointments.rows,
      timeline: timeline.rows,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Services available for referral and promotion                       */
/* ------------------------------------------------------------------ */

clinicOpsRouter.get(
  "/services",
  requireClinicPermission("services.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const { rows } = await query(
      `SELECT s.id, s.name, s.category, s.description, s.availability, s.eligibility,
              s.referral_method AS "referralMethod",
              s.price_minor AS "priceMinor", s.price_currency AS "priceCurrency",
              s.commission_rule AS "commissionRule",
              s.commission_rate_bp AS "commissionRateBp",
              s.commission_fixed_minor AS "commissionFixedMinor",
              s.marketing_status AS "marketingStatus",
              s.marketing_summary AS "marketingSummary",
              s.marketing_body AS "marketingBody",
              (SELECT count(*)::int FROM referrals r
                WHERE r.service_id = s.id
                  AND (r.sending_org_id = $1 OR r.receiving_org_id = $1)) AS "referralCount",
              (SELECT count(*)::int FROM referral_links l
                WHERE l.service_id = s.id AND l.organization_id = $1 AND l.status = 'active')
                AS "activeLinks"
         FROM partner_services s
        WHERE s.marketing_status <> 'retired'
        ORDER BY s.name`,
      [org.id]
    );
    res.json({ services: rows });
  })
);

/**
 * Approved promotional material for this organization.
 *
 * Only `status = 'approved'` rows are served. There is no endpoint here to
 * create or edit an asset, so a partner cannot publish a clinical claim the
 * clinic has not approved.
 */
clinicOpsRouter.get(
  "/marketing",
  requireClinicPermission("services.promote"),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT a.id, a.title, a.format, a.url, a.description,
              a.service_id AS "serviceId", s.name AS "serviceName"
         FROM marketing_assets a
         LEFT JOIN partner_services s ON s.id = a.service_id
        WHERE a.status = 'approved'
        ORDER BY s.name NULLS LAST, a.title`,
      []
    );
    res.json({ assets: rows });
  })
);

/**
 * Referral links belonging to this organization, with their attribution totals.
 *
 * `code` is the only thing in a shareable URL and it is an opaque random string,
 * so it identifies a link and never a client. The counts come from real rows.
 */
clinicOpsRouter.get(
  "/referral-links",
  requireClinicPermission("services.promote"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const { rows } = await query(
      `SELECT l.id, l.code, l.campaign, l.status, l.clicks, l.created_at AS "createdAt",
              s.id AS "serviceId", s.name AS "serviceName",
              (SELECT count(*)::int FROM referrals r
                WHERE r.referral_link_id = l.id) AS "referrals",
              (SELECT count(*)::int FROM referrals r
                WHERE r.referral_link_id = l.id AND r.status IN ('accepted','scheduled','in_progress','completed'))
                AS "conversions",
              (SELECT coalesce(sum(c.amount_minor), 0)::int FROM commissions c
                 JOIN referrals r2 ON r2.id = c.referral_id
                WHERE r2.referral_link_id = l.id AND c.earning_org_id = l.organization_id)
                AS "commissionMinor"
         FROM referral_links l
         JOIN partner_services s ON s.id = l.service_id
        WHERE l.organization_id = $1
        ORDER BY l.created_at DESC`,
      [org.id]
    );
    res.json({ links: rows });
  })
);

/** Creates a referral link for one of the organization's own services. */
clinicOpsRouter.post(
  "/referral-links",
  requireClinicPermission("services.promote"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const body = parse(
      z.object({
        serviceId: z.string().uuid(),
        campaign: textOrNull(120),
      }),
      req.body
    );

    const service = await queryOne(
      "SELECT id, name FROM partner_services WHERE id = $1 AND marketing_status = 'approved'",
      [body.serviceId]
    );
    if (!service) throw badRequest("That service cannot be promoted yet");

    const { rows } = await query(
      `INSERT INTO referral_links (organization_id, service_id, code, campaign, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, campaign, status, created_at AS "createdAt"`,
      [org.id, service.id, newOpaqueCode(), body.campaign ?? null, req.user.id]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.REFERRAL_LINK_CREATED,
      targetType: "referral_link",
      targetId: rows[0].id,
      detail: { serviceId: service.id, campaign: body.campaign ?? null },
    });

    res.status(201).json({ link: { ...rows[0], serviceId: service.id, serviceName: service.name } });
  })
);

/** Records that a link was shared, so promotion activity is auditable. */
clinicOpsRouter.post(
  "/referral-links/:id/promote",
  requireClinicPermission("services.promote"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Referral link id");
    const body = parse(
      z.object({ channel: z.enum(["link", "qr", "email", "poster", "social", "other"]) }),
      req.body
    );

    const link = await queryOne(
      "SELECT id FROM referral_links WHERE id = $1 AND organization_id = $2",
      [id, org.id]
    );
    if (!link) throw notFound("That referral link was not found");

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SERVICE_PROMOTED,
      targetType: "referral_link",
      targetId: id,
      detail: { channel: body.channel },
    });

    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Commission                                                          */
/* ------------------------------------------------------------------ */

const COMMISSION_COLUMNS = `
  c.id,
  c.reference,
  c.referral_id                       AS "referralId",
  c.client_reference                  AS "clientReference",
  c.service_name                      AS "serviceName",
  c.referral_date                     AS "referralDate",
  c.rule,
  c.rate_bp                           AS "rateBp",
  c.eligible_amount_minor             AS "eligibleAmountMinor",
  c.amount_minor                      AS "amountMinor",
  c.currency,
  c.status,
  c.approved_at                       AS "approvedAt",
  c.paid_at                           AS "paidAt",
  c.dispute_reason                    AS "disputeReason",
  c.payout_id                         AS "payoutId",
  c.created_at                        AS "createdAt"
`;

clinicOpsRouter.get(
  "/commission",
  requireClinicPermission("commission.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const options = parse(
      z.object({
        status: z.string().trim().max(40).optional(),
        view: z.enum(["all", "pending", "approved", "paid", "disputed", "cancelled"]).optional().default("all"),
        q: z.string().trim().max(120).optional(),
        limit: z.coerce.number().int().positive().max(200).optional().default(25),
        offset: z.coerce.number().int().min(0).optional().default(0),
      }),
      req.query
    );

    // Built with push() from an empty list so the organization id is bound as
    // $1 without leaving an unused placeholder behind - PostgreSQL cannot infer
    // the type of a parameter that appears in no comparison.
    const params = [];
    const push = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    const where = [`c.earning_org_id = ${push(org.id)}`];

    if (options.status) where.push(`c.status = ${push(options.status)}`);
    if (options.view === "pending") where.push(`c.status IN ('pending', 'under_review')`);
    else if (options.view === "approved") where.push(`c.status IN ('approved', 'scheduled')`);
    else if (options.view === "paid") where.push(`c.status = 'paid'`);
    else if (options.view === "disputed") where.push(`c.status = 'disputed'`);
    else if (options.view === "cancelled") where.push(`c.status = 'cancelled'`);

    if (options.q) {
      const pattern = push(`%${options.q}%`);
      where.push(`(c.reference ILIKE ${pattern} OR c.client_reference ILIKE ${pattern} OR c.service_name ILIKE ${pattern})`);
    }

    const clause = where.join(" AND ");
    const take = Math.min(options.limit, 100);
    const skip = Math.max(options.offset, 0);

    const [rows, counts, totals] = await Promise.all([
      query(
        `SELECT ${COMMISSION_COLUMNS} FROM commissions c WHERE ${clause}
          ORDER BY c.created_at DESC LIMIT ${take} OFFSET ${skip}`,
        params
      ),
      query(`SELECT count(*)::int AS total FROM commissions c WHERE ${clause}`, params),
      query(
        `SELECT coalesce(sum(amount_minor), 0)::int AS "totalEarned",
                coalesce(sum(amount_minor) FILTER (WHERE status IN ('pending','under_review')), 0)::int
                  AS pending,
                coalesce(sum(amount_minor) FILTER (WHERE status IN ('approved','scheduled')), 0)::int
                  AS approved,
                coalesce(sum(amount_minor) FILTER (WHERE status = 'paid'), 0)::int AS paid,
                coalesce(sum(amount_minor) FILTER (WHERE status = 'cancelled'), 0)::int AS cancelled,
                coalesce(sum(amount_minor) FILTER (WHERE status = 'disputed'), 0)::int AS disputed,
                coalesce(sum(amount_minor) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::int
                  AS "thisMonth",
                coalesce(sum(amount_minor) FILTER (WHERE created_at >= date_trunc('quarter', now())), 0)::int
                  AS "thisQuarter",
                coalesce(sum(amount_minor) FILTER (WHERE created_at >= date_trunc('year', now())), 0)::int
                  AS "thisYear",
                count(*)::int AS records
           FROM commissions WHERE earning_org_id = $1`,
        [org.id]
      ),
    ]);

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.COMMISSION_VIEWED,
      targetType: "partner_organization",
      targetId: org.id,
      detail: { rows: rows.rows.length },
    });

    res.json({
      commissions: rows.rows,
      total: counts.rows[0]?.total ?? 0,
      limit: take,
      offset: skip,
      totals: { ...totals.rows[0], currency: "GBP" },
    });
  })
);

clinicOpsRouter.get(
  "/commission/:id",
  requireClinicPermission("commission.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Commission id");

    const commission = await findCommissionForOrg(id, org.id);
    if (!commission) throw notFound("That commission record was not found");

    const events = await query(
      `SELECT id, action, detail, from_status AS "fromStatus", to_status AS "toStatus",
              actor_role AS "actorRole", created_at AS "createdAt"
         FROM commission_events WHERE commission_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    const payout = commission.payout_id
      ? await queryOne(
          `SELECT id, reference, period_label AS "periodLabel", status,
                  amount_minor AS "amountMinor", currency, paid_at AS "paidAt"
             FROM payouts WHERE id = $1`,
          [commission.payout_id]
        )
      : null;

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.COMMISSION_VIEWED,
      targetType: "commission",
      targetId: id,
      detail: { organizationId: org.id },
    });

    res.json({
      commission,
      events: events.rows,
      payout,
      // The partner may raise a question, never move the money.
      allowedActions:
        commission.status === "paid" || commission.status === "cancelled"
          ? ["download_statement"]
          : ["request_review", "dispute", "download_statement"],
    });
  })
);

/**
 * A partner's two levers on a commission: ask for it to be looked at again, or
 * dispute it. Both only ever change the status a Kindred Tap person then acts
 * on; neither can set an amount, and neither can approve or pay.
 */
clinicOpsRouter.post(
  "/commission/:id/actions",
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Commission id");
    const body = parse(
      z.object({
        action: z.enum(["request_review", "dispute"]),
        detail: z.string().trim().min(5, "Explain what needs looking at").max(2000),
      }),
      req.body
    );

    const commission = await findCommissionForOrg(id, org.id);
    if (!commission) throw notFound("That commission record was not found");

    if (["paid", "cancelled"].includes(commission.status)) {
      throw badRequest("This commission is settled and cannot be changed");
    }

    await assertPermission(req, `commission.${body.action}`);

    const next = body.action === "dispute" ? "disputed" : "under_review";
    // Aliased like every other read path rather than `RETURNING *`, so the shape
    // a client sees from an action matches the shape it sees from a GET.
    const { rows } = await query(
      `UPDATE commissions
          SET status = $2,
              dispute_reason = CASE WHEN $3 = 'disputed' THEN $4 ELSE dispute_reason END,
              updated_at = now()
        WHERE id = $1
        RETURNING id, reference, referral_id AS "referralId",
                  earning_org_id AS "earningOrgId", partnership_id AS "partnershipId",
                  service_id AS "serviceId", service_name AS "serviceName",
                  client_reference AS "clientReference", referral_date AS "referralDate",
                  rule, rate_bp AS "rateBp",
                  eligible_amount_minor AS "eligibleAmountMinor",
                  amount_minor AS "amountMinor", currency, status,
                  approved_at AS "approvedAt", paid_at AS "paidAt",
                  dispute_reason AS "disputeReason", payout_id AS "payoutId",
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id, next, next, body.detail]
    );

    await recordCommissionEvent({
      commissionId: id,
      actorId: req.user.id,
      actorRole: req.user.role,
      action: body.action === "dispute" ? "commission.disputed" : "commission.review_requested",
      detail: body.detail.slice(0, 200),
      fromStatus: commission.status,
      toStatus: next,
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action:
        body.action === "dispute"
          ? AUDIT_ACTIONS.COMMISSION_DISPUTED
          : AUDIT_ACTIONS.COMMISSION_ACTION,
      targetType: "commission",
      targetId: id,
      detail: { from: commission.status, to: next },
    });

    await notifyOrgMembers(org.id, {
      type: "clinic_commission_disputed",
      title: body.action === "dispute" ? `Commission ${commission.reference} disputed` : `Review requested for ${commission.reference}`,
      body: body.detail.slice(0, 160),
      link: `/portal/collaborative-clinic/commission/${id}`,
      key: `commission-${body.action}:${id}`,
    });

    res.json({ ok: true, status: rows[0].status, commission: rows[0] });
  })
);

/* ------------------------------------------------------------------ */
/* Payouts                                                             */
/* ------------------------------------------------------------------ */

clinicOpsRouter.get(
  "/payouts",
  requireClinicPermission("payouts.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);

    const [rows, counts] = await Promise.all([
      query(
        `SELECT id, reference, period_label AS "periodLabel", amount_minor AS "amountMinor",
                currency, status, payment_method AS "paymentMethod",
                payment_reference AS "paymentReference",
                scheduled_for AS "scheduledFor", paid_at AS "paidAt",
                failure_reason AS "failureReason", created_at AS "createdAt"
           FROM payouts
          WHERE organization_id = $1
          ORDER BY created_at DESC
          LIMIT 100`,
        [org.id]
      ),
      query(
        `SELECT coalesce(sum(amount_minor), 0)::int AS "totalPaid",
                count(*)::int AS "payoutCount"
           FROM payouts WHERE organization_id = $1 AND status = 'paid'`,
        [org.id]
      ),
    ]);

    // Only the batch totals a partner needs. No bank details are stored on a
    // payout row and none are returned here.
    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.PAYOUT_VIEWED,
      targetType: "partner_organization",
      targetId: org.id,
      detail: {},
    });

    res.json({ payouts: rows.rows, totals: counts.rows[0] ?? { totalPaid: 0, payoutCount: 0 } });
  })
);

/** Commissions already sitting in a payout, so the partner can reconcile. */
clinicOpsRouter.get(
  "/payouts/:id",
  requireClinicPermission("payouts.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Payout id");

    const payout = await queryOne(
      "SELECT * FROM payouts WHERE id = $1 AND organization_id = $2",
      [id, org.id]
    );
    if (!payout) throw notFound("That payout was not found");

    const commissions = await query(
      `SELECT ${COMMISSION_COLUMNS} FROM commissions c WHERE c.payout_id = $1 ORDER BY c.created_at`,
      [id]
    );

    res.json({ payout, commissions: commissions.rows });
  })
);

/* ------------------------------------------------------------------ */
/* Partnerships                                                        */
/* ------------------------------------------------------------------ */

clinicOpsRouter.get(
  "/partnerships",
  requireClinicPermission("partnerships.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const { rows } = await query(
      `SELECT p.id, p.name, p.status, p.model, p.start_date AS "startDate",
              p.renewal_date AS "renewalDate", p.services,
              p.referral_terms AS "referralTerms", p.commission_terms AS "commissionTerms",
              p.created_at AS "createdAt",
              kindred.name AS "counterpart",
              (SELECT count(*)::int FROM referrals r
                WHERE r.partnership_id = p.id) AS "referralVolume",
              (SELECT count(*)::int FROM referrals r
                WHERE r.partnership_id = p.id AND r.status IN ('completed','closed')) AS "completedReferrals",
              (SELECT count(DISTINCT r.client_user_id)::int FROM referrals r
                WHERE r.partnership_id = p.id AND r.client_user_id IS NOT NULL) AS "activeClients",
              (SELECT coalesce(sum(c.amount_minor), 0)::int FROM commissions c
                WHERE c.partnership_id = p.id AND c.earning_org_id = $1) AS "commissionMinor",
              (SELECT string_agg(m.user_id::text, ',') FROM partner_organization_members m
                WHERE m.organization_id = $1 AND m.is_active) AS "memberIds"
         FROM partnerships p
         JOIN partner_organizations kindred ON kindred.id = p.kindred_tap_org_id
        WHERE p.partner_org_id = $1
        ORDER BY p.created_at DESC`,
      [org.id]
    );

    // Membership is stored as an id list for the contacts table, but names are
    // resolved from the users table in a second statement so a member id never
    // leaks into a response that did not need it. `string_agg` returns null over
    // an empty set, hence the coalesce.
    const memberIds = [
      ...new Set(
        rows.flatMap((row) => (row.memberIds ?? "").split(",").filter(Boolean))
      ),
    ];
    const members = memberIds.length
      ? (
          await query(
            `SELECT DISTINCT m.user_id AS id, m.member_role AS "memberRole", u.full_name AS "fullName", u.email
               FROM partner_organization_members m
               JOIN users u ON u.id = m.user_id
              WHERE m.organization_id = $1 AND m.is_active`,
            [org.id]
          )
        ).rows
      : [];

    res.json({
      partnerships: rows.map((row) => {
        const { memberIds: _ids, ...rest } = row;
        return { ...rest, contacts: members };
      }),
    });
  })
);

/**
 * One partnership with its referrals, clients, commission and performance.
 *
 * Scoped by `partner_org_id = $2` in the WHERE clause, so a partnership that
 * belongs to another partner organization is a 404 here rather than a row that
 * has to be filtered out further up.
 */
clinicOpsRouter.get(
  "/partnerships/:id",
  requireClinicPermission("partnerships.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Partnership id");

    const partnership = await queryOne(
      `SELECT p.*, kindred.name AS "counterpartName", kindred.slug AS "counterpartSlug"
         FROM partnerships p
         JOIN partner_organizations kindred ON kindred.id = p.kindred_tap_org_id
        WHERE p.id = $1 AND p.partner_org_id = $2`,
      [id, org.id]
    );
    if (!partnership) throw notFound("That partnership was not found");

    const [agreements, referrals, commissions, performance, contacts] = await Promise.all([
      query(
        `SELECT id, title, version, effective_from AS "effectiveFrom",
                effective_to AS "effectiveTo", status, terms,
                document_name AS "documentName", document_url AS "documentUrl",
                update_requested_at AS "updateRequestedAt",
                update_request_note AS "updateRequestedNote"
           FROM partnership_agreements WHERE partnership_id = $1 ORDER BY created_at DESC`,
        [id]
      ),
      query(
        `SELECT id, reference, direction, service_name AS "serviceName", status,
                client_reference AS "clientReference", created_at AS "createdAt"
           FROM referrals WHERE partnership_id = $1
          ORDER BY created_at DESC LIMIT 100`,
        [id]
      ),
      query(
        `SELECT ${COMMISSION_COLUMNS} FROM commissions c WHERE c.partnership_id = $1 ORDER BY c.created_at DESC`,
        [id]
      ),
      query(
        `SELECT count(*)::int AS "referralVolume",
                count(*) FILTER (WHERE status IN ('completed','closed'))::int AS "completedReferrals",
                count(*) FILTER (WHERE status IN ('accepted','scheduled','in_progress'))::int AS "activeReferrals",
                count(*) FILTER (WHERE status IN ('new','under_review','information_required'))::int AS "pendingReferrals",
                count(DISTINCT client_user_id)::int AS "activeClients",
                coalesce(avg(EXTRACT(EPOCH FROM (COALESCE(completed_at, now()) - created_at)) / 86400)
                  FILTER (WHERE completed_at IS NOT NULL), 0)::numeric(10,1) AS "avgProcessingDays",
                count(*) FILTER (WHERE status = 'declined')::int AS "declinedReferrals"
           FROM referrals WHERE partnership_id = $1`,
        [id]
      ),
      query(
        `SELECT m.member_role AS "memberRole", u.full_name AS "fullName", u.email, u.status
           FROM partner_organization_members m
           JOIN users u ON u.id = m.user_id
          WHERE m.organization_id = $1 AND m.is_active`,
        [org.id]
      ),
    ]);

    // Referral volume against completed referrals is the partnership's headline
    // conversion figure; it is derived from the rows, never stored.
    const perf = performance.rows[0] ?? {};
    const conversionRate =
      perf.referralVolume > 0
        ? Math.round((perf.completedReferrals / perf.referralVolume) * 100)
        : null;

    res.json({
      partnership,
      agreements: agreements.rows,
      referrals: referrals.rows,
      commissions: commissions.rows,
      clients: {
        total: perf.activeClients ?? 0,
      },
      performance: { ...perf, conversionRate },
      contacts: contacts.rows,
    });
  })
);

/**
 * Requests an agreement update. The partner states what it wants; only Kindred
 * Tap changes the version in force, which is why this writes a request and
 * never touches `status`, `version` or the dates.
 */
clinicOpsRouter.post(
  "/partnerships/:id/agreement-requests",
  requireClinicPermission("partnerships.manage"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Partnership id");
    const body = parse(
      z.object({ agreementId: z.string().uuid(), note: z.string().trim().min(10, "Explain the change you need").max(2000) }),
      req.body
    );

    const owned = await queryOne(
      "SELECT id FROM partnerships WHERE id = $1 AND partner_org_id = $2",
      [id, org.id]
    );
    if (!owned) throw notFound("That partnership was not found");

    const { rows } = await query(
      `UPDATE partnership_agreements
          SET update_requested_at = now(),
              update_request_note = $3,
              updated_at = now()
        WHERE id = $1 AND partnership_id = $2
        RETURNING id, update_requested_at AS "updateRequestedAt", update_request_note AS "updateRequestedNote"`,
      [body.agreementId, id, body.note]
    );
    if (!rows[0]) throw notFound("That agreement was not found");

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.PARTNERSHIP_UPDATED,
      targetType: "partnership_agreement",
      targetId: body.agreementId,
      detail: { partnershipId: id, kind: "update_requested" },
    });

    res.json({ ok: true, agreement: rows[0] });
  })
);

/** Adds or updates one of the partnership's named contacts. */
clinicOpsRouter.post(
  "/partnerships/:id/contacts",
  requireClinicPermission("partnerships.manage"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Partnership id");
    const body = parse(
      z.object({
        userId: z.string().uuid(),
        memberRole: z.enum(["primary", "billing", "clinical", "administrative", "member"]),
      }),
      req.body
    );

    const owned = await queryOne(
      "SELECT id FROM partnerships WHERE id = $1 AND partner_org_id = $2",
      [id, org.id]
    );
    if (!owned) throw notFound("That partnership was not found");

    // The user must already belong to this organization: a contact is a member
    // with a role, never an outside email address added to the record.
    const member = await queryOne(
      `SELECT 1 AS member FROM partner_organization_members
        WHERE organization_id = $1 AND user_id = $2 AND is_active`,
      [org.id, body.userId]
    );
    if (!member) throw forbidden("That person is not a member of your organization");

    await query(
      `INSERT INTO partner_organization_members (organization_id, user_id, member_role)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET member_role = EXCLUDED.member_role`,
      [org.id, body.userId, body.memberRole]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.PARTNERSHIP_UPDATED,
      targetType: "partner_organization",
      targetId: org.id,
      detail: { partnershipId: id, kind: "contact_set", memberRole: body.memberRole },
    });

    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Referral appointments                                               */
/* ------------------------------------------------------------------ */

clinicOpsRouter.get(
  "/appointments",
  requireClinicPermission("appointments.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const options = parse(
      z.object({
        status: z.string().trim().max(40).optional(),
        upcoming: z.enum(["true", "false"]).optional(),
        limit: z.coerce.number().int().positive().max(200).optional().default(50),
        offset: z.coerce.number().int().min(0).optional().default(0),
      }),
      req.query
    );

    const params = [org.id];
    const where = [
      `(r.sending_org_id = $1 OR r.receiving_org_id = $1)`,
    ];
    if (options.status) {
      params.push(options.status);
      where.push(`a.status = $${params.length}`);
    }
    if (options.upcoming === "true") {
      where.push(`a.scheduled_at >= now() AND a.status IN ('scheduled', 'confirmed')`);
    }

    const clause = where.join(" AND ");
    const take = Math.min(options.limit, 100);
    const skip = Math.max(options.offset, 0);

    const [rows, counts] = await Promise.all([
      query(
        `SELECT a.id, a.client_reference AS "clientReference", a.service_name AS "serviceName",
                a.professional_name AS "professionalName", a.scheduled_at AS "scheduledAt",
                a.status, a.referral_id AS "referralId", r.reference AS "referralReference"
           FROM referral_appointments a
           JOIN referrals r ON r.id = a.referral_id
          WHERE ${clause}
          ORDER BY a.scheduled_at DESC
          LIMIT ${take} OFFSET ${skip}`,
        params
      ),
      query(
        `SELECT count(*)::int AS total
           FROM referral_appointments a JOIN referrals r ON r.id = a.referral_id
          WHERE ${clause}`,
        params
      ),
    ]);

    res.json({ appointments: rows.rows, total: counts.rows[0]?.total ?? 0, limit: take, offset: skip });
  })
);

/**
 * Changes the status of one of this organization's referral appointments.
 *
 * Confirms a booking, records a completion or cancels it. It cannot move a
 * client between practitioners or reveal anything about the session itself.
 */
clinicOpsRouter.post(
  "/appointments/:id/status",
  requireClinicPermission("appointments.manage"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Appointment id");
    const body = parse(
      z.object({
        status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show", "rescheduled"]),
        reason: textOrNull(500),
      }),
      req.body
    );

    // Ownership is enforced in the UPDATE's WHERE clause rather than by a prior
    // SELECT, so the check and the write cannot come apart.
    const { rows } = await query(
      `UPDATE referral_appointments a
          SET status = $4, updated_at = now()
         FROM referrals r
        WHERE a.id = $1
          AND r.id = a.referral_id
          AND (r.sending_org_id = $2 OR r.receiving_org_id = $2)
        RETURNING a.id, a.status`,
      [id, org.id, org.id, body.status]
    );
    if (!rows[0]) throw notFound("That appointment was not found");

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.APPOINTMENT_CHANGED,
      targetType: "referral_appointment",
      targetId: id,
      detail: { status: body.status },
    });

    res.json({ ok: true, status: rows[0].status });
  })
);

/* ------------------------------------------------------------------ */
/* Partner messaging                                                   */
/* ------------------------------------------------------------------ */

clinicOpsRouter.get(
  "/threads",
  requireClinicPermission("messages.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const { rows } = await query(
      `SELECT c.id, c.topic, c.last_message_at AS "lastMessageAt",
              c.referral_id AS "referralId", c.partnership_id AS "partnershipId",
              (SELECT count(*)::int FROM partner_messages m WHERE m.conversation_id = c.id)
                AS "messageCount",
              (SELECT coalesce(max(m.created_at), c.created_at) FROM partner_messages m
                WHERE m.conversation_id = c.id) AS "lastMessageAtCalculated",
              (SELECT m.body FROM partner_messages m WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC LIMIT 1) AS "lastMessage",
              (SELECT count(*)::int FROM partner_messages m
                WHERE m.conversation_id = c.id
                  AND m.sender_id <> $2
                  AND m.created_at > coalesce((
                    SELECT r.last_read_at FROM partner_message_reads r
                     WHERE r.conversation_id = c.id AND r.user_id = $2), 'epoch'::timestamptz))
                AS unread
         FROM partner_conversations c
        WHERE c.organization_id = $1
        ORDER BY "lastMessageAtCalculated" DESC
        LIMIT 100`,
      [org.id, req.user.id]
    );
    res.json({ threads: rows });
  })
);

clinicOpsRouter.get(
  "/threads/:id",
  requireClinicPermission("messages.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Thread id");

    const thread = await queryOne(
      `SELECT id, topic, referral_id AS "referralId", partnership_id AS "partnershipId",
              created_at AS "createdAt"
         FROM partner_conversations
        WHERE id = $1 AND organization_id = $2`,
      [id, org.id]
    );
    if (!thread) throw notFound("That conversation was not found");

    const [messages] = await Promise.all([
      query(
        `SELECT m.id, m.body, m.sender_id AS "senderId", m.created_at AS "createdAt",
                u.full_name AS "senderName"
           FROM partner_messages m
           JOIN users u ON u.id = m.sender_id
          WHERE m.conversation_id = $1
          ORDER BY m.created_at ASC
          LIMIT 200`,
        [id]
      ),
      // Marking read is bookkeeping about the reader, not a security action, so
      // it runs alongside the read rather than gating it.
      query(
        `INSERT INTO partner_message_reads (user_id, conversation_id, last_read_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id, conversation_id) DO UPDATE SET last_read_at = now()`,
        [req.user.id, id]
      ),
    ]);

    res.json({ thread, messages: messages.rows });
  })
);

/** Opens a thread with Kindred Tap, or returns the existing one for a referral. */
clinicOpsRouter.post(
  "/threads",
  requireClinicPermission("messages.send"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const kindred = await kindredOrg();
    const body = parse(
      z.object({
        topic: z.string().trim().min(3, "Give the conversation a subject").max(160),
        body: z.string().trim().min(1, "Write a message").max(4000),
        referralId: z.string().uuid().nullable().optional(),
        partnershipId: z.string().uuid().nullable().optional(),
      }),
      req.body
    );

    let referralId = null;
    if (body.referralId) {
      const owned = await queryOne(
        `SELECT id FROM referrals
          WHERE id = $1 AND (sending_org_id = $2 OR receiving_org_id = $2)`,
        [body.referralId, org.id]
      );
      if (!owned) throw forbidden("That referral belongs to another organization");
      referralId = owned.id;
    }

    let partnershipId = null;
    if (body.partnershipId) {
      const owned = await queryOne(
        "SELECT id FROM partnerships WHERE id = $1 AND partner_org_id = $2",
        [body.partnershipId, org.id]
      );
      if (!owned) throw forbidden("That partnership belongs to another organization");
      partnershipId = owned.id;
    }

    // One thread per (referral, partnership) topic: asking twice reopens the
    // same conversation instead of fragmenting the history.
    //
    // IS NOT DISTINCT FROM rather than a coalesce sentinel, because
    // `'epoch'::uuid` is not a valid uuid literal and would only ever work by
    // accident. `IS NOT DISTINCT FROM` is null-safe equality, so a thread with no
    // referral and no partnership still matches itself.
    const existing = await queryOne(
      `SELECT id FROM partner_conversations
        WHERE organization_id = $1
          AND referral_id IS NOT DISTINCT FROM $2
          AND partnership_id IS NOT DISTINCT FROM $3
        LIMIT 1`,
      [org.id, referralId, partnershipId]
    );

    let threadId;
    if (existing) {
      threadId = existing.id;
    } else {
      const { rows } = await query(
        `INSERT INTO partner_conversations
           (organization_id, kindred_tap_org_id, topic, referral_id, partnership_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [org.id, kindred.id, body.topic, referralId, partnershipId]
      );
      threadId = rows[0].id;
    }

    await query(
      `INSERT INTO partner_messages (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)`,
      [threadId, req.user.id, body.body]
    );
    await query(
      `UPDATE partner_conversations SET last_message_at = now() WHERE id = $1`,
      [threadId]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.PARTNER_MESSAGE_SENT,
      targetType: "partner_conversation",
      targetId: threadId,
      detail: { referralId },
    });

    res.status(201).json({ threadId });
  })
);

/** Adds a message to an existing thread the caller belongs to. */
clinicOpsRouter.post(
  "/threads/:id/messages",
  requireClinicPermission("messages.send"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const id = uuidParam(req.params.id, "Thread id");
    const body = parse(
      z.object({ body: z.string().trim().min(1, "Write a message").max(4000) }),
      req.body
    );

    const thread = await queryOne(
      "SELECT id FROM partner_conversations WHERE id = $1 AND organization_id = $2",
      [id, org.id]
    );
    if (!thread) throw notFound("That conversation was not found");

    const { rows } = await query(
      `INSERT INTO partner_messages (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, body, sender_id AS "senderId", created_at AS "createdAt"`,
      [id, req.user.id, body.body]
    );
    await query("UPDATE partner_conversations SET last_message_at = now() WHERE id = $1", [id]);

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.PARTNER_MESSAGE_SENT,
      targetType: "partner_conversation",
      targetId: id,
      detail: {},
    });

    res.status(201).json({ message: rows[0] });
  })
);

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

const csvEscape = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (columns, rows) =>
  [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");

/**
 * Reports, all scoped to the caller's organization by construction.
 *
 * Every builder takes `organizationId` and puts it in its WHERE clause; none of
 * them accepts an organization parameter, so a report cannot be aimed at another
 * partner's data. Money is reported in minor units and labelled as such, so a
 * spreadsheet recipient is never left guessing the scale.
 */
const REPORTS = {
  referrals: {
    title: "Referral report",
    columns: ["reference", "direction", "partner", "service", "clientReference", "priority", "status", "created", "completed"],
    async run(organizationId) {
      const { rows } = await query(
        `SELECT r.reference, r.direction,
                CASE WHEN r.sending_org_id = $1 THEN receiving.name ELSE sending.name END AS partner,
                r.service_name AS service, r.client_reference AS "clientReference",
                r.priority, r.status,
                r.created_at::date::text AS created,
                r.completed_at::date::text AS completed
           FROM referrals r
           JOIN partner_organizations sending   ON sending.id = r.sending_org_id
           JOIN partner_organizations receiving ON receiving.id = r.receiving_org_id
          WHERE r.sending_org_id = $1 OR r.receiving_org_id = $1
          ORDER BY r.created_at DESC`,
        [organizationId]
      );
      return rows;
    },
  },
  clients: {
    title: "Client referral report",
    columns: ["clientReference", "service", "referralDate", "status", "outcome", "assignedProfessional"],
    async run(organizationId) {
      const { rows } = await query(
        `SELECT r.client_reference AS "clientReference", r.service_name AS service,
                r.created_at::date::text AS "referralDate", r.status,
                r.outcome_code AS outcome, r.assigned_professional_name AS "assignedProfessional"
           FROM referrals r
          WHERE r.client_user_id IS NOT NULL
            AND (r.sending_org_id = $1 OR r.receiving_org_id = $1)
          ORDER BY r.created_at DESC`,
        [organizationId]
      );
      return rows;
    },
  },
  service_performance: {
    title: "Service performance report",
    columns: ["service", "referrals", "completed", "conversionPercent", "commissionMinor"],
    async run(organizationId) {
      const { rows } = await query(
        `SELECT r.service_name AS service,
                count(*)::int AS referrals,
                count(*) FILTER (WHERE r.status IN ('completed','closed'))::int AS completed,
                CASE WHEN count(*) > 0
                     THEN round(count(*) FILTER (WHERE r.status IN ('completed','closed')) * 100.0 / count(*))
                     ELSE 0 END AS "conversionPercent",
                coalesce(sum(c.amount_minor), 0)::int AS "commissionMinor"
           FROM referrals r
           LEFT JOIN commissions c
             ON c.referral_id = r.id AND c.earning_org_id = $1
          WHERE r.sending_org_id = $1 OR r.receiving_org_id = $1
          GROUP BY r.service_name
          ORDER BY referrals DESC`,
        [organizationId]
      );
      return rows;
    },
  },
  commission: {
    title: "Commission report",
    columns: ["reference", "clientReference", "service", "referralDate", "rateBp", "eligibleAmountMinor", "amountMinor", "currency", "status", "approvedAt", "paidAt"],
    async run(organizationId) {
      const { rows } = await query(
        `SELECT reference, client_reference AS "clientReference", service_name AS service,
                referral_date::text AS "referralDate", rate_bp AS "rateBp",
                eligible_amount_minor AS "eligibleAmountMinor", amount_minor AS "amountMinor",
                currency, status, approved_at::date::text AS "approvedAt",
                paid_at::date::text AS "paidAt"
           FROM commissions WHERE earning_org_id = $1 ORDER BY created_at DESC`,
        [organizationId]
      );
      return rows;
    },
  },
  payouts: {
    title: "Payout report",
    columns: ["reference", "period", "amountMinor", "currency", "status", "paymentMethod", "paidAt"],
    async run(organizationId) {
      const { rows } = await query(
        `SELECT reference, period_label AS period, amount_minor AS "amountMinor",
                currency, status, payment_method AS "paymentMethod",
                paid_at::date::text AS "paidAt"
           FROM payouts WHERE organization_id = $1 ORDER BY created_at DESC`,
        [organizationId]
      );
      return rows;
    },
  },
  partnership_performance: {
    title: "Partnership performance report",
    columns: ["partnership", "status", "referrals", "completed", "conversionPercent", "activeClients", "commissionMinor"],
    async run(organizationId) {
      const { rows } = await query(
        `SELECT p.name AS partnership, p.status,
                count(r.id)::int AS referrals,
                count(r.id) FILTER (WHERE r.status IN ('completed','closed'))::int AS completed,
                CASE WHEN count(r.id) > 0
                     THEN round(count(r.id) FILTER (WHERE r.status IN ('completed','closed')) * 100.0 / count(r.id))
                     ELSE 0 END AS "conversionPercent",
                count(DISTINCT r.client_user_id)::int AS "activeClients",
                coalesce(sum(c.amount_minor), 0)::int AS "commissionMinor"
           FROM partnerships p
           LEFT JOIN referrals r ON r.partnership_id = p.id
           LEFT JOIN commissions c ON c.referral_id = r.id AND c.earning_org_id = $1
          WHERE p.partner_org_id = $1
          GROUP BY p.id, p.name, p.status`,
        [organizationId]
      );
      return rows;
    },
  },
  appointments: {
    title: "Appointment report",
    columns: ["clientReference", "service", "professional", "scheduledAt", "status", "referralReference"],
    async run(organizationId) {
      const { rows } = await query(
        `SELECT a.client_reference AS "clientReference", a.service_name AS service,
                a.professional_name AS professional,
                a.scheduled_at::text AS "scheduledAt", a.status,
                r.reference AS "referralReference"
           FROM referral_appointments a
           JOIN referrals r ON r.id = a.referral_id
          WHERE r.sending_org_id = $1 OR r.receiving_org_id = $1
          ORDER BY a.scheduled_at DESC`,
        [organizationId]
      );
      return rows;
    },
  },
  conversion: {
    title: "Conversion report",
    columns: ["month", "received", "completed", "conversionPercent"],
    async run(organizationId) {
      const { rows } = await query(
        `SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS month,
                count(*)::int AS received,
                count(*) FILTER (WHERE r.status IN ('completed','closed'))::int AS completed,
                CASE WHEN count(*) > 0
                     THEN round(count(*) FILTER (WHERE r.status IN ('completed','closed')) * 100.0 / count(*))
                     ELSE 0 END AS "conversionPercent"
           FROM referrals r
          WHERE r.receiving_org_id = $1
            AND r.created_at >= date_trunc('month', now()) - interval '11 months'
          GROUP BY 1
          ORDER BY 1 DESC`,
        [organizationId]
      );
      return rows;
    },
  },
};

clinicOpsRouter.get(
  "/reports",
  requireAnyClinicPermission(["reports.view", "reports.generate"]),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const { rows } = await query(
      `SELECT report_key AS "reportKey", row_count AS "rowCount", created_at AS "createdAt"
         FROM clinic_report_exports
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [org.id]
    );
    res.json({
      reports: Object.entries(REPORTS).map(([key, report]) => ({
        key,
        title: report.title,
        columns: report.columns,
      })),
      history: rows,
    });
  })
);

clinicOpsRouter.post(
  "/reports/:key/generate",
  requireClinicPermission("reports.generate"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const key = req.params.key;
    const report = REPORTS[key];
    if (!report) throw notFound("There is no report with that name");

    const rows = await report.run(org.id);
    const { rows: history } = await query(
      `INSERT INTO clinic_report_exports (organization_id, report_key, row_count, generated_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, report_key AS "reportKey", row_count AS "rowCount", created_at AS "createdAt"`,
      [org.id, key, rows.length, req.user.id]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.REPORT_GENERATED,
      targetType: "partner_organization",
      targetId: org.id,
      detail: { reportKey: key, rowCount: rows.length },
    });

    res.json({
      key,
      title: report.title,
      columns: report.columns,
      rows,
      rowCount: rows.length,
      csv: toCsv(report.columns, rows),
      generatedAt: history[0].createdAt,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

clinicOpsRouter.get(
  "/notifications",
  requireClinicPermission("collaborative_clinic.dashboard.view"),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, type, title, body, link, data, read_at AS "readAt", created_at AS "createdAt"
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [req.user.id]
    );
    const unread = rows.filter((row) => !row.readAt).length;
    res.json({ notifications: rows, unread });
  })
);

clinicOpsRouter.post(
  "/notifications/:id/read",
  requireClinicPermission("collaborative_clinic.dashboard.view"),
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Notification id");
    // Addressed by (id, user_id): a notification id in a URL cannot mark somebody
    // else's notification read.
    const { rows } = await query(
      `UPDATE notifications SET read_at = now()
        WHERE id = $1 AND user_id = $2 AND read_at IS NULL
        RETURNING id`,
      [id, req.user.id]
    );
    res.json({ ok: true, updated: rows.length > 0 });
  })
);

clinicOpsRouter.post(
  "/notifications/read-all",
  requireClinicPermission("collaborative_clinic.dashboard.view"),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(
      "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL",
      [req.user.id]
    );
    res.json({ ok: true, updated: rowCount ?? 0 });
  })
);

/* ------------------------------------------------------------------ */
/* Settings and organization profile                                   */
/* ------------------------------------------------------------------ */

clinicOpsRouter.get(
  "/settings",
  requireClinicPermission("organization.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const permissions = await clinicPermissionsFor(req.user.id);
    const kindred = await kindredOrg();

    const [currencies, partners] = await Promise.all([
      query("SELECT DISTINCT price_currency AS currency FROM partner_services ORDER BY 1", []),
      query(
        `SELECT o.id, o.name, o.status,
                (SELECT p.status FROM partnerships p
                  WHERE p.partner_org_id = o.id AND p.status IN ('active','paused')
                  ORDER BY p.created_at DESC LIMIT 1) AS "partnershipStatus"
           FROM partner_organizations o
          WHERE o.id <> $1
            AND (o.id = $2 OR EXISTS (SELECT 1 FROM partnerships p2
                                        WHERE p2.kindred_tap_org_id = $2 AND p2.partner_org_id = o.id))
          ORDER BY o.name`,
        [org.id, kindred.id]
      ),
    ]);

    res.json({
      organization: org,
      counterpart: { id: kindred.id, name: kindred.name },
      permissions: [...permissions].map((permission) => ({
        permission,
        label: CLINIC_PERMISSION_LABELS[permission] ?? permission,
        held: permissions.has(permission),
      })),
      currencies: currencies.rows.map((row) => row.currency),
      referralDestinations: partners.rows,
    });
  })
);

/** The organization's own profile, as stored. */
clinicOpsRouter.get(
  "/organization",
  requireClinicPermission("organization.view"),
  asyncHandler(async (req, res) => {
    const org = await clinicOrgFor(req);
    const [organization, members, profile] = await Promise.all([
      queryOne(
        `SELECT id, slug, name, kind, organization_type AS "organizationType", status,
                contact_name AS "contactName", contact_email AS "contactEmail",
                contact_phone AS "contactPhone", website, city, country,
                registration_number AS "registrationNumber",
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM partner_organizations WHERE id = $1`,
        [org.id]
      ),
      query(
        `SELECT m.user_id AS id, m.member_role AS "memberRole", m.is_active AS "isActive",
                u.full_name AS "fullName", u.email, u.status
           FROM partner_organization_members m
           JOIN users u ON u.id = m.user_id
          WHERE m.organization_id = $1
          ORDER BY m.member_role, u.full_name`,
        [org.id]
      ),
      queryOne(
        `SELECT organization_name AS "organizationName", organization_type AS "organizationType",
                bio, contact_name AS "contactName", phone, contact_email AS "contactEmail",
                address_line1 AS "addressLine1", address_line2 AS "addressLine2",
                city, state, country, postal_code AS "postalCode", website,
                registration_number AS "registrationNumber",
                cqc_or_equivalent_number AS "cqcOrEquivalentNumber",
                services_offered AS "servicesOffered", clinic_specialisms AS "clinicSpecialisms",
                partnership_models AS "partnershipModels", referral_types AS "referralTypes",
                accepts_referrals AS "acceptsReferrals", sends_referrals AS "sendsReferrals",
                marketing_consent AS "marketingConsent", languages, years_operating AS "yearsOperating",
                billing_currency AS "billingCurrency"
           FROM collaborative_clinic_profiles WHERE user_id = $1`,
        [req.user.id]
      ),
    ]);

    res.json({ organization, members, profile, partnershipStatus: org.status });
  })
);

export default clinicOpsRouter;