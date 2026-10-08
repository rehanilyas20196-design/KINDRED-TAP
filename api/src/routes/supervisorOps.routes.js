/**
 * Clinic Supervisor portal - supporting sections.
 *
 * This router carries the parts of the portal that sit around the day-to-day
 * supervision queue in `supervisor.routes.js`: workload, the authorised client
 * overview, the supervisor calendar, clinical and ethical oversight, reports,
 * notifications and supervisor messaging.
 *
 * The same rules apply here:
 *
 *  1. Every route is gated by `checkSupervisor` and a permission row. The role
 *     comes from the session, never the URL.
 *  2. Oversight indicators are computed from real clinic records; the
 *     supervisor's recorded status sits beside them. Nothing here diagnoses a
 *     client or clears a case: an indicator is a signal for a human to read.
 *  3. Minimum necessary. Clients are shown only through `clients.view`, and
 *     supervisor messaging deliberately excludes client conversations.
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
import { readIntSetting } from "../lib/advisor.js";
import {
  checkSupervisor,
  dateOrNull,
  requireAnySupPermission,
  requireSupPermission,
  SUPERVISOR_PERMISSION_LABELS,
  supervisorPermissionsFor,
  textOrNull,
  uuidParam,
} from "../lib/supervisor.js";

export const supervisorOpsRouter = Router();

supervisorOpsRouter.use(requireAuth);

/* ------------------------------------------------------------------ */
/* Workload                                                            */
/* ------------------------------------------------------------------ */

/**
 * A band is an operational label, not a performance judgement: it says where
 * to look, never that somebody is doing badly.
 */
function workloadBand(clients, sessions) {
  if (clients >= 10 || sessions >= 15) return { band: "overloaded", label: "Overloaded" };
  if (clients <= 2 && sessions <= 3) return { band: "underutilized", label: "Underutilized" };
  return { band: "normal", label: "Normal" };
}

/** GET /api/supervisor/workload */
supervisorOpsRouter.get(
  "/workload",
  requireSupPermission("workload.view"),
  asyncHandler(async (req, res) => {
    const held = await supervisorPermissionsFor(req.user.id);
    const mayReassign = held.has("workload.manage");

    const { rows } = await query(
      `SELECT u.id, u.full_name AS "fullName", u.role,
              CASE WHEN u.role = 'therapist' THEN tp.discipline END AS "specialization",
              (SELECT count(*)::int FROM client_cases c
                WHERE c.therapist_id = u.id AND c.status = 'active')   AS "activeClients",
              (SELECT count(*)::int FROM sessions s
                WHERE s.therapist_id = u.id AND s.status = 'completed'
                  AND s.scheduled_at >= date_trunc('week', now()))     AS "sessionsThisWeek",
              (SELECT count(*)::int FROM sessions s
                WHERE s.therapist_id = u.id AND s.status = 'scheduled'
                  AND s.scheduled_at >= now())                          AS "upcomingSessions",
              (SELECT count(*)::int FROM sessions s
                WHERE s.therapist_id = u.id AND s.status = 'completed'
                  AND s.scheduled_at > now() - interval '30 days'
                  AND NOT EXISTS (SELECT 1 FROM session_notes n
                                   WHERE n.session_id = s.id AND n.status = 'final'))
                                                                    AS "overdueDocumentation",
              (SELECT count(*)::int FROM case_reviews r
                WHERE r.therapist_id = u.id AND r.status <> 'resolved') AS "openCaseReviews",
              (SELECT count(*)::int FROM safety_escalations e
                WHERE e.therapist_id = u.id
                  AND e.status IN ('new', 'under_review', 'action_required')) AS "openEscalations",
              (SELECT count(*)::int FROM interventions i
                WHERE i.assigned_to = u.id AND i.status <> 'completed') AS "openInterventions",
              (SELECT count(*)::int FROM supervision_records sr
                WHERE sr.therapist_id = u.id AND sr.status = 'open')   AS "supervisionWorkload"
         FROM users u
         LEFT JOIN therapist_profiles tp ON tp.user_id = u.id AND u.role = 'therapist'
        WHERE u.role IN ('therapist', 'supporter') AND u.status = 'active'
        ORDER BY "activeClients" DESC, u.full_name`
    );

    const team = rows.map((row) => ({
      ...row,
      workload: workloadBand(row.activeClients ?? 0, row.sessionsThisWeek ?? 0),
    }));

    const counts = {
      total: team.length,
      overloaded: team.filter((m) => m.workload.band === "overloaded").length,
      normal: team.filter((m) => m.workload.band === "normal").length,
      underutilized: team.filter((m) => m.workload.band === "underutilized").length,
      needsReview: team.filter(
        (m) => m.workload.band === "overloaded" || (m.overdueDocumentation ?? 0) > 0
      ).length,
    };

    res.json({ team, total: team.length, counts, mayReassign });
  })
);

