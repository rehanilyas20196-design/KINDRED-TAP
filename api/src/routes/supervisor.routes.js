/**
 * Clinic Supervisor portal: safety monitoring, escalations, the team,
 * supervision, case and session reviews, and interventions.
 *
 * Three rules shape this file:
 *
 *  1. Every route answers to `checkSupervisor` and a permission row. The role
 *     comes from the session, never the URL, so a therapist who edits the
 *     address bar still gets a 403.
 *  2. Safety and escalation handling is triage, not diagnosis. The portal
 *     records what a human said and moves it through review; nothing here
 *     computes risk or clears a client, and serious items need an explicit
 *     human confirmation before they are resolved or closed.
 *  3. Minimum necessary. Supervision reads practitioner and status
 *     information, never private therapist notes - except the one audited,
 *     permission-gated documentation fetch on session reviews.
 *
 * Routed at /api/supervisor together with supervisorOps.routes.js.
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
  notifyAdvisors,
  readIntSetting,
  readSetting,
  recordEscalation,
} from "../lib/advisor.js";
import { notify } from "../lib/notifications.js";
import {
  SUPERVISOR_ROLE,
  checkSupervisor,
  dateOrNull,
  higherPriority,
  newReference,
  notifySupervisors,
  recordActivity,
  requireSupPermission,
  supervisorPermissionsFor,
  textOrNull,
  uuidParam,
} from "../lib/supervisor.js";

export const supervisorRouter = Router();

supervisorRouter.use(requireAuth);

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Loads the caller's permission set, throwing 403 if `permission` is missing. */
async function assertPermission(req, permission, label) {
  const held = await supervisorPermissionsFor(req.user.id);
  if (!held.has(permission)) {
    throw forbidden(
      `You do not have permission to ${label ?? permission}.`
    );
  }
  return held;
}

/**
 * Practitioner rows: active therapists and supporters with the stats a
 * supervisor needs at a glance. All figures are counts of real rows - there
 * is no stored or computed "score".
 */
const PRACTITIONER_COLUMNS = `
  u.id,
  u.full_name                              AS "fullName",
  u.role,
  u.status                                 AS "accountStatus",
  CASE WHEN u.role = 'therapist' THEN tp.discipline
       ELSE NULL
  END                                      AS "specialization",
  CASE WHEN u.role = 'supporter' THEN sp.support_types
       ELSE NULL
  END                                      AS "supportTypes",
  (SELECT count(*)::int FROM client_cases c
    WHERE c.therapist_id = u.id AND c.status = 'active')      AS "activeClients",
  (SELECT count(*)::int FROM sessions s
    WHERE s.therapist_id = u.id
      AND s.status = 'completed'
      AND s.scheduled_at >= date_trunc('week', now()))        AS "sessionsThisWeek",
  (SELECT count(*)::int FROM sessions s
    WHERE s.therapist_id = u.id
      AND s.status = 'scheduled'
      AND s.scheduled_at >= now()
      AND s.scheduled_at <  now() + interval '14 days')       AS "upcomingSessions",
  (SELECT max(s.supervision_date)::text
     FROM supervision_records s WHERE s.therapist_id = u.id)  AS "lastSupervisionDate",
  (SELECT min(s.supervision_date)::text
     FROM supervision_records s
    WHERE s.therapist_id = u.id AND s.supervision_date >= CURRENT_DATE)
                                                              AS "nextSupervisionDate",
  (SELECT count(*)::int FROM safety_concerns c
    WHERE c.subject_user_id = u.id AND c.status <> 'resolved') AS "openConcerns",
  (SELECT count(*)::int FROM safety_escalations e
    WHERE e.therapist_id = u.id
      AND e.status IN ('new', 'under_review', 'action_required')) AS "openEscalations",
  (SELECT count(*)::int FROM case_reviews r
    WHERE r.therapist_id = u.id
      AND r.status IN ('open', 'in_review', 'awaiting_information', 'escalated'))
                                                              AS "openCaseReviews",
  (SELECT count(*)::int FROM interventions i
    WHERE i.assigned_to = u.id AND i.status <> 'completed')   AS "openInterventions",
  (SELECT count(*)::int FROM sessions s
    WHERE s.therapist_id = u.id
      AND s.status = 'completed'
      AND s.scheduled_at > now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM session_notes n
                       WHERE n.session_id = s.id AND n.status = 'final'))
                                                              AS "documentationPending"
`;

const PRACTITIONER_FROM = `
  FROM users u
  LEFT JOIN therapist_profiles tp ON tp.user_id = u.id AND u.role = 'therapist'
  LEFT JOIN supporter_profiles sp ON sp.user_id = u.id AND u.role = 'supporter'
`;

/**
 * Supervision status is derived, never stored: the interval comes from
 * clinic settings, so changing it updates every practitioner at once.
 */
function supervisionStatus(lastSupervisionDate, intervalDays) {
  if (!lastSupervisionDate) return { status: "never", nextDue: null, daysOverdue: null };

  const last = new Date(`${String(lastSupervisionDate).slice(0, 10)}T00:00:00`);
  const next = new Date(last);
  next.setDate(next.getDate() + intervalDays);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);

  return {
    status: days < 0 ? "overdue" : days <= 7 ? "due_soon" : "current",
    nextDue: next.toISOString().slice(0, 10),
    daysOverdue: days < 0 ? Math.abs(days) : null,
  };
}