/* ------------------------------------------------------------------ */
/* Clients (authorised overview)                                       */
/* ------------------------------------------------------------------ */

/** GET /api/supervisor/clients - only what supervision responsibilities need. */
supervisorOpsRouter.get(
  "/clients",
  requireSupPermission("clients.view"),
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const attention = req.query.attention === "true";

    const filters = [
      `u.role = 'user'`,
      `(EXISTS (SELECT 1 FROM client_cases cc WHERE cc.client_id = u.id)
         OR EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id))`,
    ];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      filters.push(`u.full_name ILIKE $${params.length}`);
    }

    const { rows } = await query(
      `SELECT u.id,
              u.full_name                                     AS "clientName",
              (SELECT t.full_name FROM client_cases cc
                JOIN users t ON t.id = cc.therapist_id
                WHERE cc.client_id = u.id
                ORDER BY cc.updated_at DESC LIMIT 1)           AS "assignedTherapist",
              (SELECT cc.status FROM client_cases cc
                WHERE cc.client_id = u.id
                ORDER BY cc.updated_at DESC LIMIT 1)           AS "therapyStatus",
              (SELECT tp.status FROM treatment_plans tp
                WHERE tp.client_id = u.id
                ORDER BY tp.updated_at DESC LIMIT 1)           AS "planStatus",
              (SELECT a.status FROM assessments a
                WHERE a.user_id = u.id
                ORDER BY COALESCE(a.completed_at, a.started_at) DESC LIMIT 1) AS "assessmentStatus",
              (SELECT s.scheduled_at FROM sessions s
                WHERE s.user_id = u.id AND s.status = 'scheduled' AND s.scheduled_at >= now()
                ORDER BY s.scheduled_at ASC LIMIT 1)           AS "nextAppointment",
              (SELECT count(*)::int FROM case_reviews r
                WHERE r.client_id = u.id AND r.status <> 'resolved') AS "openCaseReviews",
              (SELECT count(*)::int FROM safety_escalations e
                WHERE e.client_id = u.id
                  AND e.status IN ('new', 'under_review', 'action_required')) AS "openEscalations",
              (SELECT round(avg(g.progress_percent))::int
                 FROM treatment_goals g JOIN treatment_plans p ON p.id = g.plan_id
                WHERE p.client_id = u.id AND p.status = 'active' AND g.status <> 'dropped')
                                                               AS "progressPercent"
         FROM users u
        WHERE ${filters.join(" AND ")}
        ORDER BY u.full_name
        LIMIT 300`,
      params
    );

    const clients = attention
      ? rows.filter(
          (row) =>
            (row.openCaseReviews ?? 0) > 0 ||
            (row.openEscalations ?? 0) > 0 ||
            row.nextAppointment === null
        )
      : rows;

    res.json({ clients, total: clients.length });
  })
);

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

/**
 * GET /api/supervisor/calendar?from&to
 *
 * Merges the events the supervisor created with the dates derived from the
 * records they own (supervision, case-review follow-ups, intervention due
 * dates and concern follow-ups). Nothing is copied into `supervisor_events`,
 * so rescheduling a record moves it on the calendar too.
 */
supervisorOpsRouter.get(
  "/calendar",
  requireAnySupPermission(["supervisor.dashboard.view", "supervision.view"]),
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const from = typeof req.query.from === "string" && req.query.from ? req.query.from : today;
    const to =
      typeof req.query.to === "string" && req.query.to
        ? req.query.to
        : new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

    const { rows: events } = await query(
      `SELECT id, type, title, starts_at AS "startsAt", ends_at AS "endsAt",
              related_type AS "relatedType", related_id AS "relatedId", notes
         FROM supervisor_events
        WHERE starts_at >= $1::date AND starts_at < ($2::date + interval '1 day')
        ORDER BY starts_at`,
      [from, to]
    );

    const { rows: supervision } = await query(
      `SELECT r.id, 'supervision' AS kind, r.status,
              'Supervision: ' || u.full_name AS title,
              r.supervision_date::text AS day
         FROM supervision_records r
         JOIN users u ON u.id = r.therapist_id
        WHERE r.supervision_date BETWEEN $1::date AND $2::date
        ORDER BY r.supervision_date`,
      [from, to]
    );

    const { rows: reviews } = await query(
      `SELECT r.id, 'case_review' AS kind, r.status,
              'Case review follow-up: ' || r.reference AS title,
              r.follow_up_date::text AS day
         FROM case_reviews r
        WHERE r.follow_up_date BETWEEN $1::date AND $2::date
          AND r.status <> 'resolved'
        ORDER BY r.follow_up_date`,
      [from, to]
    );

    const { rows: interventions } = await query(
      `SELECT i.id, 'intervention' AS kind, i.status,
              'Intervention due: ' || i.title AS title,
              i.due_date::text AS day
         FROM interventions i
        WHERE i.due_date BETWEEN $1::date AND $2::date
          AND i.status <> 'completed'
        ORDER BY i.due_date`,
      [from, to]
    );

    const { rows: concerns } = await query(
      `SELECT c.id, 'safety_concern' AS kind, c.status,
              'Concern follow-up: ' || c.reference AS title,
              c.follow_up_date::text AS day
         FROM safety_concerns c
        WHERE c.follow_up_date BETWEEN $1::date AND $2::date
          AND c.status <> 'resolved'
        ORDER BY c.follow_up_date`,
      [from, to]
    );

    res.json({
      from,
      to,
      events,
      derived: [...supervision, ...reviews, ...interventions, ...concerns],
    });
  })
);