/** A specialist string for the team lists: discipline or support types. */
function specializationOf(row) {
  if (row.role === "therapist") return row.specialization;
  const types = row.supportTypes;
  if (Array.isArray(types) && types.length) return types.join(", ");
  return null;
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

/** GET /api/supervisor/dashboard */
supervisorRouter.get(
  "/dashboard",
  requireSupPermission("supervisor.dashboard.view"),
  asyncHandler(async (req, res) => {
    const intervalDays = await readIntSetting("supervision_interval_days", 30);
    const responseHours = await readIntSetting("escalation_response_hours", 4);
    const maySeeClients = (await supervisorPermissionsFor(req.user.id)).has("clients.view");

    const counts = await queryOne(
      `SELECT
         (SELECT count(*)::int FROM users
           WHERE role IN ('therapist', 'supporter') AND status = 'active') AS "activePractitioners",
         (SELECT count(*)::int FROM users
           WHERE role = 'therapist' AND status = 'active')                 AS "activeTherapists",
         (SELECT count(*)::int FROM users
           WHERE role = 'supporter' AND status = 'active')                 AS "activeSupporters",
         (SELECT count(*)::int FROM users u
           WHERE u.role = 'user' AND u.status = 'active'
             AND (EXISTS (SELECT 1 FROM client_cases c
                           WHERE c.client_id = u.id AND c.status IN ('active', 'paused'))
               OR EXISTS (SELECT 1 FROM sessions s
                           WHERE s.user_id = u.id AND s.scheduled_at > now() - interval '90 days')))
                                                                          AS "activeClients",
         (SELECT count(*)::int FROM safety_concerns
           WHERE status <> 'resolved')                                    AS "openConcerns",
         (SELECT count(*)::int FROM safety_concerns
           WHERE status <> 'resolved' AND priority IN ('high', 'critical')) AS "highPriorityConcerns",
         (SELECT count(*)::int FROM safety_escalations
           WHERE status IN ('new', 'under_review', 'action_required'))    AS "openEscalations",
         (SELECT count(*)::int FROM safety_escalations
           WHERE status IN ('new', 'under_review', 'action_required')
             AND priority IN ('high', 'critical'))                        AS "highPriorityEscalations",
         (SELECT count(*)::int FROM case_reviews
           WHERE status IN ('open', 'in_review', 'awaiting_information', 'escalated'))
                                                                          AS "pendingCaseReviews",
         (SELECT count(*)::int FROM session_reviews
           WHERE review_status <> 'completed')                            AS "pendingSessionReviews",
         (SELECT count(*)::int FROM supervision_records
           WHERE status = 'open')                                         AS "pendingSupervision",
         (SELECT count(*)::int FROM interventions
           WHERE status <> 'completed')                                   AS "pendingInterventions",
         (SELECT count(*)::int FROM interventions
           WHERE status <> 'completed'
             AND due_date IS NOT NULL AND due_date < CURRENT_DATE)        AS "overdueInterventions",
         (SELECT count(*)::int FROM (
            SELECT 1 FROM safety_concerns
             WHERE status <> 'resolved'
               AND follow_up_date IS NOT NULL AND follow_up_date < CURRENT_DATE
            UNION ALL
            SELECT 1 FROM case_reviews
             WHERE status IN ('open', 'in_review', 'awaiting_information')
               AND follow_up_date IS NOT NULL AND follow_up_date < CURRENT_DATE
            UNION ALL
            SELECT 1 FROM supervision_records
             WHERE status = 'open'
               AND follow_up_date IS NOT NULL AND follow_up_date < CURRENT_DATE
          ) f)                                                            AS "overdueFollowUps",
         (SELECT count(*)::int FROM sessions s
           WHERE s.status = 'completed'
             AND s.scheduled_at > now() - interval '30 days'
             AND NOT EXISTS (SELECT 1 FROM session_notes n
                              WHERE n.session_id = s.id AND n.status = 'final'))
                                                                          AS "documentationPending",
         (SELECT count(*)::int FROM (
            SELECT u.id
              FROM users u
             WHERE u.role IN ('therapist', 'supporter') AND u.status = 'active'
               AND NOT EXISTS (
                 SELECT 1 FROM supervision_records sr
                  WHERE sr.therapist_id = u.id
                    AND sr.supervision_date >= CURRENT_DATE - make_interval(days => $1::int))
          ) p)                                                            AS "supervisionOverdue"`,
      [intervalDays]
    );

    /* Attention required: the queue the portal is built around. */
    const attention = [];

    const { rows: criticalConcerns } = await query(
      `SELECT id, reference, priority, reason, follow_up_date AS "followUpDate"
         FROM safety_concerns
        WHERE status <> 'resolved' AND priority = 'critical'
        ORDER BY created_at DESC LIMIT 3`
    );
    for (const row of criticalConcerns) {
      attention.push({
        kind: "concern",
        id: row.id,
        priority: "critical",
        label: "Critical safety concern",
        detail: row.reason,
        href: `/portal/clinical_supervisor/safety/${row.id}`,
        reference: row.reference,
      });
    }

    const { rows: urgentEscalations } = await query(
      `SELECT id, reference, priority, reason
         FROM safety_escalations
        WHERE status IN ('new', 'under_review') AND priority IN ('critical', 'high')
        ORDER BY created_at DESC LIMIT 3`
    );
    for (const row of urgentEscalations) {
      attention.push({
        kind: "escalation",
        id: row.id,
        priority: row.priority,
        label: "High-priority escalation requires review",
        detail: row.reason,
        href: `/portal/clinical_supervisor/escalations/${row.id}`,
        reference: row.reference,
      });
    }

    const { rows: overdueSupervision } = await query(
      `SELECT u.id, u.full_name AS "fullName"
         FROM users u
        WHERE u.role IN ('therapist', 'supporter') AND u.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM supervision_records sr
             WHERE sr.therapist_id = u.id
               AND sr.supervision_date >= CURRENT_DATE - make_interval(days => $1::int))
        ORDER BY u.full_name LIMIT 3`,
      [intervalDays]
    );
    for (const row of overdueSupervision) {
      attention.push({
        kind: "supervision",
        id: row.id,
        priority: "high",
        label: "Supervision overdue",
        detail: `${row.fullName} has not been supervised within the clinic interval.`,
        href: `/portal/clinical_supervisor/team/${row.id}`,
        reference: null,
      });
    }

    const { rows: urgentReviews } = await query(
      `SELECT id, reference, summary, priority
         FROM case_reviews
        WHERE status IN ('open', 'in_review') AND priority IN ('critical', 'high')
        ORDER BY created_at DESC LIMIT 3`
    );
    for (const row of urgentReviews) {
      attention.push({
        kind: "case_review",
        id: row.id,
        priority: row.priority,
        label: "Case review requires supervisor attention",
        detail: row.summary,
        href: `/portal/clinical_supervisor/case-reviews/${row.id}`,
        reference: row.reference,
      });
    }

    const { rows: overdueInterventions } = await query(
      `SELECT i.id, i.reference, i.title, i.priority, i.due_date AS "dueDate",
              u.full_name AS "assigneeName"
         FROM interventions i
         LEFT JOIN users u ON u.id = i.assigned_to
        WHERE i.status <> 'completed'
          AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE
        ORDER BY i.due_date ASC LIMIT 3`
    );
    for (const row of overdueInterventions) {
      attention.push({
        kind: "intervention",
        id: row.id,
        priority: row.priority,
        label: "Intervention follow-up overdue",
        detail: `${row.title} (due ${String(row.dueDate).slice(0, 10)}${row.assigneeName ? `, ${row.assigneeName}` : ""})`,
        href: `/portal/clinical_supervisor/interventions/${row.id}`,
        reference: row.reference,
      });
    }

    if ((counts.documentationPending ?? 0) > 0) {
      attention.push({
        kind: "documentation",
        id: null,
        priority: "medium",
        label: "Documentation incomplete",
        detail: `${counts.documentationPending} completed session(s) in the last 30 days have no final note.`,
        href: "/portal/clinical_supervisor/session-reviews",
        reference: null,
      });
    }

    const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
    attention.sort((a, b) => (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4));

    /* Today's activity: everything dated today across the supervisor's work. */
    const { rows: todayRecords } = await query(
      `SELECT 'supervision' AS kind, r.id::text,
              'Supervision with ' || u.full_name AS title,
              r.supervision_date::text AS day,
              r.status AS status
         FROM supervision_records r
         JOIN users u ON u.id = r.therapist_id
        WHERE r.supervision_date = CURRENT_DATE
        UNION ALL
       SELECT 'case_review', r.id::text,
              'Follow-up: ' || r.reference,
              r.follow_up_date::text, r.status
         FROM case_reviews r
        WHERE r.follow_up_date = CURRENT_DATE
          AND r.status IN ('open', 'in_review', 'awaiting_information', 'escalated')
        UNION ALL
       SELECT 'intervention', i.id::text,
              'Intervention due: ' || i.title,
              i.due_date::text, i.status
         FROM interventions i
        WHERE i.due_date = CURRENT_DATE AND i.status <> 'completed'
        UNION ALL
       SELECT 'concern', c.id::text,
              'Concern follow-up: ' || c.reference,
              c.follow_up_date::text, c.status
         FROM safety_concerns c
        WHERE c.follow_up_date = CURRENT_DATE AND c.status <> 'resolved'
        UNION ALL
       SELECT 'event', e.id::text, e.title,
              e.starts_at::date::text, 'scheduled'
         FROM supervisor_events e
        WHERE e.starts_at >= date_trunc('day', now())
          AND e.starts_at <  date_trunc('day', now()) + interval '1 day'
        ORDER BY 4 ASC
        LIMIT 30`
    );

    /* Recent activity: the supervisor's own trail plus escalation actions. */
    const { rows: recentActivity } = await query(
      `SELECT a.id, a.domain, a.action, a.detail, a.to_status AS "toStatus",
              a.actor_id AS "actorId", u.full_name AS "actorName",
              a.created_at AS "createdAt"
         FROM supervisor_activity a
         LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT 8`
    );
    const { rows: recentEscalations } = await query(
      `SELECT e.id, e.reference, ev.action, ev.detail, ev.to_status AS "toStatus",
              ev.actor_id AS "actorId", u.full_name AS "actorName",
              ev.created_at AS "createdAt"
         FROM safety_escalation_events ev
         JOIN safety_escalations e ON e.id = ev.escalation_id
         LEFT JOIN users u ON u.id = ev.actor_id
        WHERE ev.actor_role = $1
        ORDER BY ev.created_at DESC LIMIT 6`,
      [SUPERVISOR_ROLE]
    );
    const recent = [...recentActivity, ...recentEscalations]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);

    const { rows: unreadRows } = await query(
      "SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL",
      [req.user.id]
    );

    res.json({
      counts,
      attention: attention.slice(0, 10),
      today: todayRecords.map((row) => ({
        kind: row.kind,
        id: row.id,
        title: row.title,
        day: row.day,
        status: row.status,
      })),
      recent,
      maySeeClients,
      responseHours,
      intervalDays,
      unreadNotifications: unreadRows[0]?.unread ?? 0,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Safety concerns                                                     */
/* ------------------------------------------------------------------ */

const CONCERN_COLUMNS = `
  c.id,
  c.reference,
  c.category,
  c.priority,
  c.status,
  c.reason,
  c.information,
  c.current_actions                        AS "currentActions",
  c.follow_up_date::text                   AS "followUpDate",
  c.client_id                              AS "clientId",
  client.full_name                         AS "clientName",
  c.subject_user_id                        AS "subjectUserId",
  subject.full_name                        AS "subjectName",
  subject.role                             AS "subjectRole",
  c.assigned_supervisor_id                 AS "assignedSupervisorId",
  supervisor.full_name                     AS "assignedSupervisorName",
  c.escalation_id                          AS "escalationId",
  esc.reference                            AS "escalationReference",
  esc.status                               AS "escalationStatus",
  esc.priority                             AS "escalationPriority",
  c.resolution,
  c.raised_by                              AS "raisedBy",
  raiser.full_name                         AS "raisedByName",
  c.resolved_at                            AS "resolvedAt",
  c.created_at                             AS "createdAt",
  c.updated_at                             AS "updatedAt"
`;

const CONCERN_FROM = `
  FROM safety_concerns c
  LEFT JOIN users client     ON client.id = c.client_id
  LEFT JOIN users subject    ON subject.id = c.subject_user_id
  LEFT JOIN users supervisor ON supervisor.id = c.assigned_supervisor_id
  LEFT JOIN users raiser     ON raiser.id = c.raised_by
  LEFT JOIN safety_escalations esc ON esc.id = c.escalation_id
`;

/** GET /api/supervisor/safety - the monitoring queue. */
supervisorRouter.get(
  "/safety",
  requireSupPermission("safety.view"),
  asyncHandler(async (req, res) => {
    const priority = typeof req.query.priority === "string" ? req.query.priority.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const filters = [];
    const params = [];
    if (priority) {
      params.push(priority);
      filters.push(`c.priority = $${params.length}`);
    }
    if (status) {
      params.push(status);
      filters.push(`c.status = $${params.length}`);
    }
    if (category) {
      params.push(category);
      filters.push(`c.category = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const at = params.length;
      filters.push(
        `(c.reference ILIKE $${at} OR c.reason ILIKE $${at}
          OR subject.full_name ILIKE $${at} OR client.full_name ILIKE $${at})`
      );
    }

    const { rows } = await query(
      `SELECT ${CONCERN_COLUMNS}
         ${CONCERN_FROM}
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY CASE c.priority
                   WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                   WHEN 'medium' THEN 2 ELSE 3
                 END,
                 CASE c.status
                   WHEN 'open' THEN 0 WHEN 'under_review' THEN 1
                   WHEN 'action_required' THEN 2 ELSE 3
                 END,
                 c.created_at DESC
        LIMIT 200`,
      params
    );

    const held = await supervisorPermissionsFor(req.user.id);
    const maySeeClients = held.has("clients.view");

    const concerns = rows.map((row) => ({
      ...row,
      clientName: maySeeClients ? row.clientName : null,
    }));

    const counts = concerns.reduce(
      (acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        acc.byPriority[row.priority] = (acc.byPriority[row.priority] ?? 0) + 1;
        return acc;
      },
      { open: 0, under_review: 0, action_required: 0, resolved: 0, byPriority: {} }
    );

    res.json({ concerns, total: concerns.length, counts, maySeeClients });
  })
);

const createConcernSchema = z.object({
  category: z
    .enum([
      "urgent_client_concern",
      "risk_escalation",
      "client_status_change",
      "missed_sessions",
      "practitioner_concern",
      "safeguarding",
      "documentation",
      "communication",
      "treatment",
      "operational",
    ])
    .optional()
    .default("urgent_client_concern"),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  reason: z.string().trim().min(10, "Describe why this is a concern").max(4000),
  information: textOrNull(8000),
  clientId: z.string().trim().uuid().nullable().optional(),
  subjectUserId: z.string().trim().uuid().nullable().optional(),
  followUpDate: dateOrNull,
});

/** POST /api/supervisor/safety - raise a concern. */
supervisorRouter.post(
  "/safety",
  requireSupPermission("safety.review"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const data = parse(createConcernSchema, req.body);
    const reference = newReference("CON");

    if (data.clientId) {
      const client = await queryOne(`SELECT id FROM users WHERE id = $1 AND role = 'user'`, [
        data.clientId,
      ]);
      if (!client) throw badRequest("That client does not exist");
    }
    if (data.subjectUserId) {
      const subject = await queryOne(
        `SELECT id FROM users WHERE id = $1 AND role IN ('therapist', 'supporter')`,
        [data.subjectUserId]
      );
      if (!subject) throw badRequest("Choose a therapist or supporter");
    }

    const { rows } = await query(
      `INSERT INTO safety_concerns
         (reference, category, priority, status, reason, information,
          client_id, subject_user_id, follow_up_date, raised_by)
       VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9)
       RETURNING id, reference, priority, status, created_at`,
      [
        reference,
        data.category,
        data.priority,
        data.reason,
        data.information ?? null,
        data.clientId ?? null,
        data.subjectUserId ?? null,
        data.followUpDate ?? null,
        req.user.id,
      ]
    );
    const concern = rows[0];

    await recordActivity({
      domain: "safety_concern",
      targetId: concern.id,
      action: "created",
      detail: data.reason,
      toStatus: "open",
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.CONCERN_CREATED,
      targetType: "safety_concern",
      targetId: concern.id,
      detail: { reference, priority: data.priority, category: data.category },
    });

    await notifySupervisors({
      type: "safety_concern",
      title: `New safety concern ${reference}`,
      body: data.reason,
      link: `/portal/clinical_supervisor/safety/${concern.id}`,
      data: { concernId: concern.id },
      key: `concern-created:${concern.id}`,
    });

    res.status(201).json({ concern });
  })
);

/** GET /api/supervisor/safety/:id - one concern with its trail. */
supervisorRouter.get(
  "/safety/:id",
  requireSupPermission("safety.view"),
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Concern");

    const concern = await queryOne(
      `SELECT ${CONCERN_COLUMNS}, c.escalation_id AS "escalationIdOnly"
         ${CONCERN_FROM}
        WHERE c.id = $1`,
      [id]
    );
    if (!concern) throw notFound("That safety concern does not exist");

    const { rows: activity } = await query(
      `SELECT a.id, a.action, a.detail, a.from_status AS "fromStatus",
              a.to_status AS "toStatus", a.actor_id AS "actorId",
              u.full_name AS "actorName", a.actor_role AS "actorRole",
              a.created_at AS "createdAt"
         FROM supervisor_activity a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.domain = 'safety_concern' AND a.target_id = $1
        ORDER BY a.created_at ASC`,
      [id]
    );

    const held = await supervisorPermissionsFor(req.user.id);
    const maySeeClients = held.has("clients.view");
    const emergencyProcedure =
      concern.priority === "critical"
        ? await readSetting("escalation_emergency_procedure", null)
        : null;

    // Reading a concern can surface a client id, so the read is attributable.
    if (concern.clientId) {
      await logAudit({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: AUDIT_ACTIONS.SENSITIVE_READ,
        targetType: "safety_concern",
        targetId: id,
        detail: { reference: concern.reference },
      });
    }

    res.json({
      concern: { ...concern, clientName: maySeeClients ? concern.clientName : null },
      activity,
      maySeeClients,
      emergencyProcedure,
    });
  })
);

const CONCERN_ACTIONS = {
  review: { status: "under_review", label: "started reviewing the concern" },
  assign: { status: "under_review", label: "assigned the concern" },
  note: { status: null, label: "added a note" },
  request_information: { status: "action_required", label: "requested more information" },
  set_follow_up: { status: null, label: "scheduled a follow-up" },
  escalate: { status: "action_required", label: "escalated the concern" },
  resolve: { status: "resolved", label: "resolved the concern" },
  reopen: { status: "open", label: "reopened the concern" },
};

const concernActionSchema = z.object({
  action: z.enum(Object.keys(CONCERN_ACTIONS)),
  detail: textOrNull(4000),
  followUpDate: dateOrNull,
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assigneeId: z.string().trim().uuid().nullable().optional(),
  confirm: z.boolean().optional(),
});

/**
 * POST /api/supervisor/safety/:id/actions
 *
 * Every action writes an activity row and an audit entry, so the trail on
 * the detail page is the same data an auditor reads. Resolving a critical
 * concern requires an explicit human confirmation - nothing closes itself.
 */
supervisorRouter.post(
  "/safety/:id/actions",
  requireSupPermission("safety.manage"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Concern");
    const data = parse(concernActionSchema, req.body);

    const current = await queryOne(
      `SELECT id, reference, priority, status, reason, client_id, subject_user_id,
              assigned_supervisor_id, escalation_id
         FROM safety_concerns WHERE id = $1`,
      [id]
    );
    if (!current) throw notFound("That safety concern does not exist");

    const config = CONCERN_ACTIONS[data.action];
    const fromStatus = current.status;

    if (fromStatus === "resolved" && !["reopen", "note"].includes(data.action)) {
      throw conflict("This concern is resolved. Reopen it first to change it.");
    }
    if (data.action === "resolve") {
      if (fromStatus === "resolved") throw conflict("This concern is already resolved");
      if (current.priority === "critical" && data.confirm !== true) {
        throw badRequest("Confirm explicitly to resolve a critical safety concern");
      }
      if (!data.detail) throw badRequest("Record what was done to resolve this concern");
    }
    if (data.action === "reopen" && fromStatus !== "resolved") {
      throw conflict("Only a resolved concern can be reopened");
    }
    if (data.action === "review" && fromStatus !== "open") {
      throw conflict("This concern is already under review");
    }
    if (data.action === "set_follow_up" && !data.followUpDate) {
      throw badRequest("Choose a follow-up date");
    }

    if (data.assigneeId) {
      const assignee = await queryOne(
        `SELECT id FROM users WHERE id = $1 AND role = $2 AND status = 'active'`,
        [data.assigneeId, SUPERVISOR_ROLE]
      );
      if (!assignee) throw badRequest("Choose an active clinic supervisor");
    }

    const nextStatus = config.status ?? fromStatus;
    const nextPriority =
      data.action === "escalate"
        ? higherPriority(current.priority, data.priority ?? "high")
        : (data.priority ?? current.priority);

    let escalationId = current.escalation_id;
    let escalation = null;

    await transaction(async (tx) => {
      await tx.query(
        `UPDATE safety_concerns
            SET status = $2,
                priority = $3,
                assigned_supervisor_id = COALESCE($4, assigned_supervisor_id),
                follow_up_date = COALESCE($5, follow_up_date),
                current_actions = CASE WHEN $6::text IS NOT NULL
                                       THEN current_actions || E'\n' || $6::text
                                       ELSE current_actions END,
                resolution = COALESCE($7, resolution),
                resolved_at = CASE WHEN $2 = 'resolved' THEN now()
                                   WHEN $2 = 'open' THEN NULL
                                   ELSE resolved_at END
          WHERE id = $1`,
        [
          id,
          nextStatus,
          nextPriority,
          data.action === "assign" ? (data.assigneeId ?? req.user.id) : null,
          data.action === "set_follow_up" ? data.followUpDate : null,
          data.action === "note" && data.detail ? `Note: ${data.detail}` : null,
          data.action === "resolve" ? data.detail : null,
        ]
      );

      await tx.query(
        `INSERT INTO supervisor_activity
           (domain, target_id, action, detail, from_status, to_status, actor_id, actor_role)
         VALUES ('safety_concern', $1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          data.action,
          data.detail ?? config.label,
          fromStatus,
          nextStatus,
          req.user.id,
          req.user.role,
        ]
      );
    });

    // Escalating a concern raises a real row on the shared clinic queue, so
    // the Clinical Advisor sees it through the channel they already monitor.
    if (data.action === "escalate") {
      escalation = await recordEscalation({
        source: "supervisor",
        priority: nextPriority,
        riskType: current.category ?? null,
        reason: `${current.reference}: ${current.reason}`,
        observations: data.detail ?? null,
        recommendedAction: "Clinical review requested by the clinic supervisor.",
        clientId: current.client_id,
        therapistId: current.subject_user_id,
        createdBy: req.user.id,
      });
      escalationId = escalation.id;
      await query(`UPDATE safety_concerns SET escalation_id = $2 WHERE id = $1`, [
        id,
        escalation.id,
      ]);
      await notifySupervisors({
        type: "safety_escalation",
        title: `Concern ${current.reference} escalated to ${escalation.reference}`,
        body: data.detail ?? current.reason,
        link: `/portal/clinical_supervisor/escalations/${escalation.id}`,
        data: { escalationId: escalation.id },
        key: `concern-escalated:${escalation.id}`,
      });
    }

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.CONCERN_ACTION,
      targetType: "safety_concern",
      targetId: id,
      detail: {
        reference: current.reference,
        action: data.action,
        fromStatus,
        toStatus: nextStatus,
        priority: nextPriority,
      },
    });

    res.json({
      ok: true,
      status: nextStatus,
      priority: nextPriority,
      escalation: escalation
        ? { id: escalation.id, reference: escalation.reference, priority: escalation.priority }
        : escalationId
          ? { id: escalationId }
          : null,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Escalations (shared queue)                                          */
/* ------------------------------------------------------------------ */

const ESCALATION_COLUMNS = `
  e.id,
  e.reference,
  e.source,
  e.priority,
  e.status,
  e.risk_type                              AS "riskType",
  e.client_id                              AS "clientId",
  e.client_alias                           AS "clientAlias",
  client.full_name                         AS "clientName",
  e.therapist_id                           AS "therapistId",
  practitioner.full_name                   AS "therapistName",
  practitioner.role                        AS "therapistRole",
  e.assigned_reviewer_id                   AS "assignedReviewerId",
  reviewer.full_name                       AS "assignedReviewerName",
  e.escalated_at                           AS "escalatedAt",
  e.resolved_at                            AS "resolvedAt",
  e.closed_at                              AS "closedAt",
  e.created_at                             AS "createdAt",
  e.updated_at                             AS "updatedAt"
`;

const ESCALATION_FROM = `
  FROM safety_escalations e
  LEFT JOIN users client        ON client.id = e.client_id
  LEFT JOIN users practitioner  ON practitioner.id = e.therapist_id
  LEFT JOIN users reviewer      ON reviewer.id = e.assigned_reviewer_id
`;

/** GET /api/supervisor/escalations - the workflow queue. */
supervisorRouter.get(
  "/escalations",
  requireSupPermission("escalations.view"),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const priority = typeof req.query.priority === "string" ? req.query.priority.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const filters = [];
    const params = [];

    if (status === "awaiting_action") {
      filters.push(`e.status IN ('new', 'under_review', 'action_required')`);
    } else if (status === "escalated") {
      filters.push(
        `EXISTS (SELECT 1 FROM safety_escalation_events ev
                  WHERE ev.escalation_id = e.id
                    AND ev.action IN ('escalate', 'escalate_to_advisor'))`
      );
    } else if (status) {
      params.push(status);
      filters.push(`e.status = $${params.length}`);
    }
    if (priority) {
      params.push(priority);
      filters.push(`e.priority = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const at = params.length;
      filters.push(
        `(e.reference ILIKE $${at} OR e.reason ILIKE $${at} OR e.client_alias ILIKE $${at}
          OR practitioner.full_name ILIKE $${at})`
      );
    }

    const { rows } = await query(
      `SELECT ${ESCALATION_COLUMNS}
         ${ESCALATION_FROM}
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY CASE e.priority
                   WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                   WHEN 'medium' THEN 2 ELSE 3
                 END,
                 CASE e.status
                   WHEN 'new' THEN 0 WHEN 'under_review' THEN 1
                   WHEN 'action_required' THEN 2 WHEN 'resolved' THEN 3 ELSE 4
                 END,
                 e.created_at DESC
        LIMIT 200`,
      params
    );

    const held = await supervisorPermissionsFor(req.user.id);
    const maySeeClients = held.has("clients.view");
    const escalations = rows.map((row) => ({
      ...row,
      clientName: maySeeClients ? row.clientName : null,
    }));

    const { rows: countRows } = await query(
      `SELECT
         count(*) FILTER (WHERE status IN ('new', 'under_review', 'action_required'))::int AS "awaitingAction",
         count(*) FILTER (WHERE status = 'new')::int            AS "new",
         count(*) FILTER (WHERE status = 'under_review')::int   AS "underReview",
         count(*) FILTER (WHERE status = 'action_required')::int AS "actionRequired",
         count(*) FILTER (WHERE status = 'resolved')::int       AS "resolved",
         count(*) FILTER (WHERE status = 'closed')::int         AS "closed",
         count(*) FILTER (WHERE priority = 'critical'
                           AND status IN ('new', 'under_review', 'action_required'))::int AS "criticalOpen",
         count(*) FILTER (WHERE priority = 'high'
                           AND status IN ('new', 'under_review', 'action_required'))::int AS "highOpen",
         count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM safety_escalation_events ev
                  WHERE ev.escalation_id = safety_escalations.id
                    AND ev.action IN ('escalate', 'escalate_to_advisor')))::int AS "escalated"
       FROM safety_escalations`
    );

    res.json({ escalations, total: escalations.length, counts: countRows[0], maySeeClients });
  })
);

const createEscalationSchema = z.object({
  priority: z.enum(["low", "medium", "high", "critical"]).optional().default("high"),
  riskType: textOrNull(200),
  reason: z.string().trim().min(10, "Describe the reason for the escalation").max(4000),
  observations: textOrNull(8000),
  recommendedAction: textOrNull(4000),
  clientId: z.string().trim().uuid().nullable().optional(),
  therapistId: z.string().trim().uuid().nullable().optional(),
});

/** POST /api/supervisor/escalations - raise an escalation directly. */
supervisorRouter.post(
  "/escalations",
  requireSupPermission("escalations.create"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const data = parse(createEscalationSchema, req.body);

    const escalation = await recordEscalation({
      source: "supervisor",
      priority: data.priority,
      riskType: data.riskType ?? null,
      reason: data.reason,
      observations: data.observations ?? null,
      recommendedAction: data.recommendedAction ?? null,
      clientId: data.clientId ?? null,
      therapistId: data.therapistId ?? null,
      createdBy: req.user.id,
    });

    await notifySupervisors({
      type: "safety_escalation",
      title: `New escalation ${escalation.reference}`,
      body: data.reason,
      link: `/portal/clinical_supervisor/escalations/${escalation.id}`,
      data: { escalationId: escalation.id },
      key: `supervisor-escalation-created:${escalation.id}`,
    });

    res.status(201).json({ escalation });
  })
);

/** GET /api/supervisor/escalations/:id */
supervisorRouter.get(
  "/escalations/:id",
  requireSupPermission("escalations.view"),
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Escalation");

    const escalation = await queryOne(
      `SELECT ${ESCALATION_COLUMNS},
              e.reason,
              e.observations,
              e.recommended_action          AS "recommendedAction",
              e.actions_taken               AS "actionsTaken",
              e.follow_up_actions           AS "followUpActions",
              e.resolution,
              e.created_by                  AS "createdBy",
              creator.full_name             AS "createdByName"
         ${ESCALATION_FROM}
         LEFT JOIN users creator ON creator.id = e.created_by
        WHERE e.id = $1`,
      [id]
    );
    if (!escalation) throw notFound("That escalation does not exist");

    const { rows: events } = await query(
      `SELECT ev.id, ev.action, ev.detail, ev.from_status AS "fromStatus",
              ev.to_status AS "toStatus", ev.actor_id AS "actorId",
              u.full_name AS "actorName", ev.actor_role AS "actorRole",
              ev.created_at AS "createdAt"
         FROM safety_escalation_events ev
         LEFT JOIN users u ON u.id = ev.actor_id
        WHERE ev.escalation_id = $1
        ORDER BY ev.created_at ASC`,
      [id]
    );

    const held = await supervisorPermissionsFor(req.user.id);
    const maySeeClients = held.has("clients.view");
    const emergencyProcedure =
      escalation.priority === "critical"
        ? await readSetting("escalation_emergency_procedure", null)
        : null;
    const responseHours = await readIntSetting("escalation_response_hours", 4);

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SENSITIVE_READ,
      targetType: "safety_escalation",
      targetId: id,
      detail: { reference: escalation.reference },
    });

    res.json({
      escalation: {
        ...escalation,
        clientName: maySeeClients ? escalation.clientName : null,
      },
      events,
      maySeeClients,
      emergencyProcedure,
      responseHours,
    });
  })
);

const ESCALATION_ACTIONS = {
  acknowledge: { status: "under_review", label: "acknowledged the escalation", perm: "escalations.review" },
  assign_reviewer: { status: "under_review", label: "assigned a reviewer", perm: "escalations.review" },
  request_information: { status: "action_required", label: "requested more information", perm: "escalations.review" },
  add_action: { status: null, label: "added a follow-up action", perm: "escalations.review" },
  escalate: { status: null, label: "raised the priority", perm: "escalations.escalate" },
  escalate_to_advisor: { status: "action_required", label: "escalated to the Clinical Advisor", perm: "escalations.escalate" },
  resolve: { status: "resolved", label: "resolved the escalation", perm: "escalations.manage" },
  close: { status: "closed", label: "closed the escalation", perm: "escalations.manage" },
};

const escalationActionSchema = z.object({
  action: z.enum(Object.keys(ESCALATION_ACTIONS)),
  detail: textOrNull(4000),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assignedReviewerId: z.string().trim().uuid().nullable().optional(),
  resolution: textOrNull(4000),
  followUpActions: textOrNull(4000),
  confirm: z.boolean().optional(),
});

/**
 * POST /api/supervisor/escalations/:id/actions
 *
 * The workflow: Created -> Supervisor Review -> Required Action ->
 * Intervention/Follow-up -> Monitor -> Resolved -> Closed. Serious
 * escalations (high or critical) cannot be resolved or closed without an
 * explicit human confirmation, and "escalate to Clinical Advisor" raises a
 * notification rather than closing anything.
 */
supervisorRouter.post(
  "/escalations/:id/actions",
  requireSupPermission("escalations.review"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Escalation");
    const data = parse(escalationActionSchema, req.body);

    const held = await supervisorPermissionsFor(req.user.id);
    const config = ESCALATION_ACTIONS[data.action];
    if (!held.has(config.perm)) {
      throw forbidden("You do not have permission to perform this escalation action.");
    }

    const current = await queryOne(
      `SELECT id, reference, status, priority, therapist_id, client_id, actions_taken
         FROM safety_escalations WHERE id = $1`,
      [id]
    );
    if (!current) throw notFound("That escalation does not exist");

    const fromStatus = current.status;
    if (fromStatus === "closed") throw conflict("This escalation is closed");
    if (data.action === "resolve" && fromStatus === "resolved") {
      throw conflict("This escalation is already resolved");
    }
    if (data.action === "acknowledge" && fromStatus !== "new") {
      throw conflict("This escalation has already been acknowledged");
    }
    if (["resolve", "close"].includes(data.action)) {
      const serious = ["critical", "high"].includes(current.priority);
      if (serious && data.confirm !== true) {
        throw badRequest(
          `Confirm explicitly to ${data.action} a ${current.priority}-priority escalation`
        );
      }
      if (data.action === "resolve" && !data.resolution && !data.detail) {
        throw badRequest("Record what was done to resolve this escalation");
      }
    }

    if (data.assignedReviewerId) {
      const reviewer = await queryOne(
        `SELECT id FROM users
          WHERE id = $1 AND role IN ('clinical_supervisor', 'clinical_advisor') AND status = 'active'`,
        [data.assignedReviewerId]
      );
      if (!reviewer) throw badRequest("Choose a clinic supervisor or clinical advisor as reviewer");
    }

    const nextStatus = config.status ?? fromStatus;
    const nextPriority =
      data.action === "escalate"
        ? higherPriority(current.priority, data.priority ?? "critical")
        : (data.priority ?? current.priority);

    const actionsTaken =
      data.action === "add_action" && data.detail
        ? [current.actions_taken, `• ${data.detail}`].filter(Boolean).join("\n")
        : current.actions_taken;

    await transaction(async (tx) => {
      await tx.query(
        `UPDATE safety_escalations
            SET status = $2,
                priority = $3,
                assigned_reviewer_id = COALESCE($4, assigned_reviewer_id),
                actions_taken = $5,
                resolution = COALESCE($6, resolution),
                follow_up_actions = COALESCE($7, follow_up_actions),
                resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE resolved_at END,
                closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE closed_at END
          WHERE id = $1`,
        [
          id,
          nextStatus,
          nextPriority,
          data.action === "assign_reviewer" ? (data.assignedReviewerId ?? null) : null,
          actionsTaken,
          data.resolution ?? null,
          data.followUpActions ?? null,
        ]
      );

      await tx.query(
        `INSERT INTO safety_escalation_events
           (escalation_id, actor_id, actor_role, action, detail, from_status, to_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          req.user.id,
          req.user.role,
          data.action,
          data.detail ??
            data.resolution ??
            (data.action === "assign_reviewer" && data.assignedReviewerId
              ? "Reviewer assigned"
              : config.label),
          fromStatus,
          nextStatus,
        ]
      );
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.ESCALATION_ACTION,
      targetType: "safety_escalation",
      targetId: id,
      detail: {
        reference: current.reference,
        action: data.action,
        fromStatus,
        toStatus: nextStatus,
        priority: nextPriority,
      },
    });

    if (data.action === "escalate_to_advisor") {
      await notifyAdvisors({
        type: "safety_escalation",
        title: `Escalation ${current.reference} escalated to the Clinical Advisor`,
        body: data.detail ?? "A clinic supervisor escalated this for higher clinical oversight.",
        link: `/portal/clinical_advisor/safety/${id}`,
        data: { escalationId: id },
        key: `to-advisor:${id}:${Date.now()}`,
      });
      await notifySupervisors({
        type: "safety_escalation",
        title: `Escalation ${current.reference} sent to the Clinical Advisor`,
        body: data.detail ?? "Clinical guidance requested.",
        link: `/portal/clinical_supervisor/escalations/${id}`,
        data: { escalationId: id },
        key: `to-advisor-seen:${id}:${Date.now()}`,
      });
    }

    if (data.action === "escalate") {
      await notifySupervisors({
        type: "safety_escalation",
        title: `Escalation ${current.reference} raised to ${nextPriority}`,
        body: data.detail ?? "Priority raised for immediate review.",
        link: `/portal/clinical_supervisor/escalations/${id}`,
        data: { escalationId: id },
        key: `escalation-raised-sup:${id}:${nextPriority}`,
      });
    }

    res.json({ ok: true, status: nextStatus, priority: nextPriority });
  })
);

/* ------------------------------------------------------------------ */
/* Therapists & supporters (team)                                      */
/* ------------------------------------------------------------------ */

/** GET /api/supervisor/team */
supervisorRouter.get(
  "/team",
  requireAnyTeamPermission,
  asyncHandler(async (req, res) => {
    const roleFilter = typeof req.query.role === "string" ? req.query.role.trim() : "";
    const filter = typeof req.query.filter === "string" ? req.query.filter.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const intervalDays = await readIntSetting("supervision_interval_days", 30);

    const filters = [`u.status = 'active'`];
    const params = [];
    if (roleFilter === "therapist" || roleFilter === "supporter") {
      params.push(roleFilter);
      filters.push(`u.role = $${params.length}`);
    } else {
      filters.push(`u.role IN ('therapist', 'supporter')`);
    }
    if (q) {
      params.push(`%${q}%`);
      filters.push(`u.full_name ILIKE $${params.length}`);
    }

    const { rows } = await query(
      `SELECT ${PRACTITIONER_COLUMNS}
         ${PRACTITIONER_FROM}
        WHERE ${filters.join(" AND ")}
        ORDER BY u.full_name`,
      params
    );

    const team = rows.map((row) => {
      const supervision = supervisionStatus(row.lastSupervisionDate, intervalDays);
      return {
        ...row,
        specialization: specializationOf(row),
        supportTypes: undefined,
        supervision,
        workload: workloadBand(row),
        needsReview:
          supervision.status === "overdue" ||
          supervision.status === "never" ||
          (row.documentationPending ?? 0) > 0,
      };
    });

    const filtered = team.filter((member) => {
      if (filter === "needs_supervision") {
        return ["overdue", "never", "due_soon"].includes(member.supervision.status);
      }
      if (filter === "high_workload") return member.workload.band === "overloaded";
      if (filter === "open_concern") return (member.openConcerns ?? 0) > 0;
      if (filter === "open_escalation") return (member.openEscalations ?? 0) > 0;
      if (filter === "documentation") return (member.documentationPending ?? 0) > 0;
      return true;
    });

    res.json({
      team: filtered,
      total: filtered.length,
      intervalDays,
      counts: {
        total: team.length,
        therapists: team.filter((m) => m.role === "therapist").length,
        supporters: team.filter((m) => m.role === "supporter").length,
        needingSupervision: team.filter((m) =>
          ["overdue", "never", "due_soon"].includes(m.supervision.status)
        ).length,
        highWorkload: team.filter((m) => m.workload.band === "overloaded").length,
        openConcerns: team.reduce((sum, m) => sum + (m.openConcerns ?? 0), 0),
        openEscalations: team.reduce((sum, m) => sum + (m.openEscalations ?? 0), 0),
      },
    });
  })
);

/** Any team-visibility permission unlocks the directory. */
async function requireAnyTeamPermission(req, res, next) {
  try {
    checkSupervisor(req);
    const held = await supervisorPermissionsFor(req.user.id);
    if (!held.has("therapists.view") && !held.has("supporters.view")) {
      throw forbidden("You do not have permission to view the team directory.");
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Workload band from caseload and sessions this week. A band is an
 * operational label for where to look, never a performance judgement.
 */
function workloadBand(row) {
  const clients = row.activeClients ?? 0;
  const sessions = row.sessionsThisWeek ?? 0;
  if (clients >= 10 || sessions >= 15) return { band: "overloaded", label: "Overloaded" };
  if (clients <= 2 && sessions <= 3) return { band: "underutilized", label: "Underutilized" };
  return { band: "normal", label: "Normal" };
}

/** GET /api/supervisor/team/:id - one practitioner's supervision profile. */
supervisorRouter.get(
  "/team/:id",
  requireAnyTeamPermission,
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Practitioner");
    const intervalDays = await readIntSetting("supervision_interval_days", 30);

    const practitioner = await queryOne(
      `SELECT ${PRACTITIONER_COLUMNS}
         ${PRACTITIONER_FROM}
        WHERE u.id = $1 AND u.role IN ('therapist', 'supporter')`,
      [id]
    );
    if (!practitioner) throw notFound("That team member does not exist");

    const supervision = supervisionStatus(practitioner.lastSupervisionDate, intervalDays);
    const { ...rest } = practitioner;
    const { rows: escalationRows } = await query(
      `SELECT e.id, e.reference, e.priority, e.status, e.reason, e.created_at AS "createdAt"
         FROM safety_escalations e
        WHERE e.therapist_id = $1
        ORDER BY e.created_at DESC LIMIT 10`,
      [id]
    );
    const { rows: interventionRows } = await query(
      `SELECT i.id, i.reference, i.title, i.status, i.priority, i.due_date AS "dueDate"
         FROM interventions i
        WHERE i.assigned_to = $1
        ORDER BY i.created_at DESC LIMIT 10`,
      [id]
    );
    const { rows: supervisionRows } = await query(
      `SELECT r.id, r.supervision_date AS "supervisionDate", r.modality, r.focus,
              r.status, r.follow_up_date AS "followUpDate",
              r.created_at AS "createdAt",
              s.full_name AS "supervisorName"
         FROM supervision_records r
         LEFT JOIN users s ON s.id = r.advisor_id
        WHERE r.therapist_id = $1
        ORDER BY r.supervision_date DESC, r.created_at DESC
        LIMIT 10`,
      [id]
    );
    const { rows: concernRows } = await query(
      `SELECT c.id, c.reference, c.priority, c.status, c.category,
              c.created_at AS "createdAt"
         FROM safety_concerns c
        WHERE c.subject_user_id = $1
        ORDER BY c.created_at DESC LIMIT 10`,
      [id]
    );
    const { rows: caseReviewRows } = await query(
      `SELECT r.id, r.reference, r.domain, r.reason, r.priority, r.status,
              r.created_at AS "createdAt"
         FROM case_reviews r
        WHERE r.therapist_id = $1
        ORDER BY r.created_at DESC LIMIT 10`,
      [id]
    );

    res.json({
      practitioner: {
        ...rest,
        supportTypes: undefined,
        specialization: specializationOf(practitioner),
        supervision,
        workload: workloadBand(practitioner),
        performance: await performanceFor(id, practitioner),
      },
      escalations: escalationRows,
      interventions: interventionRows,
      supervisionRecords: supervisionRows,
      concerns: concernRows,
      caseReviews: caseReviewRows,
      intervalDays,
    });
  })
);

/**
 * Performance indicators for one practitioner. Deliberately a panel of
 * measures, not a single score: the purpose is to find where support,
 * supervision or training may be required.
 */
async function performanceFor(userId, practitioner) {
  const role = practitioner.role;
  const doc =
    role === "therapist"
      ? {
          completedSessions: (
            await queryOne(
              `SELECT count(*)::int AS n FROM sessions
                WHERE therapist_id = $1 AND status = 'completed'
                  AND scheduled_at > now() - interval '30 days'`,
              [userId]
            )
          ).n,
          finalNotes: (
            await queryOne(
              `SELECT count(*)::int AS n FROM sessions s
                WHERE s.therapist_id = $1 AND s.status = 'completed'
                  AND s.scheduled_at > now() - interval '30 days'
                  AND EXISTS (SELECT 1 FROM session_notes n
                               WHERE n.session_id = s.id AND n.status = 'final')`,
              [userId]
            )
          ).n,
          pendingDocumentation: practitioner.documentationPending ?? 0,
        }
      : null;

  const documentationRate =
    doc && doc.completedSessions > 0
      ? Math.round((doc.finalNotes / doc.completedSessions) * 100)
      : null;

  const { rows: reviewCounts } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'resolved')::int AS resolved
       FROM case_reviews WHERE therapist_id = $1`,
    [userId]
  );
  const { rows: interventionCounts } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'completed')::int AS completed,
            count(*) FILTER (WHERE status <> 'completed'
                              AND due_date IS NOT NULL
                              AND due_date < CURRENT_DATE)::int AS overdue
       FROM interventions WHERE assigned_to = $1`,
    [userId]
  );
  const { rows: sessionCounts } = await query(
    `SELECT count(*) FILTER (WHERE status = 'completed')::int AS completed,
            count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
       FROM sessions
      WHERE therapist_id = $1 AND scheduled_at > now() - interval '30 days'`,
    [userId]
  );

  const developmentFlags = [];
  if (practitioner.supervision?.status === "overdue") developmentFlags.push("Supervision overdue");
  if (practitioner.supervision?.status === "never") developmentFlags.push("No supervision recorded");
  if ((practitioner.documentationPending ?? 0) > 0) {
    developmentFlags.push(`${practitioner.documentationPending} session note(s) incomplete`);
  }
  if ((practitioner.openEscalations ?? 0) > 0) {
    developmentFlags.push(`${practitioner.openEscalations} open escalation(s)`);
  }

  const sessionCompletionRate =
    sessionCounts.completed + sessionCounts.cancelled > 0
      ? Math.round(
          (sessionCounts.completed / (sessionCounts.completed + sessionCounts.cancelled)) * 100
        )
      : null;

  return {
    supervision: practitioner.supervision,
    documentation: doc
      ? { ...doc, rate: documentationRate }
      : { completedSessions: null, finalNotes: null, pendingDocumentation: null, rate: null },
    sessionCompletionRate,
    caseReviews: {
      total: reviewCounts[0].total,
      resolved: reviewCounts[0].resolved,
      rate:
        reviewCounts[0].total > 0
          ? Math.round((reviewCounts[0].resolved / reviewCounts[0].total) * 100)
          : null,
    },
    interventions: interventionCounts[0],
    caseload: practitioner.activeClients ?? 0,
    developmentFlags,
  };
}