const eventSchema = z.object({
  type: z
    .enum(["supervision", "case_review", "follow_up", "meeting", "intervention", "training", "appointment"])
    .optional()
    .default("meeting"),
  title: z.string().trim().min(3, "Give the event a title").max(200),
  startsAt: z.string().trim().min(4, "Choose a start time"),
  endsAt: z.string().trim().nullable().optional(),
  notes: textOrNull(4000),
  relatedType: textOrNull(60),
  relatedId: z.string().trim().uuid().nullable().optional(),
});

/** POST /api/supervisor/calendar */
supervisorOpsRouter.post(
  "/calendar",
  requireSupPermission("supervision.create", "You do not have permission to schedule supervisor events."),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const data = parse(eventSchema, req.body);

    const { rows } = await query(
      `INSERT INTO supervisor_events
         (type, title, starts_at, ends_at, notes, related_type, related_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, type, title, starts_at AS "startsAt", ends_at AS "endsAt"`,
      [
        data.type,
        data.title,
        data.startsAt,
        data.endsAt ?? null,
        data.notes ?? null,
        data.relatedType ?? null,
        data.relatedId ?? null,
        req.user.id,
      ]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.CALENDAR_EVENT_CHANGED,
      targetType: "supervisor_event",
      targetId: rows[0].id,
      detail: { phase: "created", type: data.type },
    });

    res.status(201).json({ event: rows[0] });
  })
);

/** PATCH /api/supervisor/calendar/:id */
supervisorOpsRouter.patch(
  "/calendar/:id",
  requireSupPermission("supervision.create", "You do not have permission to change supervisor events."),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Event");
    const data = parse(
      eventSchema.partial().extend({ startsAt: z.string().trim().min(4).optional() }),
      req.body
    );

    const current = await queryOne(`SELECT id FROM supervisor_events WHERE id = $1`, [id]);
    if (!current) throw notFound("That event does not exist");

    await query(
      `UPDATE supervisor_events
          SET type = COALESCE($2, type),
              title = COALESCE($3, title),
              starts_at = COALESCE($4, starts_at),
              ends_at = COALESCE($5, ends_at),
              notes = COALESCE($6, notes)
        WHERE id = $1`,
      [id, data.type ?? null, data.title ?? null, data.startsAt ?? null, data.endsAt ?? null, data.notes ?? null]
    );

    const event = await queryOne(
      `SELECT id, type, title, starts_at AS "startsAt", ends_at AS "endsAt", notes
         FROM supervisor_events WHERE id = $1`,
      [id]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.CALENDAR_EVENT_CHANGED,
      targetType: "supervisor_event",
      targetId: id,
      detail: { phase: "updated" },
    });

    res.json({ event });
  })
);

/** DELETE /api/supervisor/calendar/:id */
supervisorOpsRouter.delete(
  "/calendar/:id",
  requireSupPermission("supervision.create", "You do not have permission to change supervisor events."),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Event");
    const { rowCount } = await query(`DELETE FROM supervisor_events WHERE id = $1`, [id]);
    if (!rowCount) throw notFound("That event does not exist");

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.CALENDAR_EVENT_CHANGED,
      targetType: "supervisor_event",
      targetId: id,
      detail: { phase: "deleted" },
    });

    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Clinical and ethical oversight                                      */
/* ------------------------------------------------------------------ */

const CLINICAL_AREAS = [
  { key: "clinical_documentation", label: "Clinical documentation", description: "Final notes recorded for completed sessions." },
  { key: "supervision_compliance", label: "Supervision compliance", description: "Practitioners supervised within the clinic interval." },
  { key: "consent_procedures", label: "Consent procedures", description: "Consent and terms recorded for clients in therapy." },
  { key: "confidentiality", label: "Confidentiality", description: "Confidentiality concerns raised and handled." },
  { key: "professional_boundaries", label: "Professional boundaries", description: "Boundary concerns raised and handled." },
  { key: "treatment_planning", label: "Treatment planning", description: "Active plans recorded for clients in therapy." },
  { key: "referral_procedures", label: "Referral procedures", description: "Referral duties followed for active clients." },
  { key: "safety_procedures", label: "Safety procedures", description: "Safety concerns reviewed and resolved." },
  { key: "escalation_procedures", label: "Escalation procedures", description: "Escalations resolved after human review." },
  { key: "communication_standards", label: "Communication standards", description: "Communication concerns raised and handled." },
  { key: "documentation_standards", label: "Documentation standards", description: "Completed sessions with documentation recorded." },
];