/** GET /api/supervisor/team/:id/clients */
supervisorRouter.get(
  "/team/:id/clients",
  requireAnyTeamPermission,
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Practitioner");
    const held = await supervisorPermissionsFor(req.user.id);
    if (!held.has("clients.view")) {
      throw forbidden("You do not have permission to view client overviews.");
    }

    const { rows } = await query(
      `SELECT c.id AS "caseId", c.status AS "caseStatus", c.opened_at AS "openedAt",
              u.id AS "clientId", u.full_name AS "clientName",
              (SELECT tp.status FROM treatment_plans tp
                WHERE tp.client_id = u.id AND tp.therapist_id = $1
                ORDER BY tp.updated_at DESC LIMIT 1)       AS "planStatus",
              (SELECT s.scheduled_at FROM sessions s
                WHERE s.user_id = u.id AND s.therapist_id = $1
                  AND s.status = 'scheduled' AND s.scheduled_at >= now()
                ORDER BY s.scheduled_at ASC LIMIT 1)       AS "nextSessionAt",
              (SELECT count(*)::int FROM case_reviews r
                WHERE r.client_id = u.id AND r.status <> 'resolved') AS "openCaseReviews",
              (SELECT count(*)::int FROM safety_escalations e
                WHERE e.client_id = u.id
                  AND e.status IN ('new', 'under_review', 'action_required')) AS "openEscalations"
         FROM client_cases c
         JOIN users u ON u.id = c.client_id
        WHERE c.therapist_id = $1
        ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
                 c.opened_at DESC`,
      [id]
    );

    res.json({ clients: rows, total: rows.length });
  })
);

/** GET /api/supervisor/team/:id/supervision */
supervisorRouter.get(
  "/team/:id/supervision",
  requireSupPermission("supervision.view"),
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Practitioner");

    const { rows } = await query(
      `SELECT r.id, r.supervision_date AS "supervisionDate", r.modality, r.focus,
              r.discussion_topics AS "discussionTopics",
              r.development_areas AS "developmentAreas",
              r.concerns, r.action_items AS "actionItems",
              r.checklist, r.status, r.follow_up_date AS "followUpDate",
              r.created_at AS "createdAt", r.updated_at AS "updatedAt",
              s.full_name AS "supervisorName", r.supervisor_role AS "supervisorRole"
         FROM supervision_records r
         LEFT JOIN users s ON s.id = r.advisor_id
        WHERE r.therapist_id = $1
        ORDER BY r.supervision_date DESC, r.created_at DESC`,
      [id]
    );

    res.json({ records: rows, total: rows.length });
  })
);

/** GET /api/supervisor/team/:id/reviews */
supervisorRouter.get(
  "/team/:id/reviews",
  requireSupPermission("case_reviews.view"),
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Practitioner");

    const { rows } = await query(
      `SELECT r.id, r.reference, r.domain, r.reason, r.priority, r.status,
              r.summary, r.follow_up_date AS "followUpDate",
              r.created_at AS "createdAt",
              s.full_name AS "assignedSupervisorName"
         FROM case_reviews r
         LEFT JOIN users s ON s.id = r.assigned_supervisor_id
        WHERE r.therapist_id = $1
        ORDER BY r.created_at DESC`,
      [id]
    );

    res.json({ reviews: rows, total: rows.length });
  })
);