function rateTone(rate) {
  if (rate === null || rate === undefined) return "slate";
  if (rate >= 90) return "emerald";
  if (rate >= 70) return "amber";
  return "rose";
}

async function clinicalIndicators() {
  const intervalDays = await readIntSetting("supervision_interval_days", 30);

  const doc = await queryOne(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM session_notes n WHERE n.session_id = s.id AND n.status = 'final'))::int AS final
       FROM sessions s
      WHERE s.status = 'completed' AND s.scheduled_at > now() - interval '30 days'`
  );
  const documentationRate = doc.total ? Math.round((doc.final / doc.total) * 100) : null;

  const supervision = await queryOne(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM supervision_records sr WHERE sr.therapist_id = u.id
                AND sr.supervision_date >= CURRENT_DATE - make_interval(days => $1::int)))::int AS supervised
       FROM users u
      WHERE u.role IN ('therapist', 'supporter') AND u.status = 'active'`,
    [intervalDays]
  );
  const supervisionRate = supervision.total
    ? Math.round((supervision.supervised / supervision.total) * 100)
    : null;

  const plans = await queryOne(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM treatment_plans p WHERE p.client_id = c.client_id AND p.status = 'active'))::int AS withPlan
       FROM client_cases c WHERE c.status = 'active'`
  );
  const planRate = plans.total ? Math.round((plans.withPlan / plans.total) * 100) : null;

  const safety = await queryOne(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'resolved')::int AS resolved
       FROM safety_concerns`
  );
  const safetyRate = safety.total ? Math.round((safety.resolved / safety.total) * 100) : null;

  const escalations = await queryOne(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status IN ('resolved', 'closed'))::int AS closed
       FROM safety_escalations`
  );
  const escalationRate = escalations.total
    ? Math.round((escalations.closed / escalations.total) * 100)
    : null;

  return {
    clinical_documentation: { value: documentationRate, unit: "%", tone: rateTone(documentationRate), detail: `${doc.final}/${doc.total} completed sessions have a final note.` },
    documentation_standards: { value: documentationRate, unit: "%", tone: rateTone(documentationRate), detail: `${doc.total - doc.final} completed session(s) still need a final note.` },
    supervision_compliance: { value: supervisionRate, unit: "%", tone: rateTone(supervisionRate), detail: `${supervision.supervised}/${supervision.total} practitioners supervised within ${intervalDays} days.` },
    treatment_planning: { value: planRate, unit: "%", tone: rateTone(planRate), detail: `${plans.withPlan}/${plans.total} active cases have an active treatment plan.` },
    referral_procedures: { value: planRate, unit: "%", tone: rateTone(planRate), detail: `${plans.total - plans.withPlan} active case(s) have no active plan recorded.` },
    safety_procedures: { value: safetyRate, unit: "%", tone: rateTone(safetyRate), detail: `${safety.resolved}/${safety.total} safety concerns resolved.` },
    escalation_procedures: { value: escalationRate, unit: "%", tone: rateTone(escalationRate), detail: `${escalations.closed}/${escalations.total} escalations resolved or closed.` },
  };
}

/** GET /api/supervisor/oversight/clinical */
supervisorOpsRouter.get(
  "/oversight/clinical",
  requireSupPermission("clinical_oversight.view"),
  asyncHandler(async (req, res) => {
    const held = await supervisorPermissionsFor(req.user.id);
    const indicators = await clinicalIndicators();

    const { rows: recorded } = await query(
      `SELECT area_key AS "areaKey", status, note, updated_at AS "updatedAt"
         FROM oversight_status`
    );
    const recordedMap = new Map(recorded.map((row) => [row.areaKey, row]));

    const areaKeys = CLINICAL_AREAS.map((area) => `clinical:${area.key}`);
    const { rows: policies } = await query(
      `SELECT key, title, version, status, next_review_at AS "nextReviewAt"
         FROM clinical_standards
        WHERE status = 'active'
        ORDER BY next_review_at NULLS LAST
        LIMIT 20`
    );

    res.json({
      areas: CLINICAL_AREAS.map((area) => {
        const record = recordedMap.get(`clinical:${area.key}`) ?? null;
        return {
          ...area,
          indicator: indicators[area.key] ?? null,
          status: record?.status ?? (indicators[area.key] ? "compliant" : "needs_review"),
          note: record?.note ?? null,
          updatedAt: record?.updatedAt ?? null,
          recorded: Boolean(record),
        };
      }),
      policies,
      canManage: held.has("clinical_oversight.manage"),
      areaKeys,
    });
  })
);

const oversightStatusSchema = z.object({
  status: z.enum(["compliant", "needs_review", "action_required", "escalated"]),
  note: textOrNull(2000),
});

/** POST /api/supervisor/oversight/clinical/:area */
supervisorOpsRouter.post(
  "/oversight/clinical/:area",
  requireSupPermission("clinical_oversight.manage"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const area = String(req.params.area);
    if (!CLINICAL_AREAS.some((a) => a.key === area)) throw notFound("That oversight area does not exist");
    const data = parse(oversightStatusSchema, req.body);
    const key = `clinical:${area}`;

    await query(
      `INSERT INTO oversight_status (area_key, status, note, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (area_key) DO UPDATE
         SET status = EXCLUDED.status, note = EXCLUDED.note,
             updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, data.status, data.note ?? null, req.user.id]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.OVERSIGHT_STATUS,
      targetType: "clinical_oversight",
      targetId: area,
      detail: { status: data.status },
    });

    res.json({ ok: true, key, status: data.status });
  })
);