/** GET /api/supervisor/team/:id/sessions - documentation review status. */
supervisorRouter.get(
  "/team/:id/sessions",
  requireSupPermission("session_reviews.view"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Practitioner");
    const held = await supervisorPermissionsFor(req.user.id);
    const maySeeClients = held.has("clients.view");

    const { rows } = await query(
      `SELECT s.id AS "sessionId", s.scheduled_at AS "scheduledAt", s.status,
              s.mode,
              CASE WHEN n.id IS NULL THEN 'missing'
                   WHEN n.status = 'draft' THEN 'draft'
                   ELSE 'final' END                    AS "documentationStatus",
              n.updated_at                             AS "documentedAt",
              r.id                                     AS "reviewId",
              r.review_status                          AS "reviewStatus",
              r.follow_up_required                     AS "followUpRequired",
              c.id                                     AS "clientId",
              c.full_name                              AS "clientName"
         FROM sessions s
         LEFT JOIN session_notes n ON n.session_id = s.id
         LEFT JOIN session_reviews r ON r.session_id = s.id
         LEFT JOIN users c ON c.id = s.user_id
        WHERE s.therapist_id = $1 AND s.status = 'completed'
        ORDER BY s.scheduled_at DESC
        LIMIT 50`,
      [id]
    );

    res.json({
      sessions: rows.map((row) => ({
        ...row,
        clientName: maySeeClients ? row.clientName : null,
      })),
      total: rows.length,
      maySeeClients,
    });
  })
);

/** GET /api/supervisor/team/:id/activity */
supervisorRouter.get(
  "/team/:id/activity",
  requireAnyTeamPermission,
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Practitioner");

    const { rows } = await query(
      `SELECT 'supervision' AS kind, r.id, r.status,
              'Supervision ' || r.status || ' (' || r.supervision_date || ')' AS title,
              r.updated_at AS "createdAt"
         FROM supervision_records r WHERE r.therapist_id = $1
        UNION ALL
       SELECT 'case_review', r.id, r.status,
              'Case review ' || r.reference || ' (' || r.status || ')',
              r.updated_at
         FROM case_reviews r WHERE r.therapist_id = $1
        UNION ALL
       SELECT 'intervention', i.id, i.status,
              'Intervention ' || i.reference || ' (' || i.status || ')',
              i.updated_at
         FROM interventions i WHERE i.assigned_to = $1
        UNION ALL
       SELECT 'concern', c.id, c.status,
              'Safety concern ' || c.reference || ' (' || c.status || ')',
              c.updated_at
         FROM safety_concerns c WHERE c.subject_user_id = $1
        UNION ALL
       SELECT 'escalation', e.id, e.status,
              'Escalation ' || e.reference || ' (' || e.status || ')',
              e.updated_at
         FROM safety_escalations e WHERE e.therapist_id = $1
        ORDER BY 4 DESC
        LIMIT 40`,
      [id]
    );

    res.json({ activity: rows, total: rows.length });
  })
);

/* ------------------------------------------------------------------ */
/* Supervision                                                         */
/* ------------------------------------------------------------------ */

const SUPERVISION_LIST_COLUMNS = `
  r.id,
  r.therapist_id                              AS "practitionerId",
  practitioner.full_name                      AS "practitionerName",
  practitioner.role                           AS "practitionerRole",
  r.advisor_id                                AS "supervisorId",
  supervisor.full_name                        AS "supervisorName",
  r.supervision_date::text                    AS "supervisionDate",
  r.modality,
  r.focus,
  r.discussion_topics                         AS "discussionTopics",
  r.checklist,
  r.action_items                              AS "actionItems",
  r.concerns,
  r.follow_up_date::text                      AS "followUpDate",
  r.status,
  r.supervisor_role                           AS "supervisorRole",
  r.created_at                                AS "createdAt",
  r.updated_at                                AS "updatedAt"
`;

const SUPERVISION_LIST_FROM = `
  FROM supervision_records r
  JOIN users practitioner ON practitioner.id = r.therapist_id
  LEFT JOIN users supervisor ON supervisor.id = r.advisor_id
`;

/** GET /api/supervisor/supervision */
supervisorRouter.get(
  "/supervision",
  requireSupPermission("supervision.view"),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const role = typeof req.query.role === "string" ? req.query.role.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const intervalDays = await readIntSetting("supervision_interval_days", 30);

    const filters = [];
    const params = [];
    if (status) {
      params.push(status);
      filters.push(`r.status = $${params.length}`);
    }
    if (role === "therapist" || role === "supporter") {
      params.push(role);
      filters.push(`practitioner.role = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const at = params.length;
      filters.push(`(practitioner.full_name ILIKE $${at} OR r.focus ILIKE $${at})`);
    }

    const { rows: records } = await query(
      `SELECT ${SUPERVISION_LIST_COLUMNS}
         ${SUPERVISION_LIST_FROM}
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY r.supervision_date DESC, r.created_at DESC
        LIMIT 200`,
      params
    );

    // The due list covers therapists and supporters: supervision is for the
    // whole team, not only registered therapists.
    const { rows: team } = await query(
      `SELECT ${PRACTITIONER_COLUMNS}
         ${PRACTITIONER_FROM}
        WHERE u.status = 'active' AND u.role IN ('therapist', 'supporter')
        ORDER BY u.full_name`
    );

    const due = team
      .map((row) => ({
        id: row.id,
        fullName: row.fullName,
        role: row.role,
        specialization: specializationOf(row),
        lastSupervisionDate: row.lastSupervisionDate,
        supervision: supervisionStatus(row.lastSupervisionDate, intervalDays),
      }))
      .filter((member) => ["overdue", "due_soon", "never"].includes(member.supervision.status));

    const counts = records.reduce(
      (acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      },
      { open: 0, completed: 0, closed: 0 }
    );

    res.json({
      records,
      total: records.length,
      counts,
      due,
      intervalDays,
      overview: {
        totalRecords: records.length,
        dueCount: due.length,
        overdue: due.filter((m) => m.supervision.status === "overdue").length,
        never: due.filter((m) => m.supervision.status === "never").length,
        scheduled: counts.open ?? 0,
      },
    });
  })
);

const checklistSchema = z.array(z.string().trim().min(1).max(120)).max(20);

const createSupervisionSchema = z.object({
  practitionerId: z.string().trim().uuid("Choose the practitioner to supervise"),
  supervisionDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD"),
  modality: z.enum(["individual", "group", "peer", "case_review"]).optional().default("individual"),
  focus: textOrNull(400),
  checklist: checklistSchema.optional(),
  discussionTopics: textOrNull(8000),
  developmentAreas: textOrNull(4000),
  actionItems: textOrNull(8000),
  followUpDate: dateOrNull,
});

/** POST /api/supervisor/supervision - schedule or open supervision. */
supervisorRouter.post(
  "/supervision",
  requireSupPermission("supervision.create"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const data = parse(createSupervisionSchema, req.body);

    const practitioner = await queryOne(
      `SELECT id, full_name, role FROM users
        WHERE id = $1 AND role IN ('therapist', 'supporter') AND status = 'active'`,
      [data.practitionerId]
    );
    if (!practitioner) throw badRequest("Choose an active therapist or supporter");

    const { rows } = await query(
      `INSERT INTO supervision_records
         (therapist_id, advisor_id, supervision_date, modality, focus,
          checklist, discussion_topics, development_areas, action_items,
          follow_up_date, status, supervisor_role)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, 'open', $11)
       RETURNING id`,
      [
        data.practitionerId,
        req.user.id,
        data.supervisionDate,
        data.modality,
        data.focus ?? null,
        JSON.stringify(data.checklist ?? []),
        data.discussionTopics ?? null,
        data.developmentAreas ?? null,
        data.actionItems ?? null,
        data.followUpDate ?? null,
        req.user.role,
      ]
    );
    const record = rows[0];

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SUPERVISION_CREATED,
      targetType: "supervision",
      targetId: record.id,
      detail: { practitionerId: data.practitionerId, date: data.supervisionDate },
    });

    await notify({
      userId: data.practitionerId,
      type: "supervision_reminder",
      title: "Supervision scheduled",
      body: `A supervision session has been scheduled for ${data.supervisionDate}.`,
      link: null,
      data: { supervisionId: record.id },
      key: `supervision-scheduled:${record.id}`,
    });

    res.status(201).json({ record });
  })
);

/** GET /api/supervisor/supervision/:id - one record. */
supervisorRouter.get(
  "/supervision/:id",
  requireSupPermission("supervision.view"),
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Supervision record");

    const record = await queryOne(
      `SELECT ${SUPERVISION_LIST_COLUMNS},
              r.concerns, r.development_areas AS "developmentAreas"
         ${SUPERVISION_LIST_FROM}
        WHERE r.id = $1`,
      [id]
    );
    if (!record) throw notFound("That supervision record does not exist");

    res.json({ record });
  })
);

const patchSupervisionSchema = z.object({
  supervisionDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
    .optional(),
  modality: z.enum(["individual", "group", "peer", "case_review"]).optional(),
  focus: textOrNull(400),
  checklist: checklistSchema.optional(),
  discussionTopics: textOrNull(8000),
  developmentAreas: textOrNull(4000),
  concerns: textOrNull(8000),
  actionItems: textOrNull(8000),
  followUpDate: dateOrNull,
});

/** PATCH /api/supervisor/supervision/:id - edit an open record. */
supervisorRouter.patch(
  "/supervision/:id",
  requireSupPermission("supervision.manage"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Supervision record");
    const data = parse(patchSupervisionSchema, req.body);

    const current = await queryOne(
      `SELECT id, status FROM supervision_records WHERE id = $1`,
      [id]
    );
    if (!current) throw notFound("That supervision record does not exist");
    if (current.status === "closed") throw conflict("This record is closed");

    await query(
      `UPDATE supervision_records
          SET supervision_date = COALESCE($2, supervision_date),
              modality = COALESCE($3, modality),
              focus = COALESCE($4, focus),
              checklist = COALESCE($5::jsonb, checklist),
              discussion_topics = COALESCE($6, discussion_topics),
              development_areas = COALESCE($7, development_areas),
              concerns = COALESCE($8, concerns),
              action_items = COALESCE($9, action_items),
              follow_up_date = COALESCE($10, follow_up_date)
        WHERE id = $1`,
      [
        id,
        data.supervisionDate ?? null,
        data.modality ?? null,
        data.focus ?? null,
        data.checklist ? JSON.stringify(data.checklist) : null,
        data.discussionTopics ?? null,
        data.developmentAreas ?? null,
        data.concerns ?? null,
        data.actionItems ?? null,
        data.followUpDate ?? null,
      ]
    );

    const record = await queryOne(
      `SELECT ${SUPERVISION_LIST_COLUMNS}
         ${SUPERVISION_LIST_FROM}
        WHERE r.id = $1`,
      [id]
    );
    res.json({ record });
  })
);

const completeSupervisionSchema = z.object({
  checklist: checklistSchema.optional(),
  discussionTopics: textOrNull(8000),
  developmentAreas: textOrNull(4000),
  concerns: textOrNull(8000),
  actionItems: textOrNull(8000),
  followUpDate: dateOrNull,
  summary: textOrNull(4000),
});

/** POST /api/supervisor/supervision/:id/complete - mark supervision done. */
supervisorRouter.post(
  "/supervision/:id/complete",
  requireSupPermission("supervision.manage"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Supervision record");
    const data = parse(completeSupervisionSchema, req.body);

    const current = await queryOne(
      `SELECT id, status, therapist_id FROM supervision_records WHERE id = $1`,
      [id]
    );
    if (!current) throw notFound("That supervision record does not exist");
    if (current.status === "completed") throw conflict("This supervision is already completed");
    if (current.status === "closed") throw conflict("This record is closed");

    await query(
      `UPDATE supervision_records
          SET status = 'completed',
              checklist = COALESCE($2::jsonb, checklist),
              discussion_topics = COALESCE($3, discussion_topics),
              development_areas = COALESCE($4, development_areas),
              concerns = COALESCE($5, concerns),
              action_items = COALESCE($6, action_items),
              follow_up_date = COALESCE($7, follow_up_date),
              supervisor_role = COALESCE($8, supervisor_role),
              advisor_id = $9
        WHERE id = $1`,
      [
        id,
        data.checklist ? JSON.stringify(data.checklist) : null,
        data.discussionTopics ?? null,
        data.developmentAreas ?? null,
        data.concerns ?? null,
        data.actionItems ?? null,
        data.followUpDate ?? null,
        req.user.role,
        req.user.id,
      ]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SUPERVISION_COMPLETED,
      targetType: "supervision",
      targetId: id,
      detail: { practitionerId: current.therapist_id },
    });

    if (data.summary) {
      await recordActivity({
        domain: "supervision",
        targetId: id,
        action: "completed",
        detail: data.summary,
        fromStatus: current.status,
        toStatus: "completed",
        actorId: req.user.id,
        actorRole: req.user.role,
      });
    }

    await notify({
      userId: current.therapist_id,
      type: "supervision_reminder",
      title: "Supervision completed",
      body: data.summary ?? "Your supervision session has been recorded as completed.",
      link: null,
      data: { supervisionId: id },
      key: `supervision-completed:${id}`,
    });

    const record = await queryOne(
      `SELECT ${SUPERVISION_LIST_COLUMNS}
         ${SUPERVISION_LIST_FROM}
        WHERE r.id = $1`,
      [id]
    );
    res.json({ record, ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Case reviews (including ethical concerns)                           */
/* ------------------------------------------------------------------ */

const CASE_REVIEW_COLUMNS = `
  r.id,
  r.reference,
  r.domain,
  r.reason,
  r.priority,
  r.status,
  r.summary,
  r.information,
  r.supervisor_notes                         AS "supervisorNotes",
  r.client_id                                AS "clientId",
  client.full_name                           AS "clientName",
  r.therapist_id                             AS "therapistId",
  practitioner.full_name                     AS "therapistName",
  practitioner.role                          AS "therapistRole",
  r.assigned_supervisor_id                   AS "assignedSupervisorId",
  supervisor.full_name                       AS "assignedSupervisorName",
  r.escalation_id                            AS "escalationId",
  esc.reference                              AS "escalationReference",
  r.follow_up_date::text                     AS "followUpDate",
  r.resolution,
  r.advisor_escalated_at                     AS "advisorEscalatedAt",
  r.created_by                               AS "createdBy",
  creator.full_name                          AS "createdByName",
  r.resolved_at                              AS "resolvedAt",
  r.created_at                               AS "createdAt",
  r.updated_at                               AS "updatedAt"
`;

const CASE_REVIEW_FROM = `
  FROM case_reviews r
  LEFT JOIN users client      ON client.id = r.client_id
  LEFT JOIN users practitioner ON practitioner.id = r.therapist_id
  LEFT JOIN users supervisor  ON supervisor.id = r.assigned_supervisor_id
  LEFT JOIN users creator     ON creator.id = r.created_by
  LEFT JOIN safety_escalations esc ON esc.id = r.escalation_id
`;

/** GET /api/supervisor/case-reviews */
supervisorRouter.get(
  "/case-reviews",
  requireSupPermission("case_reviews.view"),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const domain = typeof req.query.domain === "string" ? req.query.domain.trim() : "";
    const reason = typeof req.query.reason === "string" ? req.query.reason.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const filters = [];
    const params = [];
    if (status) {
      params.push(status);
      filters.push(`r.status = $${params.length}`);
    }
    if (domain === "clinical" || domain === "ethics") {
      params.push(domain);
      filters.push(`r.domain = $${params.length}`);
    }
    if (reason) {
      params.push(reason);
      filters.push(`r.reason = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const at = params.length;
      filters.push(
        `(r.reference ILIKE $${at} OR r.summary ILIKE $${at}
          OR practitioner.full_name ILIKE $${at} OR client.full_name ILIKE $${at})`
      );
    }

    const { rows } = await query(
      `SELECT ${CASE_REVIEW_COLUMNS}
         ${CASE_REVIEW_FROM}
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY CASE r.priority
                   WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                   WHEN 'medium' THEN 2 ELSE 3
                 END,
                 r.created_at DESC
        LIMIT 200`,
      params
    );

    const held = await supervisorPermissionsFor(req.user.id);
    const maySeeClients = held.has("clients.view");
    const reviews = rows.map((row) => ({
      ...row,
      clientName: maySeeClients ? row.clientName : null,
    }));

    const { rows: countRows } = await query(
      `SELECT
         count(*) FILTER (WHERE status IN ('open', 'in_review', 'awaiting_information'))::int AS "pending",
         count(*) FILTER (WHERE status = 'escalated')::int AS "escalated",
         count(*) FILTER (WHERE status = 'resolved')::int AS "resolved",
         count(*) FILTER (WHERE domain = 'ethics' AND status <> 'resolved')::int AS "openEthics",
         count(*) FILTER (WHERE follow_up_date IS NOT NULL AND follow_up_date < CURRENT_DATE
                           AND status <> 'resolved')::int AS "overdueFollowUps"
       FROM case_reviews`
    );

    res.json({ reviews, total: reviews.length, counts: countRows[0], maySeeClients });
  })
);

const CASE_REASONS = [
  "complex_case",
  "limited_progress",
  "practitioner_request",
  "safety_concern",
  "treatment_plan_concern",
  "documentation_concern",
  "client_concern",
  "missed_sessions",
  "escalation",
  "ethical_concern",
  "confidentiality_concern",
  "communication_concern",
  "boundary_concern",
  "consent_concern",
  "unauthorized_access",
  "disclosure_concern",
  "conflict_of_interest",
  "conduct_concern",
];

const createCaseReviewSchema = z.object({
  domain: z.enum(["clinical", "ethics"]).optional().default("clinical"),
  reason: z.enum(CASE_REASONS).optional().default("complex_case"),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  summary: z.string().trim().min(10, "Describe why this case needs review").max(4000),
  clientId: z.string().trim().uuid().nullable().optional(),
  therapistId: z.string().trim().uuid("Choose the practitioner this is about").nullable().optional(),
  followUpDate: dateOrNull,
});

/** POST /api/supervisor/case-reviews */
supervisorRouter.post(
  "/case-reviews",
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const data = parse(createCaseReviewSchema, req.body);
    const held = await supervisorPermissionsFor(req.user.id);

    const mayCreate =
      data.domain === "ethics"
        ? held.has("case_reviews.create") || held.has("ethical_oversight.manage")
        : held.has("case_reviews.create");
    if (!mayCreate) throw forbidden("You do not have permission to open case reviews.");
    if (data.clientId && !held.has("clients.case_review")) {
      throw forbidden("You do not have permission to open reviews against a client.");
    }

    if (data.therapistId) {
      const practitioner = await queryOne(
        `SELECT id FROM users WHERE id = $1 AND role IN ('therapist', 'supporter')`,
        [data.therapistId]
      );
      if (!practitioner) throw badRequest("Choose an active therapist or supporter");
    }

    const reference = newReference("CR");
    const { rows } = await query(
      `INSERT INTO case_reviews
         (reference, domain, reason, priority, status, summary,
          client_id, therapist_id, assigned_supervisor_id, follow_up_date, created_by)
       VALUES ($1, $2, $3, $4, 'open', $5, $6, $7, $8, $9, $10)
       RETURNING id, reference, status`,
      [
        reference,
        data.domain,
        data.reason,
        data.priority,
        data.summary,
        data.clientId ?? null,
        data.therapistId ?? null,
        req.user.id,
        data.followUpDate ?? null,
        req.user.id,
      ]
    );
    const review = rows[0];

    await recordActivity({
      domain: "case_review",
      targetId: review.id,
      action: "created",
      detail: data.summary,
      toStatus: "open",
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.CASE_REVIEW_CREATED,
      targetType: "case_review",
      targetId: review.id,
      detail: { reference, domain: data.domain, reason: data.reason, priority: data.priority },
    });

    await notifySupervisors({
      type: "case_review_assigned",
      title: `New case review ${reference}`,
      body: data.summary,
      link: `/portal/clinical_supervisor/case-reviews/${review.id}`,
      data: { caseReviewId: review.id },
      key: `case-review-created:${review.id}`,
    });

    res.status(201).json({ review });
  })
);

/** GET /api/supervisor/case-reviews/:id */
supervisorRouter.get(
  "/case-reviews/:id",
  requireSupPermission("case_reviews.view"),
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Case review");

    const review = await queryOne(
      `SELECT ${CASE_REVIEW_COLUMNS}
         ${CASE_REVIEW_FROM}
        WHERE r.id = $1`,
      [id]
    );
    if (!review) throw notFound("That case review does not exist");

    const { rows: activity } = await query(
      `SELECT a.id, a.action, a.detail, a.from_status AS "fromStatus",
              a.to_status AS "toStatus", a.actor_id AS "actorId",
              u.full_name AS "actorName", a.actor_role AS "actorRole",
              a.created_at AS "createdAt"
         FROM supervisor_activity a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.domain = 'case_review' AND a.target_id = $1
        ORDER BY a.created_at ASC`,
      [id]
    );

    const { rows: linkedInterventions } = await query(
      `SELECT i.id, i.reference, i.title, i.status, i.priority, i.due_date AS "dueDate"
         FROM interventions i
        WHERE i.related_type = 'case_review' AND i.related_id = $1
        ORDER BY i.created_at DESC`,
      [id]
    );

    const held = await supervisorPermissionsFor(req.user.id);
    const maySeeClients = held.has("clients.view");

    if (review.clientId) {
      await logAudit({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: AUDIT_ACTIONS.SENSITIVE_READ,
        targetType: "case_review",
        targetId: id,
        detail: { reference: review.reference },
      });
    }

    res.json({
      review: { ...review, clientName: maySeeClients ? review.clientName : null },
      activity,
      interventions: linkedInterventions,
      maySeeClients,
    });
  })
);

const CASE_REVIEW_ACTIONS = {
  note: { status: null, label: "added a supervisor note" },
  request_information: { status: "awaiting_information", label: "requested more information" },
  start_review: { status: "in_review", label: "started reviewing" },
  create_action: { status: null, label: "recorded a required action" },
  schedule_follow_up: { status: null, label: "scheduled a follow-up" },
  escalate_to_advisor: { status: "escalated", label: "escalated to the Clinical Advisor" },
  resolve: { status: "resolved", label: "resolved the review" },
  reopen: { status: "open", label: "reopened the review" },
};

const caseReviewActionSchema = z.object({
  action: z.enum(Object.keys(CASE_REVIEW_ACTIONS)),
  detail: textOrNull(4000),
  followUpDate: dateOrNull,
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  confirm: z.boolean().optional(),
});

/**
 * POST /api/supervisor/case-reviews/:id/actions
 *
 * Escalating to the Clinical Advisor creates a real row on the shared
 * escalation queue, so the advisor receives a work item they can act on
 * through their own portal rather than a message in a void.
 */