const ETHICAL_AREAS = [
  { key: "confidentiality_concern", reason: "confidentiality_concern", label: "Confidentiality" },
  { key: "inappropriate_communication", reason: "communication_concern", label: "Inappropriate communication" },
  { key: "professional_boundary", reason: "boundary_concern", label: "Professional boundaries" },
  { key: "consent_documentation", reason: "consent_concern", label: "Consent & documentation" },
  { key: "unauthorized_access", reason: "unauthorized_access", label: "Unauthorized access" },
  { key: "inappropriate_disclosure", reason: "disclosure_concern", label: "Inappropriate disclosure" },
  { key: "conflict_of_interest", reason: "conflict_of_interest", label: "Conflicts of interest" },
  { key: "professional_conduct", reason: "conduct_concern", label: "Professional conduct" },
];

/** GET /api/supervisor/oversight/ethical */
supervisorOpsRouter.get(
  "/oversight/ethical",
  requireSupPermission("ethical_oversight.view"),
  asyncHandler(async (req, res) => {
    const held = await supervisorPermissionsFor(req.user.id);

    const { rows: counts } = await query(
      `SELECT reason,
              count(*)::int AS total,
              count(*) FILTER (WHERE status = 'resolved')::int AS resolved,
              count(*) FILTER (WHERE status <> 'resolved')::int AS open
         FROM case_reviews
        WHERE domain = 'ethics'
        GROUP BY reason`
    );
    const countMap = new Map(counts.map((row) => [row.reason, row]));

    const { rows: recorded } = await query(
      `SELECT area_key AS "areaKey", status, note, updated_at AS "updatedAt"
         FROM oversight_status`
    );
    const recordedMap = new Map(recorded.map((row) => [row.areaKey, row]));

    const { rows: guidelines } = await query(
      `SELECT g.id, g.title, g.version, g.status, g.applicable_roles AS "applicableRoles",
              (SELECT count(*)::int FROM users p
                WHERE p.status = 'active'
                  AND p.role IN (SELECT jsonb_array_elements_text(g.applicable_roles))) AS practitioners,
              (SELECT count(*)::int FROM ethics_acknowledgments a
                WHERE a.guideline_id = g.id AND a.version = g.version) AS acknowledged
         FROM ethics_guidelines g
        WHERE g.status = 'active'
        ORDER BY g.title`
    );

    res.json({
      areas: ETHICAL_AREAS.map((area) => {
        const count = countMap.get(area.reason) ?? { total: 0, resolved: 0, open: 0 };
        const record = recordedMap.get(`ethical:${area.key}`) ?? null;
        return {
          key: area.key,
          label: area.label,
          total: count.total,
          resolved: count.resolved,
          open: count.open,
          status: record?.status ?? (count.open > 0 ? "action_required" : "compliant"),
          note: record?.note ?? null,
          updatedAt: record?.updatedAt ?? null,
          recorded: Boolean(record),
        };
      }),
      guidelines,
      canManage: held.has("ethical_oversight.manage"),
    });
  })
);