supervisorRouter.post(
  "/case-reviews/:id/actions",
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Case review");
    const data = parse(caseReviewActionSchema, req.body);

    const current = await queryOne(
      `SELECT id, reference, domain, status, priority, summary, client_id, therapist_id,
              escalation_id, advisor_escalated_at
         FROM case_reviews WHERE id = $1`,
      [id]
    );
    if (!current) throw notFound("That case review does not exist");

    const held = await supervisorPermissionsFor(req.user.id);
    const mayAct =
      held.has("case_reviews.manage") ||
      (current.domain === "ethics" && held.has("ethical_oversight.manage"));
    if (!mayAct) throw forbidden("You do not have permission to act on this review.");

    const config = CASE_REVIEW_ACTIONS[data.action];
    const fromStatus = current.status;

    if (fromStatus === "resolved" && !["reopen", "note"].includes(data.action)) {
      throw conflict("This review is resolved. Reopen it first to change it.");
    }
    if (data.action === "resolve") {
      if (fromStatus === "resolved") throw conflict("This review is already resolved");
      if (current.priority === "critical" && data.confirm !== true) {
        throw badRequest("Confirm explicitly to resolve a critical review");
      }
      if (!data.detail) throw badRequest("Record the outcome of the review");
    }
    if (data.action === "reopen" && fromStatus !== "resolved") {
      throw conflict("Only a resolved review can be reopened");
    }
    if (data.action === "schedule_follow_up" && !data.followUpDate) {
      throw badRequest("Choose a follow-up date");
    }
    if (data.action === "escalate_to_advisor" && current.advisor_escalated_at) {
      throw conflict("This review has already been escalated to the Clinical Advisor");
    }

    const nextStatus = config.status ?? fromStatus;
    const nextPriority =
      data.action === "escalate_to_advisor"
        ? higherPriority(current.priority, data.priority ?? "high")
        : (data.priority ?? current.priority);

    let escalation = null;

    await transaction(async (tx) => {
      await tx.query(
        `UPDATE case_reviews
            SET status = $2,
                priority = $3,
                follow_up_date = COALESCE($4, follow_up_date),
                supervisor_notes = CASE WHEN $5::text IS NOT NULL
                                        THEN supervisor_notes || E'\n' || $5::text
                                        ELSE supervisor_notes END,
                resolution = COALESCE($6, resolution),
                advisor_escalated_at = CASE WHEN $2 = 'escalated' THEN now()
                                            ELSE advisor_escalated_at END,
                resolved_at = CASE WHEN $2 = 'resolved' THEN now()
                                   WHEN $2 = 'open' THEN NULL
                                   ELSE resolved_at END
          WHERE id = $1`,
        [
          id,
          nextStatus,
          nextPriority,
          data.action === "schedule_follow_up" ? data.followUpDate : null,
          data.action === "note" && data.detail ? `Note: ${data.detail}` : null,
          data.action === "resolve" ? data.detail : null,
        ]
      );

      await tx.query(
        `INSERT INTO supervisor_activity
           (domain, target_id, action, detail, from_status, to_status, actor_id, actor_role)
         VALUES ('case_review', $1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          data.action,
          data.detail ?? config.label,
          fromStatus,
          nextStatus,
          req.user.id,
          req.user.role,
        ]
      );
    });

    if (data.action === "escalate_to_advisor") {
      escalation = await recordEscalation({
        source: "supervisor",
        priority: nextPriority,
        riskType: current.domain === "ethics" ? "ethical concern" : current.reason,
        reason: `${current.reference}: ${current.summary}`,
        observations: data.detail ?? null,
        recommendedAction: "Clinical guidance requested by the clinic supervisor.",
        clientId: current.client_id,
        therapistId: current.therapist_id,
        createdBy: req.user.id,
      });
      await query(`UPDATE case_reviews SET escalation_id = $2 WHERE id = $1`, [
        id,
        escalation.id,
      ]);
      await notifySupervisors({
        type: "ethical_concern",
        title: `Case review ${current.reference} escalated to the advisor`,
        body: data.detail ?? current.summary,
        link: `/portal/clinical_supervisor/case-reviews/${id}`,
        data: { caseReviewId: id },
        key: `case-review-escalated:${escalation.id}`,
      });
    }

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.CASE_REVIEW_ACTION,
      targetType: "case_review",
      targetId: id,
      detail: {
        reference: current.reference,
        action: data.action,
        fromStatus,
        toStatus: nextStatus,
        priority: nextPriority,
      },
    });

    res.json({
      ok: true,
      status: nextStatus,
      priority: nextPriority,
      escalation: escalation ? { id: escalation.id, reference: escalation.reference } : null,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Session / documentation reviews                                     */
/* ------------------------------------------------------------------ */

const SESSION_REVIEW_SELECT = `
  SELECT r.id,
         r.session_id                             AS "sessionId",
         s.scheduled_at                           AS "scheduledAt",
         s.duration_minutes                       AS "durationMinutes",
         s.mode,
         s.status                                 AS "sessionStatus",
         r.therapist_id                           AS "therapistId",
         therapist.full_name                      AS "therapistName",
         therapist.role                           AS "therapistRole",
         r.client_id                              AS "clientId",
         client.full_name                         AS "clientName",
         r.review_status                          AS "reviewStatus",
         r.supervisor_feedback                    AS "supervisorFeedback",
         r.follow_up_required                     AS "followUpRequired",
         r.follow_up_date::text                   AS "followUpDate",
         r.supervisor_id                          AS "supervisorId",
         supervisor.full_name                     AS "supervisorName",
         r.reviewed_at                            AS "reviewedAt",
         r.created_at                             AS "createdAt",
         r.updated_at                             AS "updatedAt",
         CASE WHEN n.id IS NULL THEN 'missing'
              WHEN n.status = 'draft' THEN 'draft'
              ELSE 'final' END                    AS "documentationStatus",
         n.status                                 AS "noteStatus",
         n.updated_at                             AS "documentedAt"
    FROM session_reviews r
    JOIN sessions s ON s.id = r.session_id
    JOIN users therapist ON therapist.id = r.therapist_id
    JOIN users client ON client.id = r.client_id
    LEFT JOIN session_notes n ON n.session_id = s.id
    LEFT JOIN users supervisor ON supervisor.id = r.supervisor_id
`;

/**
 * GET /api/supervisor/session-reviews
 *
 * The queue is every completed session in the window, with its review row
 * (if one exists) and the live documentation status. `awaiting_review` means
 * no review has been opened yet.
 */
supervisorRouter.get(
  "/session-reviews",
  requireSupPermission("session_reviews.view"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const held = await supervisorPermissionsFor(req.user.id);
    const maySeeClients = held.has("clients.view");

    const filters = [`s.status = 'completed'`, `s.scheduled_at > now() - interval '90 days'`];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      const at = params.length;
      filters.push(`(therapist.full_name ILIKE $${at} OR client.full_name ILIKE $${at})`);
    }

    let where = filters.join(" AND ");
    if (status === "awaiting_review") {
      where += ` AND r.id IS NULL`;
    } else if (status === "documentation") {
      where += ` AND (n.id IS NULL OR n.status = 'draft')`;
    } else if (status === "follow_up") {
      where += ` AND r.follow_up_required = true AND r.review_status <> 'completed'`;
    } else if (["pending", "in_review", "completed"].includes(status)) {
      where += ` AND r.review_status = $${params.length + 1}`;
      params.push(status);
    }

    const { rows } = await query(
      `SELECT s.id AS "sessionId", s.scheduled_at AS "scheduledAt", s.mode,
              s.duration_minutes AS "durationMinutes",
              COALESCE(r.id, s.id)              AS "id",
              r.id                              AS "reviewRowId",
              therapist.id                      AS "therapistId",
              therapist.full_name               AS "therapistName",
              therapist.role                    AS "therapistRole",
              client.id                         AS "clientId",
              client.full_name                  AS "clientName",
              COALESCE(r.review_status, 'awaiting_review') AS "reviewStatus",
              r.supervisor_feedback             AS "supervisorFeedback",
              r.follow_up_required              AS "followUpRequired",
              r.follow_up_date::text            AS "followUpDate",
              r.reviewed_at                     AS "reviewedAt",
              CASE WHEN n.id IS NULL THEN 'missing'
                   WHEN n.status = 'draft' THEN 'draft'
                   ELSE 'final' END             AS "documentationStatus",
              n.updated_at                      AS "documentedAt"
         FROM sessions s
         JOIN users therapist ON therapist.id = s.therapist_id
         JOIN users client ON client.id = s.user_id
         LEFT JOIN session_notes n ON n.session_id = s.id
         LEFT JOIN session_reviews r ON r.session_id = s.id
        WHERE ${where}
        ORDER BY s.scheduled_at DESC
        LIMIT 200`,
      params
    );

    const sessions = rows.map((row) => ({
      ...row,
      clientName: maySeeClients ? row.clientName : null,
    }));

    const counts = sessions.reduce(
      (acc, row) => {
        acc[row.reviewStatus] = (acc[row.reviewStatus] ?? 0) + 1;
        if (row.documentationStatus !== "final") acc.documentationPending += 1;
        return acc;
      },
      { awaiting_review: 0, pending: 0, in_review: 0, completed: 0, documentationPending: 0 }
    );

    res.json({ sessions, total: sessions.length, counts, maySeeClients });
  })
);

/** POST /api/supervisor/session-reviews - open a review for a session. */
supervisorRouter.post(
  "/session-reviews",
  requireSupPermission("session_reviews.manage"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const { sessionId } = parse(
      z.object({ sessionId: z.string().trim().uuid("Choose a session") }),
      req.body
    );

    const session = await queryOne(
      `SELECT id, status FROM sessions WHERE id = $1`,
      [sessionId]
    );
    if (!session) throw notFound("That session does not exist");
    if (session.status !== "completed") {
      throw badRequest("Only completed sessions can be reviewed");
    }

    const { rows } = await query(
      `INSERT INTO session_reviews (session_id, therapist_id, client_id, review_status, supervisor_id)
       SELECT s.id, s.therapist_id, s.user_id, 'in_review', $2
         FROM sessions s WHERE s.id = $1
       ON CONFLICT (session_id) DO UPDATE
         SET review_status = CASE WHEN session_reviews.review_status = 'completed'
                                  THEN session_reviews.review_status
                                  ELSE 'in_review' END,
             supervisor_id = $2,
             updated_at = now()
       RETURNING id, session_id AS "sessionId", review_status AS "reviewStatus"`,
      [sessionId, req.user.id]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SESSION_REVIEWED,
      targetType: "session_review",
      targetId: rows[0].id,
      detail: { sessionId, phase: "opened" },
    });

    res.status(201).json({ review: rows[0] });
  })
);

/** GET /api/supervisor/session-reviews/:id */
supervisorRouter.get(
  "/session-reviews/:id",
  requireSupPermission("session_reviews.view"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Session review");
    const held = await supervisorPermissionsFor(req.user.id);
    const maySeeClients = held.has("clients.view");

    const review = await queryOne(
      `${SESSION_REVIEW_SELECT}
        WHERE (r.id = $1 OR (r.id IS NULL AND s.id = $1)) LIMIT 1`,
      [id]
    );
    if (!review) {
      // The queue also returns sessions with no review row, keyed by session id.
      const { rows } = await query(
        `SELECT s.id AS "sessionId", s.scheduled_at AS "scheduledAt",
                s.duration_minutes AS "durationMinutes", s.mode, s.status AS "sessionStatus",
                s.therapist_id AS "therapistId",
                therapist.full_name AS "therapistName", therapist.role AS "therapistRole",
                s.user_id AS "clientId", client.full_name AS "clientName",
                CASE WHEN n.id IS NULL THEN 'missing'
                     WHEN n.status = 'draft' THEN 'draft'
                     ELSE 'final' END AS "documentationStatus",
                n.status AS "noteStatus", n.updated_at AS "documentedAt"
           FROM sessions s
           JOIN users therapist ON therapist.id = s.therapist_id
           JOIN users client ON client.id = s.user_id
           LEFT JOIN session_notes n ON n.session_id = s.id
          WHERE s.id = $1`,
        [id]
      );
      if (!rows[0]) throw notFound("That session review does not exist");
      return res.json({
        review: {
          ...rows[0],
          id,
          reviewRowId: null,
          reviewStatus: "awaiting_review",
          supervisorFeedback: null,
          followUpRequired: false,
          followUpDate: null,
          reviewedAt: null,
          clientName: maySeeClients ? rows[0].clientName : null,
        },
        maySeeClients,
        activity: [],
      });
    }

    const { rows: activity } = await query(
      `SELECT a.id, a.action, a.detail, a.to_status AS "toStatus",
              u.full_name AS "actorName", a.actor_role AS "actorRole",
              a.created_at AS "createdAt"
         FROM supervisor_activity a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.domain = 'session_review' AND a.target_id = $1
        ORDER BY a.created_at ASC`,
      [review.id]
    );

    res.json({
      review: { ...review, clientName: maySeeClients ? review.clientName : null },
      maySeeClients,
      activity,
    });
  })
);

const feedbackSchema = z.object({
  feedback: textOrNull(8000),
  followUpRequired: z.boolean().optional(),
  followUpDate: dateOrNull,
  complete: z.boolean().optional(),
});

/** POST /api/supervisor/session-reviews/:id/feedback */
supervisorRouter.post(
  "/session-reviews/:id/feedback",
  requireSupPermission("session_reviews.manage"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Session review");
    const data = parse(feedbackSchema, req.body);

    const current = await queryOne(
      `SELECT id, session_id, therapist_id, review_status
         FROM session_reviews WHERE id = $1`,
      [id]
    );
    if (!current) throw notFound("That session review does not exist");

    const nextStatus = data.complete ? "completed" : "in_review";

    await query(
      `UPDATE session_reviews
          SET supervisor_feedback = COALESCE($2, supervisor_feedback),
              follow_up_required = COALESCE($3, follow_up_required),
              follow_up_date = COALESCE($4, follow_up_date),
              review_status = $5,
              supervisor_id = COALESCE(supervisor_id, $6),
              reviewed_at = CASE WHEN $5 = 'completed' THEN now() ELSE reviewed_at END
        WHERE id = $1`,
      [
        id,
        data.feedback ?? null,
        data.followUpRequired ?? null,
        data.followUpDate ?? null,
        nextStatus,
        req.user.id,
      ]
    );

    await recordActivity({
      domain: "session_review",
      targetId: id,
      action: data.complete ? "completed" : "feedback",
      detail: data.feedback ?? "Supervisor feedback recorded",
      fromStatus: current.review_status,
      toStatus: nextStatus,
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SESSION_REVIEWED,
      targetType: "session_review",
      targetId: id,
      detail: { sessionId: current.session_id, phase: nextStatus },
    });

    if (data.feedback || data.complete) {
      await notify({
        userId: current.therapist_id,
        type: "documentation_review",
        title: data.complete ? "Documentation review completed" : "Supervisor feedback added",
        body: "Your supervisor left feedback on a session record.",
        link: null,
        data: { sessionReviewId: id },
        key: `session-review-feedback:${id}:${Date.now()}`,
      });
    }

    res.json({ ok: true, reviewStatus: nextStatus });
  })
);

/**
 * GET /api/supervisor/session-reviews/:id/documentation
 *
 * The one deliberate door to private session documentation: permission
 * gated, and the read is written to the audit log with the session id - never
 * the content. Supervisors come here to review documentation quality, and
 * every visit is attributable afterwards.
 */
supervisorRouter.get(
  "/session-reviews/:id/documentation",
  requireSupPermission("session_reviews.manage"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Session review");

    const row = await queryOne(
      `SELECT COALESCE(r.session_id, s.id) AS session_id
         FROM sessions s
         LEFT JOIN session_reviews r ON r.id = $1
        WHERE s.id = $1 OR s.id = (SELECT session_id FROM session_reviews WHERE id = $1)
        LIMIT 1`,
      [id]
    );
    const sessionId = row?.session_id ?? (await queryOne(
      `SELECT session_id FROM session_reviews WHERE id = $1`,
      [id]
    ))?.session_id;
    if (!sessionId) throw notFound("That session review does not exist");

    const note = await queryOne(
      `SELECT id, session_id AS "sessionId", status, session_date AS "sessionDate",
              session_number AS "sessionNumber", session_type AS "sessionType",
              presentation, discussion, interventions, client_response,
              progress_notes AS "progressNotes", homework,
              next_session_plan AS "nextSessionPlan", private_notes AS "privateNotes",
              client_summary AS "clientSummary", shared_with_client AS "sharedWithClient",
              updated_at AS "updatedAt"
         FROM session_notes WHERE session_id = $1`,
      [sessionId]
    );
    if (!note) throw notFound("No documentation has been recorded for this session yet");

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SENSITIVE_READ,
      targetType: "session_documentation",
      targetId: sessionId,
      detail: { sessionReviewId: id, reason: "documentation review" },
    });

    res.json({ note });
  })
);

/* ------------------------------------------------------------------ */
/* Interventions                                                       */
/* ------------------------------------------------------------------ */

const INTERVENTION_COLUMNS = `
  i.id,
  i.reference,
  i.category,
  i.title,
  i.reason,
  i.instructions,
  i.steps,
  i.priority,
  i.status,
  i.assigned_to                              AS "assignedTo",
  assignee.full_name                         AS "assigneeName",
  assignee.role                              AS "assigneeRole",
  i.due_date::text                           AS "dueDate",
  i.follow_up_date::text                     AS "followUpDate",
  i.follow_up_note                           AS "followUpNote",
  i.related_type                             AS "relatedType",
  i.related_id                               AS "relatedId",
  i.completed_at                             AS "completedAt",
  i.created_by                               AS "createdBy",
  creator.full_name                          AS "createdByName",
  i.created_at                               AS "createdAt",
  i.updated_at                               AS "updatedAt"
`;

const INTERVENTION_FROM = `
  FROM interventions i
  LEFT JOIN users assignee ON assignee.id = i.assigned_to
  LEFT JOIN users creator  ON creator.id = i.created_by
`;

/** Progress is derived from the checklist, never stored. */
function interventionView(row) {
  const steps = Array.isArray(row.steps) ? row.steps : [];
  const done = steps.filter((step) => step.done).length;
  return {
    ...row,
    steps,
    progress: {
      total: steps.length,
      done,
      percent: steps.length ? Math.round((done / steps.length) * 100) : 0,
    },
    overdue:
      row.status !== "completed" &&
      row.dueDate &&
      String(row.dueDate).slice(0, 10) < new Date().toISOString().slice(0, 10),
  };
}

/** GET /api/supervisor/interventions */
supervisorRouter.get(
  "/interventions",
  requireSupPermission("interventions.view"),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const priority = typeof req.query.priority === "string" ? req.query.priority.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const assignedTo = typeof req.query.assignedTo === "string" ? req.query.assignedTo.trim() : "";

    const filters = [];
    const params = [];
    if (status) {
      params.push(status);
      filters.push(`i.status = $${params.length}`);
    }
    if (priority) {
      params.push(priority);
      filters.push(`i.priority = $${params.length}`);
    }
    if (assignedTo) {
      params.push(assignedTo);
      filters.push(`i.assigned_to = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const at = params.length;
      filters.push(
        `(i.reference ILIKE $${at} OR i.title ILIKE $${at} OR i.reason ILIKE $${at}
          OR assignee.full_name ILIKE $${at})`
      );
    }

    const { rows } = await query(
      `SELECT ${INTERVENTION_COLUMNS}
         ${INTERVENTION_FROM}
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY CASE i.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                 CASE i.priority
                   WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                   WHEN 'medium' THEN 2 ELSE 3
                 END,
                 i.due_date NULLS LAST,
                 i.created_at DESC
        LIMIT 200`,
      params
    );

    const { rows: countRows } = await query(
      `SELECT
         count(*) FILTER (WHERE status = 'pending')::int     AS "pending",
         count(*) FILTER (WHERE status = 'in_progress')::int AS "inProgress",
         count(*) FILTER (WHERE status = 'completed')::int   AS "completed",
         count(*) FILTER (WHERE status <> 'completed'
                           AND due_date IS NOT NULL
                           AND due_date < CURRENT_DATE)::int AS "overdue"
       FROM interventions`
    );

    res.json({
      interventions: rows.map(interventionView),
      total: rows.length,
      counts: countRows[0],
    });
  })
);

const stepsSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1).max(64),
      text: z.string().trim().min(1, "Write the step").max(400),
      done: z.boolean().optional().default(false),
    })
  )
  .max(20);

const createInterventionSchema = z.object({
  assignedTo: z.string().trim().uuid("Choose who this is for"),
  category: z
    .enum(["documentation", "supervision", "safety", "conduct", "workload", "clinical", "other"])
    .optional()
    .default("clinical"),
  title: z.string().trim().min(4, "Give the intervention a title").max(200),
  reason: z.string().trim().min(10, "Explain why this intervention is needed").max(4000),
  instructions: textOrNull(8000),
  steps: stepsSchema.optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  dueDate: dateOrNull,
  relatedType: z.enum(["safety_concern", "case_review", "escalation", "client", "practitioner"]).nullable().optional(),
  relatedId: z.string().trim().uuid().nullable().optional(),
});

/** POST /api/supervisor/interventions */
supervisorRouter.post(
  "/interventions",
  requireSupPermission("interventions.create"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const data = parse(createInterventionSchema, req.body);

    const assignee = await queryOne(
      `SELECT id, role FROM users WHERE id = $1 AND role IN ('therapist', 'supporter') AND status = 'active'`,
      [data.assignedTo]
    );
    if (!assignee) throw badRequest("Choose an active therapist or supporter");

    const steps = (data.steps ?? []).map((step) => ({
      id: step.id,
      text: step.text,
      done: Boolean(step.done),
    }));
    const reference = newReference("INT");

    const { rows } = await query(
      `INSERT INTO interventions
         (reference, category, title, reason, instructions, steps, priority,
          status, assigned_to, due_date, related_type, related_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'pending', $8, $9, $10, $11, $12)
       RETURNING id, reference, status`,
      [
        reference,
        data.category,
        data.title,
        data.reason,
        data.instructions ?? null,
        JSON.stringify(steps),
        data.priority,
        data.assignedTo,
        data.dueDate ?? null,
        data.relatedType ?? null,
        data.relatedId ?? null,
        req.user.id,
      ]
    );
    const intervention = rows[0];

    await recordActivity({
      domain: "intervention",
      targetId: intervention.id,
      action: "created",
      detail: data.title,
      toStatus: "pending",
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    // Linking back to the concern or review that prompted it keeps both
    // trails connected.
    if (data.relatedType && data.relatedId) {
      await recordActivity({
        domain: data.relatedType,
        targetId: data.relatedId,
        action: "intervention_created",
        detail: `${reference}: ${data.title}`,
        actorId: req.user.id,
        actorRole: req.user.role,
      });
    }

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.INTERVENTION_CREATED,
      targetType: "intervention",
      targetId: intervention.id,
      detail: { reference, category: data.category, priority: data.priority, assignedTo: data.assignedTo },
    });

    await notify({
      userId: data.assignedTo,
      type: "intervention_assigned",
      title: `New intervention ${reference}`,
      body: data.title,
      link: null,
      data: { interventionId: intervention.id },
      key: `intervention-created:${intervention.id}`,
    });
    await notifySupervisors({
      type: "intervention_assigned",
      title: `Intervention ${reference} created`,
      body: `${data.title} - assigned to ${assignee.id === data.assignedTo ? "a team member" : "the team"}`,
      link: `/portal/clinical_supervisor/interventions/${intervention.id}`,
      data: { interventionId: intervention.id },
      key: `intervention-sup:${intervention.id}`,
    });

    res.status(201).json({ intervention });
  })
);

/** GET /api/supervisor/interventions/:id */
supervisorRouter.get(
  "/interventions/:id",
  requireSupPermission("interventions.view"),
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Intervention");

    const row = await queryOne(
      `SELECT ${INTERVENTION_COLUMNS}
         ${INTERVENTION_FROM}
        WHERE i.id = $1`,
      [id]
    );
    if (!row) throw notFound("That intervention does not exist");

    const { rows: activity } = await query(
      `SELECT a.id, a.action, a.detail, a.from_status AS "fromStatus",
              a.to_status AS "toStatus", u.full_name AS "actorName",
              a.actor_role AS "actorRole", a.created_at AS "createdAt"
         FROM supervisor_activity a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.domain = 'intervention' AND a.target_id = $1
        ORDER BY a.created_at ASC`,
      [id]
    );

    res.json({ intervention: interventionView(row), activity });
  })
);

const patchInterventionSchema = z.object({
  title: z.string().trim().min(4).max(200).optional(),
  reason: z.string().trim().min(10).max(4000).optional(),
  instructions: textOrNull(8000),
  steps: stepsSchema.optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  dueDate: dateOrNull,
  assignedTo: z.string().trim().uuid().nullable().optional(),
});

/** PATCH /api/supervisor/interventions/:id - progress and details. */
supervisorRouter.patch(
  "/interventions/:id",
  requireSupPermission("interventions.manage"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Intervention");
    const data = parse(patchInterventionSchema, req.body);

    const current = await queryOne(
      `SELECT id, status FROM interventions WHERE id = $1`,
      [id]
    );
    if (!current) throw notFound("That intervention does not exist");
    if (current.status === "completed" && data.steps) {
      throw conflict("Reopen the intervention before changing its steps");
    }

    if (data.assignedTo) {
      const assignee = await queryOne(
        `SELECT id FROM users WHERE id = $1 AND role IN ('therapist', 'supporter') AND status = 'active'`,
        [data.assignedTo]
      );
      if (!assignee) throw badRequest("Choose an active therapist or supporter");
    }

    const steps = data.steps
      ? JSON.stringify(data.steps.map((step) => ({ ...step, done: Boolean(step.done) })))
      : null;

    await query(
      `UPDATE interventions
          SET title = COALESCE($2, title),
              reason = COALESCE($3, reason),
              instructions = COALESCE($4, instructions),
              steps = COALESCE($5::jsonb, steps),
              priority = COALESCE($6, priority),
              due_date = COALESCE($7, due_date),
              assigned_to = COALESCE($8, assigned_to)
        WHERE id = $1`,
      [
        id,
        data.title ?? null,
        data.reason ?? null,
        data.instructions ?? null,
        steps,
        data.priority ?? null,
        data.dueDate ?? null,
        data.assignedTo ?? null,
      ]
    );

    if (data.steps) {
      await recordActivity({
        domain: "intervention",
        targetId: id,
        action: "progress",
        detail: `Checklist updated: ${data.steps.filter((s) => s.done).length}/${data.steps.length} done`,
        actorId: req.user.id,
        actorRole: req.user.role,
      });
    }

    const row = await queryOne(
      `SELECT ${INTERVENTION_COLUMNS}
         ${INTERVENTION_FROM}
        WHERE i.id = $1`,
      [id]
    );
    res.json({ intervention: interventionView(row) });
  })
);

const INTERVENTION_ACTIONS = {
  start: { status: "in_progress", label: "started the intervention" },
  add_follow_up: { status: null, label: "scheduled a follow-up" },
  assign: { status: null, label: "reassigned the intervention" },
  complete: { status: "completed", label: "completed the intervention" },
  reopen: { status: "pending", label: "reopened the intervention" },
};

const interventionActionSchema = z.object({
  action: z.enum(Object.keys(INTERVENTION_ACTIONS)),
  detail: textOrNull(4000),
  followUpDate: dateOrNull,
  assignedTo: z.string().trim().uuid().nullable().optional(),
  confirm: z.boolean().optional(),
});

/** POST /api/supervisor/interventions/:id/actions */
supervisorRouter.post(
  "/interventions/:id/actions",
  requireSupPermission("interventions.manage"),
  asyncHandler(async (req, res) => {
    checkSupervisor(req);
    const id = uuidParam(req.params.id, "Intervention");
    const data = parse(interventionActionSchema, req.body);

    const current = await queryOne(
      `SELECT id, reference, status, assigned_to, steps, due_date
         FROM interventions WHERE id = $1`,
      [id]
    );
    if (!current) throw notFound("That intervention does not exist");

    const config = INTERVENTION_ACTIONS[data.action];
    const fromStatus = current.status;

    if (data.action === "start" && fromStatus !== "pending") {
      throw conflict("This intervention is already in progress");
    }
    if (data.action === "complete" && fromStatus === "completed") {
      throw conflict("This intervention is already completed");
    }
    if (data.action === "reopen" && fromStatus !== "completed") {
      throw conflict("Only a completed intervention can be reopened");
    }
    if (data.action === "add_follow_up" && !data.followUpDate) {
      throw badRequest("Choose a follow-up date");
    }

    const steps = Array.isArray(current.steps) ? current.steps : [];
    const stepsDone = steps.filter((step) => step.done).length;
    if (data.action === "complete" && steps.length > 0 && stepsDone < steps.length) {
      if (data.confirm !== true) {
        throw badRequest(
          `Confirm to complete: ${steps.length - stepsDone} checklist step(s) are still open`
        );
      }
    }

    if (data.action === "assign" && data.assignedTo) {
      const assignee = await queryOne(
        `SELECT id FROM users WHERE id = $1 AND role IN ('therapist', 'supporter') AND status = 'active'`,
        [data.assignedTo]
      );
      if (!assignee) throw badRequest("Choose an active therapist or supporter");
    }

    const nextStatus = config.status ?? fromStatus;

    await query(
      `UPDATE interventions
          SET status = $2,
              follow_up_date = COALESCE($3, follow_up_date),
              follow_up_note = COALESCE($4, follow_up_note),
              assigned_to = COALESCE($5, assigned_to),
              completed_at = CASE WHEN $2 = 'completed' THEN now()
                                  WHEN $2 = 'pending' THEN NULL
                                  ELSE completed_at END
        WHERE id = $1`,
      [
        id,
        nextStatus,
        data.action === "add_follow_up" ? data.followUpDate : null,
        data.action === "add_follow_up" ? (data.detail ?? null) : null,
        data.action === "assign" ? (data.assignedTo ?? null) : null,
      ]
    );

    await recordActivity({
      domain: "intervention",
      targetId: id,
      action: data.action,
      detail: data.detail ?? config.label,
      fromStatus,
      toStatus: nextStatus,
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.INTERVENTION_ACTION,
      targetType: "intervention",
      targetId: id,
      detail: { reference: current.reference, action: data.action, fromStatus, toStatus: nextStatus },
    });

    if (data.action === "assign" && data.assignedTo && data.assignedTo !== current.assigned_to) {
      await notify({
        userId: data.assignedTo,
        type: "intervention_assigned",
        title: `Intervention ${current.reference} assigned to you`,
        body: data.detail ?? "An intervention has been assigned to you.",
        link: null,
        data: { interventionId: id },
        key: `intervention-reassigned:${id}:${data.assignedTo}`,
      });
    }

    res.json({ ok: true, status: nextStatus });
  })
);

export default supervisorRouter;