/** POST /api/supervisor/oversight/ethical/:area */
supervisorOpsRouter.post(
  "/oversight/ethical/:area",
  requireSupPermission("ethical_oversight.manage"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const area = String(req.params.area);
    if (!ETHICAL_AREAS.some((a) => a.key === area)) throw notFound("That ethical area does not exist");
    const data = parse(oversightStatusSchema, req.body);
    const key = `ethical:${area}`;

    await query(
      `INSERT INTO oversight_status (area_key, status, note, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (area_key) DO UPDATE
         SET status = EXCLUDED.status, note = EXCLUDED.note,
             updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, data.status, data.note ?? null, req.user.id]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.OVERSIGHT_STATUS,
      targetType: "ethical_oversight",
      targetId: area,
      detail: { status: data.status },
    });

    res.json({ ok: true, key, status: data.status });
  })
);

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

const csvOf = (columns, rows) => {
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
  ].join("\n");
};

const REPORTS = {
  supervision: {
    title: "Supervision report",
    columns: ["practitioner", "role", "lastSupervision", "records", "openRecords"],
    async run() {
      const { rows } = await query(
        `SELECT u.full_name AS practitioner, u.role,
                (SELECT max(sr.supervision_date)::text FROM supervision_records sr
                  WHERE sr.therapist_id = u.id) AS "lastSupervision",
                (SELECT count(*)::int FROM supervision_records sr
                  WHERE sr.therapist_id = u.id) AS records,
                (SELECT count(*)::int FROM supervision_records sr
                  WHERE sr.therapist_id = u.id AND sr.status = 'open') AS "openRecords"
           FROM users u
          WHERE u.role IN ('therapist', 'supporter') AND u.status = 'active'
          ORDER BY u.full_name`
      );
      return rows;
    },
  },
  therapist_workload: {
    title: "Therapist workload report",
    columns: ["therapist", "activeClients", "sessionsThisWeek", "upcomingSessions"],
    async run() {
      const { rows } = await query(
        `SELECT u.full_name AS therapist,
                (SELECT count(*)::int FROM client_cases c WHERE c.therapist_id = u.id AND c.status = 'active') AS "activeClients",
                (SELECT count(*)::int FROM sessions s WHERE s.therapist_id = u.id AND s.status = 'completed' AND s.scheduled_at >= date_trunc('week', now())) AS "sessionsThisWeek",
                (SELECT count(*)::int FROM sessions s WHERE s.therapist_id = u.id AND s.status = 'scheduled' AND s.scheduled_at >= now()) AS "upcomingSessions"
           FROM users u
          WHERE u.role = 'therapist' AND u.status = 'active'
          ORDER BY u.full_name`
      );
      return rows;
    },
  },
  supporter_workload: {
    title: "Supporter workload report",
    columns: ["supporter", "activeClients", "sessionsThisWeek", "upcomingSessions"],
    async run() {
      const { rows } = await query(
        `SELECT u.full_name AS supporter,
                (SELECT count(*)::int FROM client_cases c WHERE c.therapist_id = u.id AND c.status = 'active') AS "activeClients",
                (SELECT count(*)::int FROM sessions s WHERE s.therapist_id = u.id AND s.status = 'completed' AND s.scheduled_at >= date_trunc('week', now())) AS "sessionsThisWeek",
                (SELECT count(*)::int FROM sessions s WHERE s.therapist_id = u.id AND s.status = 'scheduled' AND s.scheduled_at >= now()) AS "upcomingSessions"
           FROM users u
          WHERE u.role = 'supporter' AND u.status = 'active'
          ORDER BY u.full_name`
      );
      return rows;
    },
  },
  case_review: {
    title: "Case review report",
    columns: ["reference", "domain", "reason", "priority", "status", "created"],
    async run() {
      const { rows } = await query(
        `SELECT reference, domain, reason, priority, status,
                created_at::date::text AS created
           FROM case_reviews ORDER BY created_at DESC`
      );
      return rows;
    },
  },
  escalation: {
    title: "Escalation report",
    columns: ["reference", "priority", "status", "source", "raised", "resolved"],
    async run() {
      const { rows } = await query(
        `SELECT reference, priority, status, source,
                escalated_at::date::text AS raised, resolved_at::date::text AS resolved
           FROM safety_escalations ORDER BY created_at DESC`
      );
      return rows;
    },
  },
  safety_concern: {
    title: "Safety concern report",
    columns: ["reference", "category", "priority", "status", "created"],
    async run() {
      const { rows } = await query(
        `SELECT reference, category, priority, status, created_at::date::text AS created
           FROM safety_concerns ORDER BY created_at DESC`
      );
      return rows;
    },
  },
  intervention: {
    title: "Intervention report",
    columns: ["reference", "category", "title", "priority", "status", "dueDate"],
    async run() {
      const { rows } = await query(
        `SELECT reference, category, title, priority, status, due_date::text AS "dueDate"
           FROM interventions ORDER BY created_at DESC`
      );
      return rows;
    },
  },
  documentation: {
    title: "Documentation report",
    columns: ["therapist", "completedSessions", "documentedSessions", "documentationRate"],
    async run() {
      const { rows } = await query(
        `SELECT u.full_name AS therapist,
                count(*) FILTER (WHERE s.status = 'completed')::int AS "completedSessions",
                count(*) FILTER (WHERE s.status = 'completed' AND EXISTS (
                  SELECT 1 FROM session_notes n WHERE n.session_id = s.id AND n.status = 'final'))::int AS "documentedSessions",
                CASE WHEN count(*) FILTER (WHERE s.status = 'completed') > 0
                     THEN round(count(*) FILTER (WHERE s.status = 'completed' AND EXISTS (
                       SELECT 1 FROM session_notes n WHERE n.session_id = s.id AND n.status = 'final'))::numeric /
                       count(*) FILTER (WHERE s.status = 'completed') * 100)::int END AS "documentationRate"
           FROM sessions s
           JOIN users u ON u.id = s.therapist_id
          WHERE s.scheduled_at >= now() - interval '90 days'
          GROUP BY u.full_name ORDER BY u.full_name`
      );
      return rows;
    },
  },
  follow_up: {
    title: "Follow-up report",
    columns: ["domain", "reference", "status", "followUpDate"],
    async run() {
      const { rows } = await query(
        `SELECT 'Supervision' AS domain, r.id::text AS reference, r.status,
                r.follow_up_date::text AS "followUpDate"
           FROM supervision_records r WHERE r.follow_up_date IS NOT NULL
          UNION ALL
         SELECT 'Case review', r.reference, r.status, r.follow_up_date::text
           FROM case_reviews r WHERE r.follow_up_date IS NOT NULL
          UNION ALL
         SELECT 'Intervention', i.reference, i.status, i.follow_up_date::text
           FROM interventions i WHERE i.follow_up_date IS NOT NULL
          UNION ALL
         SELECT 'Safety concern', c.reference, c.status, c.follow_up_date::text
           FROM safety_concerns c WHERE c.follow_up_date IS NOT NULL
          ORDER BY 4 DESC`
      );
      return rows;
    },
  },
  team_performance: {
    title: "Team performance report",
    columns: ["practitioner", "role", "completedSessions", "documentationRate", "caseReviewsResolved", "interventionsOverdue"],
    async run() {
      const { rows } = await query(
        `SELECT u.full_name AS practitioner, u.role,
                (SELECT count(*)::int FROM sessions s WHERE s.therapist_id = u.id
                  AND s.status = 'completed' AND s.scheduled_at > now() - interval '30 days') AS "completedSessions",
                (SELECT CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE EXISTS (
                          SELECT 1 FROM session_notes n WHERE n.session_id = s.id AND n.status = 'final'))::numeric /
                          count(*) * 100)::int END
                   FROM sessions s WHERE s.therapist_id = u.id
                    AND s.status = 'completed' AND s.scheduled_at > now() - interval '30 days') AS "documentationRate",
                (SELECT count(*)::int FROM case_reviews r WHERE r.therapist_id = u.id AND r.status = 'resolved') AS "caseReviewsResolved",
                (SELECT count(*)::int FROM interventions i WHERE i.assigned_to = u.id
                  AND i.status <> 'completed' AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS "interventionsOverdue"
           FROM users u
          WHERE u.role IN ('therapist', 'supporter') AND u.status = 'active'
          ORDER BY u.full_name`
      );
      return rows;
    },
  },
  clinical_oversight: {
    title: "Clinical oversight report",
    columns: ["areaKey", "status", "updatedAt"],
    async run() {
      const { rows } = await query(
        `SELECT area_key AS "areaKey", status, updated_at::date::text AS "updatedAt"
           FROM oversight_status WHERE area_key LIKE 'clinical:%'
          ORDER BY area_key`
      );
      return rows;
    },
  },
  ethical_concern: {
    title: "Ethical concern report",
    columns: ["reference", "reason", "priority", "status", "created"],
    async run() {
      const { rows } = await query(
        `SELECT reference, reason, priority, status, created_at::date::text AS created
           FROM case_reviews WHERE domain = 'ethics' ORDER BY created_at DESC`
      );
      return rows;
    },
  },
};

/** GET /api/supervisor/reports */
supervisorOpsRouter.get(
  "/reports",
  requireAnySupPermission(["reports.view", "reports.generate"]),
  asyncHandler(async (req, res) => {
    const { rows: history } = await query(
      `SELECT e.id, e.report_key AS "reportKey", e.format, e.row_count AS "rowCount",
              e.created_at AS "createdAt", u.full_name AS "createdByName"
         FROM report_exports e
         LEFT JOIN users u ON u.id = e.advisor_id
        ORDER BY e.created_at DESC LIMIT 25`
    );

    res.json({
      reports: Object.entries(REPORTS).map(([key, report]) => ({
        key,
        title: report.title,
        columns: report.columns,
      })),
      history,
    });
  })
);

/** POST /api/supervisor/reports/:key/generate */
supervisorOpsRouter.post(
  "/reports/:key/generate",
  requireSupPermission("reports.generate"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const key = String(req.params.key);
    const report = REPORTS[key];
    if (!report) throw notFound("That report does not exist");

    const format = req.body?.format === "json" ? "json" : "csv";
    const rows = await report.run(req.body ?? {});

    await query(
      `INSERT INTO report_exports (advisor_id, report_key, format, params, row_count)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [req.user.id, key, format, JSON.stringify(req.body ?? {}), rows.length]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.REPORT_GENERATED,
      targetType: "report",
      targetId: key,
      detail: { format, rowCount: rows.length },
    });

    res.json({
      key,
      title: report.title,
      columns: report.columns,
      rows,
      rowCount: rows.length,
      csv: csvOf(report.columns, rows),
      generatedAt: new Date().toISOString(),
    });
  })
);

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

supervisorOpsRouter.get(
  "/notifications",
  requireAnySupPermission(["supervisor.dashboard.view"]),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const { rows } = await query(
      `SELECT id, type, title, body, link, data, read_at AS "readAt", created_at AS "createdAt"
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [req.user.id]
    );
    res.json({ notifications: rows, unread: rows.filter((row) => !row.readAt).length });
  })
);

supervisorOpsRouter.post(
  "/notifications/read-all",
  requireAnySupPermission(["supervisor.dashboard.view"]),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    await query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

supervisorOpsRouter.post(
  "/notifications/:id/read",
  requireAnySupPermission(["supervisor.dashboard.view"]),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Notification");
    const { rowCount } = await query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (!rowCount) throw notFound("That notification does not exist");
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

/**
 * Supervisor messaging reaches practitioners and other staff, never clients:
 * the sidebar says "authorized staff", and nothing here exposes a
 * therapist-client thread. The thread itself lives in the shared
 * `conversations` table, so both sides use the messaging API they already
 * have.
 */
const SUPERVISOR_MESSAGE_ROLES = [
  "therapist",
  "supporter",
  "clinical_supervisor",
  "clinical_advisor",
  "collaborative_clinic",
];

/** GET /api/supervisor/threads/participants */
supervisorOpsRouter.get(
  "/threads/participants",
  requireAnySupPermission(["messages.view"]),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const params = [SUPERVISOR_MESSAGE_ROLES, req.user.id];
    const clauses = [`u.role = ANY($1::text[])`, `u.status = 'active'`, `u.id <> $2`];
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`u.full_name ILIKE $${params.length}`);
    }

    const { rows } = await query(
      `SELECT u.id, u.full_name AS "fullName", u.role
         FROM users u
        WHERE ${clauses.join(" AND ")}
        ORDER BY u.full_name
        LIMIT 50`,
      params
    );

    res.json({ participants: rows });
  })
);

/** POST /api/supervisor/threads - open (or reuse) a staff thread. */
supervisorOpsRouter.post(
  "/threads",
  requireAnySupPermission(["messages.send"]),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const { participantId } = parse(
      z.object({ participantId: z.string().trim().uuid("Choose a person to message") }),
      req.body
    );
    if (participantId === req.user.id) throw badRequest("You cannot message yourself");

    const participant = await queryOne(
      `SELECT id, full_name AS "fullName", role FROM users
        WHERE id = $1 AND status = 'active' AND role = ANY($2::text[])`,
      [participantId, SUPERVISOR_MESSAGE_ROLES]
    );
    if (!participant) {
      throw forbidden("You can only message practitioners and authorised staff.");
    }

    const { rowCount } = await query(
      `INSERT INTO conversations (user_id, therapist_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, therapist_id) DO NOTHING`,
      [req.user.id, participantId]
    );
    void rowCount;

    const conversation = await queryOne(
      `SELECT id FROM conversations WHERE user_id = $1 AND therapist_id = $2 LIMIT 1`,
      [req.user.id, participantId]
    );

    res.status(201).json({ conversationId: conversation.id, participant });
  })
);

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

/**
 * GET /api/supervisor/settings
 *
 * Read-only clinic settings (the supervisor does not change clinic-wide
 * configuration; that stays with the advisor and the platform administrator)
 * plus the permission rows the signed-in supervisor holds. Showing the
 * permission list is what makes "supervisor is not unrestricted" visible.
 */
supervisorOpsRouter.get(
  "/settings",
  requireAnySupPermission(["supervisor.dashboard.view"]),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const held = await supervisorPermissionsFor(req.user.id);

    const { rows: settings } = await query(
      `SELECT key, value, category, description
         FROM clinic_settings
        WHERE admin_only = false
        ORDER BY category, key`
    );

    res.json({
      settings,
      permissions: [...held]
        .sort()
        .map((permission) => ({ permission, label: SUPERVISOR_PERMISSION_LABELS[permission] ?? permission })),
    });
  })
);

export default supervisorOpsRouter;
