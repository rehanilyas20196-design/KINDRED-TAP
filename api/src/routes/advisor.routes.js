/**
 * Clinical Advisor portal - clinic operations.
 *
 * Everything in here is read through the advisor's own permission set
 * (`advisor_permissions`), never through a hidden menu item. Three privacy
 * rules apply to every response:
 *
 *  1. No private therapist notes. `session_notes` is never selected: a
 *     quality indicator counts whether a note exists, it never reads one.
 *  2. Client detail is the minimum necessary. Names appear because the
 *     advisor has `clients.view`; without it, lists fall back to aliases.
 *  3. Nothing here diagnoses. Scores are the client's own assessment scores,
 *     trends describe how those scores moved, and matching only ever
 *     recommends - the advisor makes the decision.
 */

import { Router } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../db/index.js";
import { asyncHandler, badRequest, conflict, forbidden, notFound, parse } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { AUDIT_ACTIONS, logAudit } from "../lib/audit.js";
import {
  checkAdvisor,
  dateOrNull,
  readIntSetting,
  textOrNull,
  uuidParam,
} from "../lib/advisor.js";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  permissionsFor,
  requireAnyPermission,
  requirePermission,
} from "../lib/permissions.js";
import { notify } from "../lib/notifications.js";
import { findMatches } from "./matching.routes.js";
import { findClash } from "./sessions.routes.js";

export const advisorRouter = Router();

advisorRouter.use(requireAuth);

/** Reads the advisor's whole permission set once per request. */
async function heldPermissions(req) {
  return permissionsFor(req.user.id);
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

/** GET /api/advisor/dashboard */
advisorRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    checkAdvisor(req);

    const supervisionInterval = await readIntSetting("supervision_interval_days", 30);

    const counts = await queryOne(
      `SELECT
         (SELECT count(*)::int
            FROM users u JOIN therapist_profiles p ON p.user_id = u.id
           WHERE u.role = 'therapist' AND u.status = 'active') AS "activeTherapists",

         (SELECT count(*)::int
            FROM users u
           WHERE u.role = 'user' AND u.status = 'active'
             AND EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id)) AS "activeClients",

         (SELECT count(*)::int
            FROM safety_escalations
           WHERE status IN ('new', 'under_review', 'action_required')) AS "openEscalations",

         (SELECT count(*)::int FROM (
            SELECT u.id
              FROM users u
              JOIN therapist_profiles p ON p.user_id = u.id
             WHERE u.role = 'therapist' AND u.status = 'active'
               AND NOT EXISTS (
                 SELECT 1 FROM supervision_records sr
                  WHERE sr.therapist_id = u.id
                    AND sr.supervision_date >= CURRENT_DATE - make_interval(days => $1::int))
          ) pending) AS "pendingSupervision",

         (SELECT count(*)::int
            FROM clinical_standards
           WHERE status <> 'archived'
             AND next_review_at IS NOT NULL
             AND next_review_at <= now() + interval '30 days') AS "standardsReviewsDue",

         (SELECT count(*)::int
            FROM users p
            JOIN ethics_guidelines g
              ON g.status = 'active'
             AND p.role IN (SELECT jsonb_array_elements_text(g.applicable_roles))
           WHERE p.status = 'active'
             AND NOT EXISTS (
               SELECT 1 FROM ethics_acknowledgments a
                WHERE a.guideline_id = g.id AND a.user_id = p.id AND a.version = g.version))
           AS "ethicsAcknowledgmentsPending",

         (SELECT count(*)::int
            FROM sessions
           WHERE scheduled_at >= date_trunc('day', now())
             AND scheduled_at <  date_trunc('day', now()) + interval '1 day'
             AND status = 'scheduled') AS "todaySessions",

         (SELECT count(*)::int
            FROM therapist_searches ts
           WHERE ts.created_at > now() - interval '30 days'
             AND NOT EXISTS (
               SELECT 1 FROM match_decisions md
                WHERE md.search_id = ts.id AND md.decision IN ('assigned', 'rejected')))
           AS "pendingMatching",

         (SELECT count(*)::int
            FROM assessment_results r
            JOIN assessments a ON a.id = r.assessment_id
           WHERE a.status = 'completed' AND r.reviewed_at IS NULL) AS "pendingAssessments",

         (SELECT count(*)::int FROM treatment_plans WHERE status = 'active') AS "activePlans"`,
      [supervisionInterval]
    );

    const { rows: todayAppointments } = await query(
      `SELECT s.id,
              s.scheduled_at                      AS "scheduledAt",
              s.duration_minutes                  AS "durationMinutes",
              s.mode,
              s.status,
              s.confirmed_at                      AS "confirmedAt",
              s.user_id                           AS "clientId",
              s.therapist_id                      AS "therapistId",
              client.full_name                    AS "clientName",
              therapist.full_name                 AS "therapistName"
         FROM sessions s
         JOIN users client    ON client.id = s.user_id
         JOIN users therapist ON therapist.id = s.therapist_id
        WHERE s.scheduled_at >= date_trunc('day', now())
          AND s.scheduled_at <  date_trunc('day', now()) + interval '1 day'
        ORDER BY s.scheduled_at
        LIMIT 50`
    );

    const alerts = await buildAlerts(supervisionInterval);

    const { rows: announcementRows } = await query(
      `SELECT id, title, body, publish_at AS "publishAt", created_at AS "createdAt"
         FROM clinic_announcements
        WHERE status = 'published'
        ORDER BY COALESCE(publish_at, created_at) DESC
        LIMIT 3`
    );

    res.json({
      clinicalOverview: {
        activeTherapists: counts.activeTherapists,
        activeClients: counts.activeClients,
        openEscalations: counts.openEscalations,
        pendingSupervision: counts.pendingSupervision,
        standardsReviewsDue: counts.standardsReviewsDue,
        ethicsItems: counts.ethicsAcknowledgmentsPending,
      },
      operations: {
        todaySessions: counts.todaySessions,
        pendingMatching: counts.pendingMatching,
        pendingAssessments: counts.pendingAssessments,
        activePlans: counts.activePlans,
      },
      todayAppointments,
      alerts,
      announcements: announcementRows,
      unreadNotifications: await unreadCount(req.user.id),
    });
  })
);

/**
 * Clinical alerts, ordered by severity.
 *
 * Each one points at the page that deals with it. The list is built from
 * operational facts already stored - an open escalation, an overdue review -
 * and never from an interpretation of anybody's state of mind.
 */
async function buildAlerts(supervisionInterval) {
  const alerts = [];
  const push = (kind, severity, title, detail, link, at) =>
    alerts.push({ id: `${kind}:${link ?? title}`, kind, severity, title, detail, link, at });

  const { rows: escalations } = await query(
    `SELECT id, reference, priority, status, created_at
       FROM safety_escalations
      WHERE status IN ('new', 'under_review', 'action_required')
      ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
               created_at DESC
      LIMIT 5`
  );
  for (const row of escalations) {
    const severity = { critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW" }[row.priority] ?? "MEDIUM";
    push(
      "safety",
      severity,
      `Safety escalation ${row.reference} ${row.status.replace("_", " ")}`,
      `Raised ${new Date(row.created_at).toLocaleDateString()}.`,
      `/portal/clinical-advisor/safety/${row.id}`,
      row.created_at
    );
  }

  const { rows: supervision } = await query(
    `SELECT u.id, u.full_name,
            max(sr.supervision_date)::text AS "lastSupervisionDate"
       FROM users u
       JOIN therapist_profiles p ON p.user_id = u.id
       LEFT JOIN supervision_records sr ON sr.therapist_id = u.id
      WHERE u.role = 'therapist' AND u.status = 'active'
      GROUP BY u.id, u.full_name
     HAVING NOT EXISTS (
       SELECT 1 FROM supervision_records sr2
        WHERE sr2.therapist_id = u.id
          AND sr2.supervision_date >= CURRENT_DATE - make_interval(days => $1::int))
      ORDER BY u.full_name
      LIMIT 5`,
    [supervisionInterval]
  );
  for (const row of supervision) {
    push(
      "supervision",
      "MEDIUM",
      "Therapist supervision due",
      row.lastSupervisionDate
        ? `${row.full_name} was last supervised on ${row.lastSupervisionDate}.`
        : `${row.full_name} has no supervision record yet.`,
      "/portal/clinical-advisor/supervision",
      null
    );
  }

  const { rows: standards } = await query(
    `SELECT id, title, next_review_at AS "nextReviewAt"
       FROM clinical_standards
      WHERE status <> 'archived'
        AND next_review_at IS NOT NULL
        AND next_review_at <= now() + interval '30 days'
      ORDER BY next_review_at
      LIMIT 5`
  );
  for (const row of standards) {
    const overdue = new Date(row.nextReviewAt) < new Date();
    push(
      "standard",
      overdue ? "HIGH" : "MEDIUM",
      `Clinical standard review ${overdue ? "overdue" : "due"}`,
      `${row.title} is scheduled for review on ${String(row.nextReviewAt).slice(0, 10)}.`,
      `/portal/clinical-advisor/clinical-standards/${row.id}`,
      row.nextReviewAt
    );
  }

  const { rows: ethics } = await query(
    `SELECT g.id, g.title,
            (SELECT count(*)::int FROM users p
              WHERE p.status = 'active'
                AND p.role IN (SELECT jsonb_array_elements_text(g.applicable_roles))
                AND NOT EXISTS (SELECT 1 FROM ethics_acknowledgments a
                                 WHERE a.guideline_id = g.id AND a.user_id = p.id AND a.version = g.version))
              AS "pendingCount"
       FROM ethics_guidelines g
      WHERE g.status = 'active'
        AND (SELECT count(*)::int FROM users p
              WHERE p.status = 'active'
                AND p.role IN (SELECT jsonb_array_elements_text(g.applicable_roles))
                AND NOT EXISTS (SELECT 1 FROM ethics_acknowledgments a
                                 WHERE a.guideline_id = g.id AND a.user_id = p.id AND a.version = g.version)) > 0
      ORDER BY g.title
      LIMIT 3`
  );
  for (const row of ethics) {
    push(
      "ethics",
      "LOW",
      "Ethical guideline acknowledgment pending",
      `${row.pendingCount} practitioner${row.pendingCount === 1 ? "" : "s"} have not acknowledged ${row.title}.`,
      `/portal/clinical-advisor/ethics`,
      null
    );
  }

  const { rows: missed } = await query(
    `SELECT u.id, u.full_name, count(*)::int AS "cancelled"
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.status = 'cancelled'
        AND s.updated_at > now() - interval '30 days'
      GROUP BY u.id, u.full_name
     HAVING count(*) >= 2
      ORDER BY count(*) DESC
      LIMIT 3`
  );
  for (const row of missed) {
    push(
      "attendance",
      "MEDIUM",
      "Repeated missed sessions",
      `${row.full_name} had ${row.cancelled} cancelled sessions in the last 30 days.`,
      `/portal/clinical-advisor/clients/${row.id}`,
      null
    );
  }

  const { rows: concerning } = await query(
    `SELECT r.id, a.id AS "assessmentId", u.full_name, r.created_at
       FROM assessment_results r
       JOIN assessments a ON a.id = r.assessment_id
       JOIN users u ON u.id = r.user_id
      WHERE r.is_high_risk = true
        AND a.status = 'completed'
      ORDER BY r.created_at DESC
      LIMIT 3`
  );
  for (const row of concerning) {
    push(
      "assessment",
      "HIGH",
      "Assessment flagged for review",
      `${row.full_name} has a completed assessment recorded as needing safety review.`,
      `/portal/clinical-advisor/assessments/${row.assessmentId}`,
      row.created_at
    );
  }

  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

async function unreadCount(userId) {
  const row = await queryOne(
    "SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [userId]
  );
  return row?.n ?? 0;
}

/* ------------------------------------------------------------------ */
/* Therapists                                                          */
/* ------------------------------------------------------------------ */

const THERAPIST_LIST_COLUMNS = `
  u.id,
  u.full_name                                AS "fullName",
  u.status                                   AS "accountStatus",
  p.discipline,
  p.clinical_areas                           AS "clinicalAreas",
  p.modalities,
  p.accepting_new_cases                      AS "acceptingNewCases",
  p.registration_verified                    AS "registrationVerified",
  p.registration_body                        AS "registrationBody",
  p.years_experience                         AS "yearsExperience",
  p.availability_days                        AS "availabilityDays",
  p.availability_hours                       AS "availabilityHours",
  p.session_fee::float8                      AS "sessionFee",
  p.currency,
  (SELECT count(DISTINCT c.client_id)
     FROM (
       SELECT user_id AS client_id FROM sessions WHERE therapist_id = u.id
       UNION
       SELECT user_id FROM conversations
        WHERE therapist_id = u.id
          AND EXISTS (SELECT 1 FROM users cx WHERE cx.id = conversations.user_id AND cx.role = 'user')
       UNION
       SELECT client_id FROM client_cases WHERE therapist_id = u.id
       UNION
       SELECT client_id FROM treatment_plans WHERE therapist_id = u.id
     ) c
    WHERE c.client_id <> u.id)                AS "activeClients",
  (SELECT count(*)::int
     FROM sessions s
    WHERE s.therapist_id = u.id
      AND s.status = 'scheduled'
      AND s.scheduled_at >= now())            AS "upcomingSessions",
  (SELECT max(sr.supervision_date)::text
     FROM supervision_records sr WHERE sr.therapist_id = u.id) AS "lastSupervisionDate",
  (SELECT count(*)::int
     FROM supervision_records sr WHERE sr.therapist_id = u.id) AS "supervisionRecords",
  (SELECT count(*)::int
     FROM users p2
     JOIN ethics_guidelines g
       ON g.status = 'active'
      AND p2.role IN (SELECT jsonb_array_elements_text(g.applicable_roles))
    WHERE p2.id = u.id
      AND NOT EXISTS (SELECT 1 FROM ethics_acknowledgments a
                       WHERE a.guideline_id = g.id AND a.user_id = p2.id AND a.version = g.version))
                                   AS "pendingEthicsAcks",
  (SELECT count(*)::int
     FROM clinical_standards s
    WHERE s.status <> 'archived'
      AND s.next_review_at IS NOT NULL
      AND s.next_review_at <= now())          AS "standardsOverdue"
`;

function supervisionState(lastDate, intervalDays) {
  if (!lastDate) return { status: "never", nextDue: null };
  const last = new Date(`${String(lastDate).slice(0, 10)}T00:00:00`);
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

/** GET /api/advisor/therapists */
advisorRouter.get(
  "/therapists",
  requirePermission("therapists.view"),
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const accepting = typeof req.query.accepting === "string" ? req.query.accepting : "";
    const intervalDays = await readIntSetting("supervision_interval_days", 30);

    const filters = [`u.role = 'therapist'`];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      const at = params.length;
      filters.push(`(u.full_name ILIKE $${at} OR p.discipline ILIKE $${at} OR p.clinical_areas::text ILIKE $${at})`);
    }
    if (accepting === "true" || accepting === "false") {
      params.push(accepting === "true");
      filters.push(`p.accepting_new_cases = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT ${THERAPIST_LIST_COLUMNS}
         FROM users u
         JOIN therapist_profiles p ON p.user_id = u.id
        WHERE ${filters.join(" AND ")}
        ORDER BY u.full_name NULLS LAST`,
      params
    );

    const therapists = rows.map((row) => ({
      ...row,
      supervision: supervisionState(row.lastSupervisionDate, intervalDays),
    }));

    res.json({
      therapists,
      total: therapists.length,
      intervalDays,
      requiringSupervision: therapists.filter((t) => t.supervision.status !== "current").length,
    });
  })
);

/** GET /api/advisor/therapists/:id - overview, quality and standards status. */
advisorRouter.get(
  "/therapists/:id",
  requirePermission("therapists.view"),
  asyncHandler(async (req, res) => {
    const therapistId = uuidParam(req.params.id, "Therapist");
    const intervalDays = await readIntSetting("supervision_interval_days", 30);

    const therapist = await queryOne(
      `SELECT ${THERAPIST_LIST_COLUMNS},
              p.bio,
              p.phone,
              p.avatar_url                AS "avatarUrl",
              p.session_modes             AS "sessionModes",
              p.languages,
              p.qualifications,
              p.registration_number       AS "registrationNumber",
              p.registration_country      AS "registrationCountry",
              p.registration_expiry::text AS "registrationExpiry",
              p.supervision_experience    AS "supervisionExperience",
              u.created_at                AS "joinedAt"
         FROM users u
         JOIN therapist_profiles p ON p.user_id = u.id
        WHERE u.id = $1 AND u.role = 'therapist'`,
      [therapistId]
    );
    if (!therapist) throw notFound("That therapist does not exist");

    const stats = await queryOne(
      `SELECT
         (SELECT count(*)::int FROM sessions WHERE therapist_id = $1 AND status = 'completed') AS "sessionsCompleted",
         (SELECT count(*)::int FROM sessions WHERE therapist_id = $1 AND status = 'cancelled') AS "sessionsCancelled",
         (SELECT count(*)::int
            FROM sessions s
           WHERE s.therapist_id = $1 AND s.status = 'completed'
             AND EXISTS (SELECT 1 FROM session_notes n WHERE n.session_id = s.id))
           AS "sessionsDocumented",
         (SELECT count(*)::int FROM treatment_plans WHERE therapist_id = $1 AND status = 'active') AS "plansActive",
         (SELECT count(*)::int FROM treatment_plans WHERE therapist_id = $1 AND status = 'completed') AS "plansCompleted",
         (SELECT count(*)::int FROM assessment_results r
             JOIN assessments a ON a.id = r.assessment_id
            WHERE a.user_id IN (SELECT client_id FROM client_cases WHERE therapist_id = $1)
              AND r.reviewed_at IS NOT NULL) AS "assessmentsReviewed",
         (SELECT count(*)::int FROM assessment_results r
             JOIN assessments a ON a.id = r.assessment_id
            WHERE a.user_id IN (SELECT client_id FROM client_cases WHERE therapist_id = $1)) AS "assessmentsTotal",
         (SELECT count(*)::int FROM safety_escalations WHERE therapist_id = $1) AS "escalations"`,
      [therapistId]
    );

    const goalProgress = await queryOne(
      `SELECT round(avg(g.progress_percent))::int AS "averageProgress",
              count(*)::int                        AS "goalCount",
              count(*) FILTER (WHERE g.status = 'completed')::int AS "goalsCompleted"
         FROM treatment_goals g
         JOIN treatment_plans p ON p.id = g.plan_id
        WHERE p.therapist_id = $1 AND p.status = 'active' AND g.status <> 'dropped'`,
      [therapistId]
    );

    const { rows: supervision } = await query(
      `SELECT id,
              supervision_date::text AS "supervisionDate",
              modality, focus, status,
              follow_up_date::text   AS "followUpDate",
              created_at             AS "createdAt"
         FROM supervision_records
        WHERE therapist_id = $1
        ORDER BY supervision_date DESC, created_at DESC
        LIMIT 20`,
      [therapistId]
    );

    const { rows: standards } = await query(
      `SELECT g.id, g.title, g.version, g.status, g.next_review_at AS "nextReviewAt",
              a.acknowledged_at AS "acknowledgedAt", a.version AS "acknowledgedVersion"
         FROM ethics_guidelines g
         LEFT JOIN ethics_acknowledgments a
                ON a.guideline_id = g.id AND a.user_id = $1
        WHERE g.status = 'active'
          AND 'therapist' IN (SELECT jsonb_array_elements_text(g.applicable_roles))
        ORDER BY g.title`,
      [therapistId]
    );

    const sessions = stats.sessionsCompleted;
    const attendance = sessions + stats.sessionsCancelled;

    res.json({
      therapist: {
        ...therapist,
        supervision: supervisionState(therapist.lastSupervisionDate, intervalDays),
      },
      stats: {
        ...stats,
        activeClients: therapist.activeClients,
        upcomingSessions: therapist.upcomingSessions,
        attendanceRate: attendance ? Math.round((sessions / attendance) * 100) : null,
        documentationRate: sessions
          ? Math.round((stats.sessionsDocumented / sessions) * 100)
          : null,
        assessmentReviewRate: stats.assessmentsTotal
          ? Math.round((stats.assessmentsReviewed / stats.assessmentsTotal) * 100)
          : null,
        goalProgress: goalProgress ?? { averageProgress: null, goalCount: 0, goalsCompleted: 0 },
      },
      supervision,
      standards,
    });
  })
);

/**
 * PATCH /api/advisor/therapists/:id
 *
 * Operational status only: activate, suspend, or toggle whether the therapist
 * takes new cases. Clinical standing is not changed here.
 */
advisorRouter.patch(
  "/therapists/:id",
  requirePermission("therapists.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const therapistId = uuidParam(req.params.id, "Therapist");
    const data = parse(
      z.object({
        status: z.enum(["active", "suspended", "pending"]).optional(),
        acceptingNewCases: z.boolean().optional(),
      }),
      req.body
    );

    const current = await queryOne(
      `SELECT u.status, p.accepting_new_cases AS "acceptingNewCases"
         FROM users u
         JOIN therapist_profiles p ON p.user_id = u.id
        WHERE u.id = $1 AND u.role = 'therapist'`,
      [therapistId]
    );
    if (!current) throw notFound("That therapist does not exist");
    if (data.status === undefined && data.acceptingNewCases === undefined) {
      throw badRequest("Nothing to change");
    }

    await transaction(async (tx) => {
      if (data.status) {
        await tx.query(`UPDATE users SET status = $2, updated_at = now() WHERE id = $1`, [
          therapistId,
          data.status,
        ]);
      }
      if (data.acceptingNewCases !== undefined) {
        await tx.query(
          `UPDATE therapist_profiles SET accepting_new_cases = $2, updated_at = now() WHERE user_id = $1`,
          [therapistId, data.acceptingNewCases]
        );
      }
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.THERAPIST_STATUS_CHANGED,
      targetType: "therapist",
      targetId: therapistId,
      detail: {
        from: current.status,
        to: data.status ?? current.status,
        acceptingNewCases: data.acceptingNewCases ?? current.acceptingNewCases,
      },
    });

    await notify({
      userId: therapistId,
      type: "session_updated",
      title: "Your practice settings changed",
      body:
        data.status === "suspended"
          ? "Your account has been suspended by the clinical advisor. Contact the clinic."
          : data.status === "active"
            ? "Your account has been reactivated."
            : "Your availability settings were updated.",
      link: "/portal/therapist/settings",
      data: {},
      key: `therapist-status:${therapistId}:${Date.now()}`,
    });

    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Clients                                                             */
/* ------------------------------------------------------------------ */

const CLIENT_LIST_COLUMNS = `
  u.id,
  u.full_name                       AS "fullName",
  u.status                          AS "accountStatus",
  up.avatar_url                     AS "avatarUrl",
  up.preferred_language             AS "preferredLanguage",
  (SELECT cc.status
     FROM client_cases cc
    WHERE cc.client_id = u.id AND cc.status IN ('active', 'paused')
    ORDER BY cc.updated_at DESC LIMIT 1)              AS "caseStatus",
  (SELECT t.full_name
     FROM client_cases cc JOIN users t ON t.id = cc.therapist_id
    WHERE cc.client_id = u.id AND cc.status = 'active'
    ORDER BY cc.updated_at DESC LIMIT 1)              AS "assignedTherapist",
  (SELECT cc.therapist_id
     FROM client_cases cc
    WHERE cc.client_id = u.id AND cc.status = 'active'
    ORDER BY cc.updated_at DESC LIMIT 1)              AS "assignedTherapistId",
  (SELECT t.full_name
     FROM sessions s JOIN users t ON t.id = s.therapist_id
    WHERE s.user_id = u.id
    ORDER BY s.scheduled_at DESC LIMIT 1)             AS "lastTherapistName",
  (SELECT s.scheduled_at
     FROM sessions s
    WHERE s.user_id = u.id AND s.status = 'scheduled' AND s.scheduled_at >= now()
    ORDER BY s.scheduled_at LIMIT 1)                  AS "nextSessionAt",
  (SELECT s.scheduled_at
     FROM sessions s WHERE s.user_id = u.id
    ORDER BY s.scheduled_at DESC LIMIT 1)             AS "lastSessionAt",
  (SELECT s.status
     FROM sessions s WHERE s.user_id = u.id
    ORDER BY s.scheduled_at DESC LIMIT 1)             AS "lastSessionStatus",
  (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.status = 'cancelled'
      AND s.updated_at > now() - interval '30 days')  AS "cancelledRecently",
  (SELECT round(avg(g.progress_percent))::int
     FROM treatment_goals g JOIN treatment_plans p ON p.id = g.plan_id
    WHERE p.client_id = u.id AND p.status = 'active' AND g.status <> 'dropped') AS "progressPercent",
  (SELECT count(*)::int FROM treatment_plans p
    WHERE p.client_id = u.id AND p.status = 'active') AS "activePlans",
  (SELECT count(*)::int FROM safety_escalations e
    WHERE e.client_id = u.id AND e.status IN ('new', 'under_review', 'action_required')) AS "openEscalations",
  la.status                         AS "assessmentStatus",
  la.completed_at                   AS "lastAssessmentAt",
  la.percent                        AS "assessmentPercent"
`;

const CLIENT_LIST_FROM = `
  FROM users u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  LEFT JOIN LATERAL (
    SELECT a.status, a.completed_at,
           (SELECT CASE WHEN count(aa.score) > 0
                   THEN round(sum(aa.score)::numeric / (count(aa.score) * 5) * 100)::int END
              FROM assessment_answers aa
             WHERE aa.assessment_id = a.id) AS percent
      FROM assessments a
     WHERE a.user_id = u.id AND a.status = 'completed'
     ORDER BY a.completed_at DESC NULLS LAST
     LIMIT 1
  ) la ON true
`;

const HAS_CLIENT_RELATIONSHIP = `
  EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id)
  OR EXISTS (SELECT 1 FROM conversations c WHERE c.user_id = u.id)
  OR EXISTS (SELECT 1 FROM client_cases cc WHERE cc.client_id = u.id)
  OR EXISTS (SELECT 1 FROM treatment_plans p WHERE p.client_id = u.id)
`;

/** GET /api/advisor/clients */
advisorRouter.get(
  "/clients",
  requirePermission("clients.view"),
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const attention = req.query.attention === "1" || req.query.attention === "true";

    const filters = [`u.role = 'user'`, `(${HAS_CLIENT_RELATIONSHIP})`];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      filters.push(`u.full_name ILIKE $${params.length}`);
    }

    const { rows } = await query(
      `SELECT ${CLIENT_LIST_COLUMNS}
         ${CLIENT_LIST_FROM}
        WHERE ${filters.join(" AND ")}
        ORDER BY u.full_name NULLS LAST
        LIMIT 300`,
      params
    );

    const withAttention = rows.map((row) => ({
      ...row,
      needsAttention:
        row.cancelledRecently >= 2 ||
        row.openEscalations > 0 ||
        (row.lastSessionAt && Date.now() - new Date(row.lastSessionAt).getTime() > 60 * 86_400_000),
    }));

    res.json({
      clients: attention ? withAttention.filter((row) => row.needsAttention) : withAttention,
      total: withAttention.length,
      needingAttention: withAttention.filter((row) => row.needsAttention).length,
    });
  })
);

/** GET /api/advisor/clients/:id - authorised overview, never the clinical record. */
advisorRouter.get(
  "/clients/:id",
  requirePermission("clients.view"),
  asyncHandler(async (req, res) => {
    const clientId = uuidParam(req.params.id, "Client");

    const client = await queryOne(
      `SELECT u.id,
              u.full_name            AS "fullName",
              u.status               AS "accountStatus",
              u.created_at           AS "joinedAt",
              up.avatar_url          AS "avatarUrl",
              up.preferred_language  AS "preferredLanguage",
              up.city
         FROM users u
         LEFT JOIN user_profiles up ON up.user_id = u.id
        WHERE u.id = $1 AND u.role = 'user'`,
      [clientId]
    );
    if (!client) throw notFound("That client does not exist");

    const relationship = await queryOne(
      `SELECT EXISTS (SELECT 1 FROM sessions WHERE user_id = $1)          AS sessions,
              EXISTS (SELECT 1 FROM conversations WHERE user_id = $1)     AS messages,
              EXISTS (SELECT 1 FROM client_cases WHERE client_id = $1)    AS cases,
              EXISTS (SELECT 1 FROM treatment_plans WHERE client_id = $1) AS plans`,
      [clientId]
    );
    const known =
      relationship?.sessions || relationship?.messages || relationship?.cases || relationship?.plans;
    if (!known) throw notFound("That client is not part of this clinic");

    const therapist = await queryOne(
      `SELECT u.id, u.full_name AS "fullName", p.discipline
         FROM client_cases cc
         JOIN users u ON u.id = cc.therapist_id
         LEFT JOIN therapist_profiles p ON p.user_id = u.id
        WHERE cc.client_id = $1 AND cc.status = 'active'
        ORDER BY cc.updated_at DESC
        LIMIT 1`,
      [clientId]
    );

    const stats = await queryOne(
      `SELECT
         (SELECT count(*)::int FROM sessions WHERE user_id = $1)                                       AS "totalSessions",
         (SELECT count(*)::int FROM sessions WHERE user_id = $1 AND status = 'completed')              AS "completedSessions",
         (SELECT count(*)::int FROM sessions WHERE user_id = $1 AND status = 'cancelled')              AS "cancelledSessions",
         (SELECT scheduled_at FROM sessions
           WHERE user_id = $1 AND status = 'scheduled' AND scheduled_at >= now()
           ORDER BY scheduled_at LIMIT 1)                                                             AS "nextSessionAt",
         (SELECT scheduled_at FROM sessions WHERE user_id = $1 ORDER BY scheduled_at DESC LIMIT 1)     AS "lastSessionAt",
         (SELECT round(avg(g.progress_percent))::int
            FROM treatment_goals g JOIN treatment_plans p ON p.id = g.plan_id
           WHERE p.client_id = $1 AND p.status = 'active' AND g.status <> 'dropped')                  AS "progressPercent"`,
      [clientId]
    );

    const { rows: sessions } = await query(
      `SELECT s.id, s.scheduled_at AS "scheduledAt", s.duration_minutes AS "durationMinutes",
              s.mode, s.status, s.confirmed_at AS "confirmedAt",
              t.full_name AS "therapistName", t.id AS "therapistId",
              EXISTS (SELECT 1 FROM session_notes n WHERE n.session_id = s.id) AS "hasNote"
         FROM sessions s
         JOIN users t ON t.id = s.therapist_id
        WHERE s.user_id = $1
        ORDER BY s.scheduled_at DESC
        LIMIT 12`,
      [clientId]
    );

    const { rows: assessments } = await query(
      `SELECT a.id, a.type, a.status, a.completed_at AS "completedAt",
              r.primary_issue_key AS "primaryIssueKey", i.label AS "primaryIssue",
              r.reviewed_at AS "reviewedAt", r.is_high_risk AS "isHighRisk",
              sc.percent
         FROM assessments a
         LEFT JOIN assessment_results r ON r.assessment_id = a.id
         LEFT JOIN issues i ON i.key = r.primary_issue_key
         LEFT JOIN LATERAL (
           SELECT CASE WHEN count(aa.score) > 0
                  THEN round(sum(aa.score)::numeric / (count(aa.score) * 5) * 100)::int END AS percent
             FROM assessment_answers aa WHERE aa.assessment_id = a.id
         ) sc ON true
        WHERE a.user_id = $1
        ORDER BY COALESCE(a.completed_at, a.started_at) DESC
        LIMIT 8`,
      [clientId]
    );

    const { rows: plans } = await query(
      `SELECT p.id, p.title, p.status, p.start_date::text AS "startDate",
              p.target_date::text AS "targetDate", p.updated_at AS "updatedAt",
              t.full_name AS "therapistName",
              (SELECT round(avg(g.progress_percent))::int
                 FROM treatment_goals g WHERE g.plan_id = p.id AND g.status <> 'dropped') AS "progressPercent",
              (SELECT count(*)::int FROM treatment_goals g WHERE g.plan_id = p.id)        AS "goalCount"
         FROM treatment_plans p
         JOIN users t ON t.id = p.therapist_id
        WHERE p.client_id = $1
        ORDER BY p.updated_at DESC
        LIMIT 8`,
      [clientId]
    );

    const maySeeEscalations = true;
    const { rows: escalations } = await query(
      `SELECT e.id, e.reference, e.priority, e.status, e.created_at AS "createdAt",
              t.full_name AS "therapistName"
         FROM safety_escalations e
         LEFT JOIN users t ON t.id = e.therapist_id
        WHERE e.client_id = $1
        ORDER BY e.created_at DESC
        LIMIT 8`,
      [clientId]
    );

    res.json({
      client,
      therapist: therapist ?? null,
      stats,
      sessions,
      assessments,
      plans,
      escalations: maySeeEscalations ? escalations : [],
    });
  })
);

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

/** GET /api/advisor/matching/requests */
advisorRouter.get(
  "/matching/requests",
  requirePermission("matching.manage"),
  asyncHandler(async (req, res) => {
    const filter = typeof req.query.status === "string" ? req.query.status : "all";

    const { rows } = await query(
      `SELECT ts.id,
              ts.user_id                    AS "clientId",
              u.full_name                   AS "clientName",
              ts.primary_issue_key          AS "primaryIssueKey",
              i.label                       AS "primaryIssue",
              ts.secondary_issues           AS "secondaryIssues",
              ts.result_count               AS "resultCount",
              ts.created_at                 AS "createdAt",
              (SELECT md.decision FROM match_decisions md
                WHERE md.search_id = ts.id ORDER BY md.created_at DESC LIMIT 1) AS "decision",
              (SELECT md.note FROM match_decisions md
                WHERE md.search_id = ts.id ORDER BY md.created_at DESC LIMIT 1) AS "decisionNote",
              (SELECT md.created_at FROM match_decisions md
                WHERE md.search_id = ts.id ORDER BY md.created_at DESC LIMIT 1) AS "decidedAt",
              (SELECT t.full_name
                 FROM match_decisions md JOIN users t ON t.id = md.therapist_id
                WHERE md.search_id = ts.id AND md.decision IN ('assigned', 'reassigned')
                ORDER BY md.created_at DESC LIMIT 1)                            AS "assignedTherapistName",
              (SELECT md.therapist_id
                 FROM match_decisions md
                WHERE md.search_id = ts.id AND md.decision IN ('assigned', 'reassigned')
                ORDER BY md.created_at DESC LIMIT 1)                            AS "assignedTherapistId",
              (SELECT count(*)::int FROM match_decisions md WHERE md.search_id = ts.id) AS "decisionCount"
         FROM therapist_searches ts
         JOIN users u ON u.id = ts.user_id
         LEFT JOIN issues i ON i.key = ts.primary_issue_key
        ORDER BY ts.created_at DESC
        LIMIT 300`
    );

    const stateOf = (row) => {
      if (row.decision === "rejected") return "rejected";
      if (row.decision === "assigned" || row.decision === "reassigned") return "assigned";
      if (row.decision === "approved") return "approved";
      return "pending";
    };

    const requests = rows.map((row) => ({ ...row, state: stateOf(row) }));
    const filtered =
      filter === "all" ? requests : requests.filter((row) => row.state === filter);

    res.json({
      requests: filtered,
      total: filtered.length,
      counts: requests.reduce(
        (acc, row) => {
          acc[row.state] = (acc[row.state] ?? 0) + 1;
          return acc;
        },
        { pending: 0, approved: 0, assigned: 0, rejected: 0 }
      ),
    });
  })
);

/** GET /api/advisor/matching/requests/:id - the search plus fresh recommendations. */
advisorRouter.get(
  "/matching/requests/:id",
  requirePermission("matching.manage"),
  asyncHandler(async (req, res) => {
    const searchId = uuidParam(req.params.id, "Search");

    const search = await queryOne(
      `SELECT ts.id, ts.user_id AS "clientId", u.full_name AS "clientName",
              ts.primary_issue_key AS "primaryIssueKey", ts.secondary_issues AS "secondaryIssues",
              ts.result_count AS "resultCount", ts.created_at AS "createdAt"
         FROM therapist_searches ts
         JOIN users u ON u.id = ts.user_id
        WHERE ts.id = $1`,
      [searchId]
    );
    if (!search) throw notFound("That matching request does not exist");

    const { rows: history } = await query(
      `SELECT md.id, md.decision, md.note, md.created_at AS "createdAt",
              d.full_name AS "decidedByName",
              t.full_name AS "therapistName", md.therapist_id AS "therapistId"
         FROM match_decisions md
         LEFT JOIN users d ON d.id = md.decided_by
         LEFT JOIN users t ON t.id = md.therapist_id
        WHERE md.search_id = $1
        ORDER BY md.created_at DESC`,
      [searchId]
    );

    // Same rule the client's own search uses: one implementation, so an
    // advisor's "recommended" list can never disagree with theirs.
    const { issue, therapists } = await findMatches(
      search.primaryIssueKey,
      search.secondaryIssues ?? [],
      search.clientId
    );

    res.json({
      search,
      issue,
      history,
      recommendations: therapists.slice(0, 20),
      total: therapists.length,
      matchedBecause: issue
        ? `Therapists who specialise in ${issue.label.toLowerCase()} and are available now.`
        : null,
    });
  })
);

const decisionSchema = z.object({
  decision: z.enum(["reviewed", "approved", "assigned", "rejected", "reassigned"]),
  therapistId: z.string().trim().uuid().optional(),
  note: textOrNull(1000),
});

/** POST /api/advisor/matching/requests/:id/decision */
advisorRouter.post(
  "/matching/requests/:id/decision",
  requirePermission("matching.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const searchId = uuidParam(req.params.id, "Search");
    const data = parse(decisionSchema, req.body);

    const search = await queryOne(
      `SELECT ts.id, ts.user_id AS "clientId", u.full_name AS "clientName"
         FROM therapist_searches ts
         JOIN users u ON u.id = ts.user_id
        WHERE ts.id = $1`,
      [searchId]
    );
    if (!search) throw notFound("That matching request does not exist");

    let therapistId = data.therapistId ?? null;
    if (data.decision === "assigned" || data.decision === "reassigned") {
      if (!therapistId) throw badRequest("Choose a therapist for this assignment");
      const therapist = await queryOne(
        `SELECT id FROM users WHERE id = $1 AND role = 'therapist' AND status = 'active'`,
        [therapistId]
      );
      if (!therapist) throw badRequest("That therapist is not available");
    }

    const previous = await queryOne(
      `SELECT therapist_id FROM match_decisions
        WHERE search_id = $1 AND decision IN ('assigned', 'reassigned')
        ORDER BY created_at DESC LIMIT 1`,
      [searchId]
    );

    const { rows } = await query(
      `INSERT INTO match_decisions (search_id, therapist_id, previous_therapist_id, decision, note, decided_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        searchId,
        therapistId,
        data.decision === "reassigned" ? previous?.therapist_id ?? null : null,
        data.decision,
        data.note ?? null,
        req.user.id,
      ]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.MATCH_DECISION,
      targetType: "therapist_search",
      targetId: searchId,
      detail: { decision: data.decision, therapistId, clientId: search.clientId },
    });

    if (therapistId) {
      await notify({
        userId: therapistId,
        type: "match_assigned",
        title: "You have been assigned a client",
        body: data.note || `${search.clientName} has been assigned to you by the clinical advisor.`,
        link: "/portal/therapist/clients",
        data: { searchId, clientId: search.clientId },
        key: `match-assigned:${searchId}:${therapistId}:${rows[0].id}`,
      });
      await notify({
        userId: search.clientId,
        type: "match_assigned",
        title: "Your therapist has been confirmed",
        body: "The clinic confirmed the therapist matched to you.",
        link: "/portal/user/matching",
        data: { searchId },
        key: `match-client:${searchId}:${rows[0].id}`,
      });
    }

    res.status(201).json({ ok: true, decisionId: rows[0].id });
  })
);

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

const APPOINTMENT_COLUMNS = `
  s.id,
  s.scheduled_at                     AS "scheduledAt",
  s.duration_minutes                 AS "durationMinutes",
  s.mode,
  s.status,
  s.cancel_reason                    AS "cancelReason",
  s.confirmed_at                     AS "confirmedAt",
  s.user_id                          AS "clientId",
  s.therapist_id                     AS "therapistId",
  client.full_name                   AS "clientName",
  therapist.full_name                AS "therapistName"
`;

/** GET /api/advisor/appointments */
advisorRouter.get(
  "/appointments",
  requirePermission("appointments.manage"),
  asyncHandler(async (req, res) => {
    const from =
      typeof req.query.from === "string" && Number.isFinite(Date.parse(req.query.from))
        ? new Date(req.query.from).toISOString()
        : new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to =
      typeof req.query.to === "string" && Number.isFinite(Date.parse(req.query.to))
        ? new Date(req.query.to).toISOString()
        : new Date(Date.now() + 60 * 86_400_000).toISOString();

    const filters = [`s.scheduled_at >= $1`, `s.scheduled_at <= $2`];
    const params = [from, to];

    for (const [key, column] of [
      ["therapistId", "s.therapist_id"],
      ["clientId", "s.user_id"],
      ["status", "s.status"],
      ["mode", "s.mode"],
    ]) {
      const value = typeof req.query[key] === "string" ? req.query[key].trim() : "";
      if (value) {
        params.push(value);
        filters.push(`${column} = $${params.length}`);
      }
    }

    const { rows } = await query(
      `SELECT ${APPOINTMENT_COLUMNS}
         FROM sessions s
         JOIN users client    ON client.id = s.user_id
         JOIN users therapist ON therapist.id = s.therapist_id
        WHERE ${filters.join(" AND ")}
        ORDER BY s.scheduled_at
        LIMIT 500`,
      params
    );

    res.json({
      appointments: rows,
      total: rows.length,
      range: { from, to },
    });
  })
);

const appointmentPatchSchema = z.object({
  action: z.enum(["reschedule", "cancel", "reassign", "complete"]),
  scheduledAt: z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Date.parse(value)), "Choose a valid date and time")
    .optional(),
  durationMinutes: z.coerce.number().int().min(15).max(180).optional(),
  mode: z.enum(["online", "phone", "in_person"]).optional(),
  therapistId: z.string().trim().uuid().optional(),
  reason: z.string().trim().max(500).optional(),
});

/** PATCH /api/advisor/appointments/:id */
advisorRouter.patch(
  "/appointments/:id",
  requirePermission("appointments.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const sessionId = uuidParam(req.params.id, "Session");
    const data = parse(appointmentPatchSchema, req.body);

    const session = await queryOne(
      `SELECT id, user_id AS "clientId", therapist_id AS "therapistId", scheduled_at,
              duration_minutes, mode, status
         FROM sessions WHERE id = $1`,
      [sessionId]
    );
    if (!session) throw notFound("That appointment does not exist");
    if (session.status !== "scheduled" && data.action !== "complete") {
      throw conflict("Only an appointment that has not happened yet can be changed");
    }

    let therapistId = session.therapistId;
    if (data.action === "reassign") {
      if (!data.therapistId) throw badRequest("Choose the therapist to reassign to");
      const replacement = await queryOne(
        `SELECT id FROM users WHERE id = $1 AND role = 'therapist' AND status = 'active'`,
        [data.therapistId]
      );
      if (!replacement) throw badRequest("That therapist is not available");
      therapistId = data.therapistId;
    }

    if (data.action === "reschedule") {
      if (!data.scheduledAt) throw badRequest("Choose the new date and time");
      if (Date.parse(data.scheduledAt) <= Date.now()) throw badRequest("Book a time in the future");
      const clash = await findClash({
        parties: [session.clientId, therapistId],
        scheduledAt: new Date(data.scheduledAt).toISOString(),
        durationMinutes: data.durationMinutes ?? session.durationMinutes,
        ignoreId: sessionId,
      });
      if (clash) throw conflict("That time clashes with another session in the diary");
    }

    if (data.action === "reassign") {
      const clash = await findClash({
        parties: [session.clientId, therapistId],
        scheduledAt: new Date(session.scheduled_at).toISOString(),
        durationMinutes: session.durationMinutes,
        ignoreId: sessionId,
      });
      if (clash) throw conflict("That therapist already has a session at that time");
    }

    if (data.action === "reschedule") {
      await query(
        `UPDATE sessions SET scheduled_at = $2, duration_minutes = COALESCE($3, duration_minutes),
                             mode = COALESCE($4, mode)
          WHERE id = $1`,
        [
          sessionId,
          new Date(data.scheduledAt).toISOString(),
          data.durationMinutes ?? null,
          data.mode ?? null,
        ]
      );
    } else if (data.action === "cancel") {
      await query(`UPDATE sessions SET status = 'cancelled', cancel_reason = $2 WHERE id = $1`, [
        sessionId,
        data.reason ?? "Cancelled by the clinic",
      ]);
    } else if (data.action === "reassign") {
      await query(`UPDATE sessions SET therapist_id = $2 WHERE id = $1`, [sessionId, therapistId]);
    } else if (data.action === "complete") {
      await query(`UPDATE sessions SET status = 'completed' WHERE id = $1`, [sessionId]);
    }

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.APPOINTMENT_CHANGED,
      targetType: "session",
      targetId: sessionId,
      detail: { action: data.action, therapistId, previousTherapistId: session.therapistId },
    });

    const messageByAction = {
      reschedule: `Your session was moved to ${new Date(data.scheduledAt).toLocaleString()}.`,
      cancel: data.reason ? `Session cancelled: ${data.reason}` : "Your session was cancelled.",
      reassign: "Your session has been reassigned to another therapist.",
      complete: "Your session has been marked as completed.",
    };

    const recipients = new Set([session.clientId, session.therapistId, therapistId]);
    for (const userId of recipients) {
      if (!userId || userId === req.user.id) continue;
      await notify({
        userId,
        type: "session_updated",
        title: "Appointment updated",
        body: messageByAction[data.action],
        link: null,
        data: { sessionId, action: data.action },
        key: `advisor-appointment:${sessionId}:${data.action}:${changeToken()}`,
      });
    }

    res.json({ ok: true });
  })
);

/** One idempotency token per handler run, so parallel changes never share a key. */
function changeToken() {
  return Date.now().toString(36);
}

/* ------------------------------------------------------------------ */
/* Assessments                                                         */
/* ------------------------------------------------------------------ */

/** GET /api/advisor/assessments */
advisorRouter.get(
  "/assessments",
  requirePermission("assessments.view"),
  asyncHandler(async (req, res) => {
    const filter = typeof req.query.filter === "string" ? req.query.filter : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const filters = [];
    const params = [];
    if (filter === "completed") filters.push(`a.status = 'completed'`);
    if (filter === "pending") {
      filters.push(`a.status = 'completed' AND r.reviewed_at IS NULL`);
    }
    if (filter === "follow_up") filters.push(`a.type = 'follow_up'`);
    if (q) {
      params.push(`%${q}%`);
      filters.push(`u.full_name ILIKE $${params.length}`);
    }

    const { rows } = await query(
      `SELECT a.id,
              a.type,
              a.status,
              a.started_at                    AS "startedAt",
              a.completed_at                  AS "completedAt",
              u.id                            AS "clientId",
              u.full_name                     AS "clientName",
              r.primary_issue_key             AS "primaryIssueKey",
              i.label                         AS "primaryIssue",
              r.summary,
              r.is_high_risk                  AS "isHighRisk",
              r.reviewed_at                   AS "reviewedAt",
              r.source,
              sc.percent
         FROM assessments a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN assessment_results r ON r.assessment_id = a.id
         LEFT JOIN issues i ON i.key = r.primary_issue_key
         LEFT JOIN LATERAL (
           SELECT CASE WHEN count(aa.score) > 0
                  THEN round(sum(aa.score)::numeric / (count(aa.score) * 5) * 100)::int END AS percent
             FROM assessment_answers aa WHERE aa.assessment_id = a.id
         ) sc ON true
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY COALESCE(a.completed_at, a.started_at) DESC
        LIMIT 300`,
      params
    );

    res.json({
      assessments: rows,
      total: rows.length,
      pending: rows.filter((row) => row.status === "completed" && !row.reviewedAt).length,
    });
  })
);

/** GET /api/advisor/assessments/:id - the client's own answers, not a diagnosis. */
advisorRouter.get(
  "/assessments/:id",
  requirePermission("assessments.view"),
  asyncHandler(async (req, res) => {
    const assessmentId = uuidParam(req.params.id, "Assessment");

    const assessment = await queryOne(
      `SELECT a.id, a.type, a.status, a.started_at AS "startedAt",
              a.completed_at AS "completedAt",
              u.id AS "clientId", u.full_name AS "clientName",
              r.primary_issue_key AS "primaryIssueKey", i.label AS "primaryIssue",
              r.secondary_issues AS "secondaryIssues", r.summary, r.scores,
              r.source, r.is_high_risk AS "isHighRisk", r.safety_message AS "safetyMessage",
              r.reviewed_at AS "reviewedAt",
              t.full_name AS "therapistName",
              sc.percent, sc.scored
         FROM assessments a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN assessment_results r ON r.assessment_id = a.id
         LEFT JOIN issues i ON i.key = r.primary_issue_key
         LEFT JOIN LATERAL (
           SELECT CASE WHEN count(aa.score) > 0
                  THEN round(sum(aa.score)::numeric / (count(aa.score) * 5) * 100)::int END AS percent,
                  count(aa.score)::int AS scored
             FROM assessment_answers aa WHERE aa.assessment_id = a.id
         ) sc ON true
         LEFT JOIN LATERAL (
           SELECT full_name FROM sessions s JOIN users tu ON tu.id = s.therapist_id
            WHERE s.user_id = a.user_id ORDER BY s.scheduled_at DESC LIMIT 1
         ) t ON true
        WHERE a.id = $1`,
      [assessmentId]
    );
    if (!assessment) throw notFound("That assessment does not exist");

    const { rows: answers } = await query(
      `SELECT q.prompt, q.question_type AS "questionType", q.category,
              aa.answer_value AS "answerValue", aa.answer_text AS "answerText", aa.score
         FROM assessment_answers aa
         JOIN assessment_questions q ON q.id = aa.question_id
        WHERE aa.assessment_id = $1
        ORDER BY q.position`,
      [assessmentId]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SENSITIVE_READ,
      targetType: "assessment",
      targetId: assessmentId,
      detail: { clientId: assessment.clientId },
    });

    res.json({ assessment, answers });
  })
);

/** POST /api/advisor/assessments/:id/review */
advisorRouter.post(
  "/assessments/:id/review",
  requirePermission("assessments.view"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const assessmentId = uuidParam(req.params.id, "Assessment");

    const existing = await queryOne(
      `SELECT r.id, r.reviewed_at FROM assessment_results r WHERE r.assessment_id = $1`,
      [assessmentId]
    );
    if (!existing) throw notFound("That assessment has no result to review");
    if (existing.reviewed_at) throw conflict("This assessment has already been reviewed");

    await query(`UPDATE assessment_results SET reviewed_at = now() WHERE assessment_id = $1`, [
      assessmentId,
    ]);

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.ASSESSMENT_REVIEWED,
      targetType: "assessment",
      targetId: assessmentId,
    });

    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Outcomes                                                            */
/* ------------------------------------------------------------------ */

/** GET /api/advisor/outcomes */
advisorRouter.get(
  "/outcomes",
  requirePermission("outcomes.view"),
  asyncHandler(async (req, res) => {
    const days = 180;

    const trend = await queryOne(
      `WITH scored AS (
         SELECT a.user_id, a.completed_at,
                CASE WHEN count(aa.score) > 0
                     THEN round(sum(aa.score)::numeric / (count(aa.score) * 5) * 100)::int END AS percent
           FROM assessments a
           LEFT JOIN assessment_answers aa ON aa.assessment_id = a.id
          WHERE a.status = 'completed' AND a.completed_at IS NOT NULL
          GROUP BY a.user_id, a.id, a.completed_at
       ),
       firsts AS (
         SELECT DISTINCT ON (user_id) user_id, percent, completed_at
           FROM scored WHERE percent IS NOT NULL
          ORDER BY user_id, completed_at ASC
       ),
       lasts AS (
         SELECT DISTINCT ON (user_id) user_id, percent, completed_at
           FROM scored WHERE percent IS NOT NULL
          ORDER BY user_id, completed_at DESC
       )
       SELECT count(*) FILTER (WHERE lasts.percent - firsts.percent > 5)::int  AS "improving",
              count(*) FILTER (WHERE lasts.percent - firsts.percent BETWEEN -5 AND 5)::int AS "stable",
              count(*) FILTER (WHERE lasts.percent - firsts.percent < -5)::int AS "needsAttention",
              count(*)::int AS "withTrend"
         FROM firsts JOIN lasts USING (user_id)`
    );

    const attendance = await queryOne(
      `SELECT count(*)::int AS "scheduled",
              count(*) FILTER (WHERE status = 'completed')::int AS "completed",
              count(*) FILTER (WHERE status = 'cancelled')::int AS "cancelled",
              CASE WHEN count(*) > 0
                   THEN round(count(*) FILTER (WHERE status = 'completed')::numeric / count(*) * 100)::int
              END AS "attendanceRate"
         FROM sessions
        WHERE scheduled_at >= now() - make_interval(days => $1::int)`,
      [days]
    );

    const goals = await queryOne(
      `SELECT count(*)::int AS "goalCount",
              count(*) FILTER (WHERE g.status = 'completed')::int AS "goalsCompleted",
              round(avg(g.progress_percent))::int AS "averageProgress"
         FROM treatment_goals g
         JOIN treatment_plans p ON p.id = g.plan_id
        WHERE g.status <> 'dropped'`,
      []
    );

    const followUp = await queryOne(
      `SELECT count(*)::int AS "assigned",
              count(*) FILTER (WHERE status = 'completed')::int AS "completed",
              CASE WHEN count(*) > 0
                   THEN round(count(*) FILTER (WHERE status = 'completed')::numeric / count(*) * 100)::int
              END AS "completionRate"
         FROM homework_items
        WHERE created_at >= now() - make_interval(days => $1::int)`,
      [days]
    );

    const feedback = await queryOne(
      `SELECT count(*)::int AS "count", round(avg(rating)::numeric, 1)::float8 AS "averageRating"
         FROM session_feedback
        WHERE created_at >= now() - make_interval(days => $1::int)`,
      [days]
    );

    const { rows: series } = await query(
      `SELECT to_char(date_trunc('month', scheduled_at), 'YYYY-MM') AS month,
              count(*)::int AS sessions,
              count(*) FILTER (WHERE status = 'completed')::int AS completed,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
         FROM sessions
        WHERE scheduled_at >= now() - make_interval(days => $1::int)
        GROUP BY 1
        ORDER BY 1`,
      [days]
    );

    const { rows: attentionClients } = await query(
      `SELECT u.id, u.full_name AS "fullName",
              (SELECT round(avg(g.progress_percent))::int
                 FROM treatment_goals g JOIN treatment_plans p ON p.id = g.plan_id
                WHERE p.client_id = u.id AND p.status = 'active' AND g.status <> 'dropped') AS "progressPercent",
              (SELECT count(*)::int FROM sessions s
                WHERE s.user_id = u.id AND s.status = 'cancelled'
                  AND s.updated_at > now() - interval '30 days')                            AS "cancelledRecently",
              (SELECT max(s.scheduled_at) FROM sessions s WHERE s.user_id = u.id)            AS "lastSessionAt"
         FROM users u
        WHERE u.role = 'user' AND u.status = 'active'
          AND EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id)
        ORDER BY (SELECT count(*)::int FROM sessions s
                   WHERE s.user_id = u.id AND s.status = 'cancelled'
                     AND s.updated_at > now() - interval '30 days') DESC,
                 u.full_name
        LIMIT 12`
    );

    res.json({
      windowDays: days,
      trend,
      attendance,
      goals,
      followUp,
      feedback,
      series,
      clients: attentionClients.map((row) => ({
        ...row,
        state:
          row.cancelledRecently >= 2 || (row.progressPercent !== null && row.progressPercent < 20)
            ? "needs_attention"
            : (row.progressPercent ?? 0) >= 60
              ? "improving"
              : "stable",
      })),
      note: "Trends describe recorded assessment scores, attendance and goal progress. They are not clinical judgements.",
    });
  })
);

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

/** GET /api/advisor/analytics */
advisorRouter.get(
  "/analytics",
  requireAnyPermission(["outcomes.view", "reports.generate"]),
  asyncHandler(async (req, res) => {
    const supervisionInterval = await readIntSetting("supervision_interval_days", 30);

    const growth = await query(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
              count(*)::int AS signups,
              count(*) FILTER (WHERE role = 'user')::int AS clients,
              count(*) FILTER (WHERE role = 'therapist')::int AS therapists
         FROM users
        WHERE created_at >= now() - interval '12 months'
        GROUP BY 1 ORDER BY 1`
    );

    const workload = await query(
      `SELECT u.id, u.full_name AS "fullName",
              (SELECT count(DISTINCT c.client_id) FROM (
                 SELECT user_id AS client_id FROM sessions WHERE therapist_id = u.id
                 UNION
                 SELECT client_id FROM client_cases WHERE therapist_id = u.id
                 UNION
                 SELECT client_id FROM treatment_plans WHERE therapist_id = u.id
               ) c WHERE c.client_id <> u.id) AS "activeClients",
              (SELECT count(*)::int FROM sessions s
                WHERE s.therapist_id = u.id AND s.status = 'scheduled' AND s.scheduled_at >= now()
                  AND s.scheduled_at < now() + interval '14 days') AS "upcomingSessions",
              p.accepting_new_cases AS "acceptingNewCases"
         FROM users u
         JOIN therapist_profiles p ON p.user_id = u.id
        WHERE u.role = 'therapist' AND u.status = 'active'
        ORDER BY "activeClients" DESC
        LIMIT 25`
    );

    const appointments = await queryOne(
      `SELECT count(*)::int AS "total",
              count(*) FILTER (WHERE status = 'completed')::int AS "completed",
              count(*) FILTER (WHERE status = 'cancelled')::int AS "cancelled",
              count(*) FILTER (WHERE status = 'scheduled')::int AS "scheduled",
              count(*) FILTER (WHERE mode = 'online')::int AS "online",
              count(*) FILTER (WHERE mode = 'phone')::int AS "phone",
              count(*) FILTER (WHERE mode = 'in_person')::int AS "inPerson",
              CASE WHEN count(*) > 0
                   THEN round(count(*) FILTER (WHERE status = 'completed')::numeric / count(*) * 100)::int
              END AS "completionRate"
         FROM sessions
        WHERE scheduled_at >= now() - interval '90 days'`
    );

    const assessments = await queryOne(
      `SELECT count(*)::int AS "total",
              count(*) FILTER (WHERE status = 'completed')::int AS "completed",
              count(*) FILTER (WHERE status = 'in_progress')::int AS "inProgress",
              count(*) FILTER (WHERE r.reviewed_at IS NOT NULL)::int AS "reviewed",
              count(*) FILTER (WHERE r.is_high_risk)::int AS "flagged"
         FROM assessments a
         LEFT JOIN assessment_results r ON r.assessment_id = a.id
        WHERE a.created_at >= now() - interval '90 days'`
    );

    const escalations = await query(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
              count(*)::int AS total,
              count(*) FILTER (WHERE priority = 'critical')::int AS critical,
              count(*) FILTER (WHERE status IN ('new', 'under_review', 'action_required'))::int AS open,
              count(*) FILTER (WHERE status IN ('resolved', 'closed'))::int AS resolved
         FROM safety_escalations
        GROUP BY 1 ORDER BY 1 DESC
        LIMIT 12`
    );

    const supervision = await queryOne(
      `SELECT count(*)::int AS "therapists",
              count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM supervision_records sr
                 WHERE sr.therapist_id = u.id
                   AND sr.supervision_date >= CURRENT_DATE - make_interval(days => $1::int)
              ))::int AS "current"
         FROM users u
        WHERE u.role = 'therapist' AND u.status = 'active'`,
      [supervisionInterval]
    );

    const standards = await queryOne(
      `SELECT count(*)::int AS "total",
              count(*) FILTER (WHERE status = 'active')::int AS "active",
              count(*) FILTER (WHERE status = 'archived')::int AS "archived",
              count(*) FILTER (WHERE status <> 'archived' AND next_review_at <= now())::int AS "overdue",
              count(*) FILTER (WHERE status <> 'archived' AND next_review_at <= now() + interval '30 days')::int AS "dueSoon"
         FROM clinical_standards`
    );

    const ethics = await query(
      `SELECT g.title, g.version,
              (SELECT count(*)::int FROM users p
                WHERE p.status = 'active'
                  AND p.role IN (SELECT jsonb_array_elements_text(g.applicable_roles))) AS "practitioners",
              (SELECT count(*)::int FROM ethics_acknowledgments a
                WHERE a.guideline_id = g.id AND a.version = g.version) AS "acknowledged"
         FROM ethics_guidelines g
        WHERE g.status = 'active'
        ORDER BY g.title`
    );

    const quality = await queryOne(
      `SELECT
         (SELECT CASE WHEN count(*) > 0 THEN round(
                   count(*) FILTER (WHERE EXISTS (
                     SELECT 1 FROM session_notes n WHERE n.session_id = s.id))::numeric / count(*) * 100)::int END
            FROM sessions s WHERE s.status = 'completed'
              AND s.scheduled_at >= now() - interval '90 days') AS "documentationRate",
         (SELECT CASE WHEN count(*) > 0 THEN round(
                   count(*) FILTER (WHERE status = 'completed')::numeric / count(*) * 100)::int END
            FROM sessions WHERE scheduled_at >= now() - interval '90 days') AS "attendanceRate",
         (SELECT CASE WHEN count(*) > 0 THEN round(
                   count(*) FILTER (WHERE g.status = 'completed')::numeric / count(*) * 100)::int END
            FROM treatment_goals g JOIN treatment_plans p ON p.id = g.plan_id) AS "goalCompletionRate",
         (SELECT CASE WHEN count(*) > 0 THEN round(
                   count(*) FILTER (WHERE r.reviewed_at IS NOT NULL)::numeric / count(*) * 100)::int END
            FROM assessment_results r WHERE r.created_at >= now() - interval '90 days') AS "assessmentReviewRate",
         (SELECT CASE WHEN count(*) > 0 THEN round(avg(sf.rating)::numeric * 10) / 10 END
            FROM session_feedback sf WHERE sf.created_at >= now() - interval '90 days') AS "feedbackAverage"`
    );

    res.json({
      growth: growth.rows,
      workload,
      appointments,
      assessments,
      escalations: escalations.rows,
      supervision: {
        ...supervision,
        intervalDays: supervisionInterval,
        completionRate: supervision?.therapists
          ? Math.round((supervision.current / supervision.therapists) * 100)
          : null,
      },
      standards,
      ethics: ethics.rows.map((row) => ({
        ...row,
        rate: row.practitioners
          ? Math.round((row.acknowledged / row.practitioners) * 100)
          : null,
      })),
      quality,
    });
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
  monthly_clinical: {
    title: "Monthly clinical report",
    columns: ["month", "sessions", "completed", "cancelled", "assessments", "newClients"],
    async run() {
      const result = await query(
        `WITH months AS (
           SELECT generate_series(
             date_trunc('month', now()) - interval '11 months',
             date_trunc('month', now()),
             interval '1 month') AS month
         )
         SELECT to_char(m.month, 'YYYY-MM') AS month,
                (SELECT count(*)::int FROM sessions s
                  WHERE date_trunc('month', s.scheduled_at) = m.month) AS sessions,
                (SELECT count(*)::int FROM sessions s
                  WHERE date_trunc('month', s.scheduled_at) = m.month AND s.status = 'completed') AS completed,
                (SELECT count(*)::int FROM sessions s
                  WHERE date_trunc('month', s.scheduled_at) = m.month AND s.status = 'cancelled') AS cancelled,
                (SELECT count(*)::int FROM assessments a
                  WHERE date_trunc('month', COALESCE(a.completed_at, a.started_at)) = m.month
                    AND a.status = 'completed') AS assessments,
                (SELECT count(*)::int FROM users u
                  WHERE date_trunc('month', u.created_at) = m.month AND u.role = 'user') AS newClients
           FROM months m
          ORDER BY m.month`
      );
      return result.rows;
    },
  },
  supervision: {
    title: "Therapist supervision report",
    columns: ["therapist", "discipline", "lastSupervision", "records", "activeClients"],
    async run() {
      const { rows } = await query(
        `SELECT u.full_name AS therapist, p.discipline,
                (SELECT max(sr.supervision_date)::text FROM supervision_records sr
                  WHERE sr.therapist_id = u.id) AS "lastSupervision",
                (SELECT count(*)::int FROM supervision_records sr
                  WHERE sr.therapist_id = u.id) AS records,
                (SELECT count(DISTINCT c.client_id) FROM (
                   SELECT user_id AS client_id FROM sessions WHERE therapist_id = u.id
                   UNION SELECT client_id FROM client_cases WHERE therapist_id = u.id
                 ) c WHERE c.client_id <> u.id) AS "activeClients"
           FROM users u
           JOIN therapist_profiles p ON p.user_id = u.id
          WHERE u.role = 'therapist' AND u.status = 'active'
          ORDER BY u.full_name`
      );
      return rows;
    },
  },
  clinical_standards: {
    title: "Clinical standards report",
    columns: ["title", "version", "status", "lastReviewed", "nextReview", "revisions"],
    async run() {
      const { rows } = await query(
        `SELECT s.title, s.version, s.status,
                s.last_reviewed_at::date::text AS "lastReviewed",
                s.next_review_at::date::text AS "nextReview",
                (SELECT count(*)::int FROM standard_revisions r WHERE r.standard_id = s.id) AS revisions
           FROM clinical_standards s
          ORDER BY s.title`
      );
      return rows;
    },
  },
  safety_escalations: {
    title: "Safety escalation report",
    columns: ["reference", "priority", "status", "source", "raised", "resolved"],
    async run() {
      const { rows } = await query(
        `SELECT reference, priority, status, source,
                escalated_at::date::text AS raised,
                resolved_at::date::text AS resolved
           FROM safety_escalations
          ORDER BY created_at DESC`
      );
      return rows;
    },
  },
  ethics_acknowledgment: {
    title: "Ethics acknowledgment report",
    columns: ["guideline", "version", "practitioners", "acknowledged", "pending"],
    async run() {
      const { rows } = await query(
        `SELECT g.title AS guideline, g.version,
                (SELECT count(*)::int FROM users p
                  WHERE p.status = 'active'
                    AND p.role IN (SELECT jsonb_array_elements_text(g.applicable_roles))) AS practitioners,
                (SELECT count(*)::int FROM ethics_acknowledgments a
                  WHERE a.guideline_id = g.id AND a.version = g.version) AS acknowledged,
                (SELECT count(*)::int FROM users p
                  WHERE p.status = 'active'
                    AND p.role IN (SELECT jsonb_array_elements_text(g.applicable_roles))
                    AND NOT EXISTS (SELECT 1 FROM ethics_acknowledgments a
                                     WHERE a.guideline_id = g.id AND a.user_id = p.id AND a.version = g.version))
                  AS pending
           FROM ethics_guidelines g
          WHERE g.status = 'active'
          ORDER BY g.title`
      );
      return rows;
    },
  },
  client_outcomes: {
    title: "Client outcomes report",
    columns: ["client", "therapist", "sessions", "progressPercent", "lastAssessmentPercent"],
    async run() {
      const { rows } = await query(
        `SELECT u.full_name AS client,
                (SELECT t.full_name FROM client_cases cc JOIN users t ON t.id = cc.therapist_id
                  WHERE cc.client_id = u.id AND cc.status = 'active'
                  ORDER BY cc.updated_at DESC LIMIT 1) AS therapist,
                (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.status = 'completed') AS sessions,
                (SELECT round(avg(g.progress_percent))::int
                   FROM treatment_goals g JOIN treatment_plans p ON p.id = g.plan_id
                  WHERE p.client_id = u.id AND p.status = 'active' AND g.status <> 'dropped') AS "progressPercent",
                la.percent AS "lastAssessmentPercent"
           FROM users u
           LEFT JOIN LATERAL (
             SELECT CASE WHEN count(aa.score) > 0
                    THEN round(sum(aa.score)::numeric / (count(aa.score) * 5) * 100)::int END AS percent
               FROM assessments a
               JOIN assessment_answers aa ON aa.assessment_id = a.id
              WHERE a.user_id = u.id AND a.status = 'completed'
                AND a.id = (SELECT a2.id FROM assessments a2
                             WHERE a2.user_id = u.id AND a2.status = 'completed'
                             ORDER BY a2.completed_at DESC LIMIT 1)
           ) la ON true
          WHERE u.role = 'user' AND EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id)
          ORDER BY u.full_name`
      );
      return rows;
    },
  },
  appointments: {
    title: "Appointment report",
    columns: ["therapist", "scheduled", "completed", "cancelled", "attendanceRate"],
    async run() {
      const { rows } = await query(
        `SELECT t.full_name AS therapist,
                count(*)::int AS scheduled,
                count(*) FILTER (WHERE s.status = 'completed')::int AS completed,
                count(*) FILTER (WHERE s.status = 'cancelled')::int AS cancelled,
                CASE WHEN count(*) > 0
                     THEN round(count(*) FILTER (WHERE s.status = 'completed')::numeric / count(*) * 100)::int
                END AS "attendanceRate"
           FROM sessions s
           JOIN users t ON t.id = s.therapist_id
          WHERE s.scheduled_at >= now() - interval '90 days'
          GROUP BY t.full_name
          ORDER BY t.full_name`
      );
      return rows;
    },
  },
  matching: {
    title: "Matching report",
    columns: ["client", "concern", "searched", "decision", "therapist"],
    async run() {
      const { rows } = await query(
        `SELECT u.full_name AS client,
                ts.primary_issue_key AS concern,
                ts.created_at::date::text AS searched,
                COALESCE((SELECT md.decision FROM match_decisions md
                           WHERE md.search_id = ts.id ORDER BY md.created_at DESC LIMIT 1), 'pending') AS decision,
                (SELECT t.full_name FROM match_decisions md JOIN users t ON t.id = md.therapist_id
                  WHERE md.search_id = ts.id AND md.decision IN ('assigned', 'reassigned')
                  ORDER BY md.created_at DESC LIMIT 1) AS therapist
           FROM therapist_searches ts
           JOIN users u ON u.id = ts.user_id
          ORDER BY ts.created_at DESC`
      );
      return rows;
    },
  },
  quality: {
    title: "Quality indicators report",
    columns: ["therapist", "completedSessions", "documentedSessions", "documentationRate", "cancelledSessions"],
    async run() {
      const { rows } = await query(
        `SELECT u.full_name AS therapist,
                count(*) FILTER (WHERE s.status = 'completed')::int AS "completedSessions",
                count(*) FILTER (WHERE s.status = 'completed' AND EXISTS (
                  SELECT 1 FROM session_notes n WHERE n.session_id = s.id))::int AS "documentedSessions",
                CASE WHEN count(*) FILTER (WHERE s.status = 'completed') > 0
                     THEN round(
                       count(*) FILTER (WHERE s.status = 'completed' AND EXISTS (
                         SELECT 1 FROM session_notes n WHERE n.session_id = s.id))::numeric /
                       count(*) FILTER (WHERE s.status = 'completed') * 100)::int
                END AS "documentationRate",
                count(*) FILTER (WHERE s.status = 'cancelled')::int AS "cancelledSessions"
           FROM sessions s
           JOIN users u ON u.id = s.therapist_id
          WHERE s.scheduled_at >= now() - interval '90 days'
          GROUP BY u.full_name
          ORDER BY u.full_name`
      );
      return rows;
    },
  },
};

/** GET /api/advisor/reports - the catalogue. */
advisorRouter.get(
  "/reports",
  requireAnyPermission(["reports.generate", "outcomes.view"]),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, report_key AS "reportKey", format, row_count AS "rowCount",
              created_at AS "createdAt", advisor_id AS "advisorId"
         FROM report_exports
        ORDER BY created_at DESC
        LIMIT 25`
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

/** POST /api/advisor/reports/:key/generate */
advisorRouter.post(
  "/reports/:key/generate",
  requirePermission("reports.generate"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const key = req.params.key;
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

advisorRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
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

advisorRouter.post(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    await query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

advisorRouter.post(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
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
 * GET /api/advisor/threads/participants
 *
 * Who an advisor may open a thread with: the practitioners they oversee and,
 * when they hold `clients.view`, the clinic's clients. Messaging stays inside
 * the existing `conversations` table, so both sides already have a UI for it.
 */
advisorRouter.get(
  "/threads/participants",
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const held = await heldPermissions(req);
    const maySeeClients = held.has("clients.view");

    const roles = maySeeClients
      ? ["therapist", "supporter", "clinical_supervisor", "clinical_advisor", "collaborative_clinic", "user"]
      : ["therapist", "supporter", "clinical_supervisor", "clinical_advisor", "collaborative_clinic"];

    // Fixed clause order: $1 roles, $2 self, $3 search - built from the params
    // array so the binding and the placeholders can never drift apart.
    const params = [roles, req.user.id];
    const clauses = [
      `u.role = ANY($1::text[])`,
      `u.status = 'active'`,
      `u.id <> $2`,
    ];
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`u.full_name ILIKE $${params.length}`);
    }

    const { rows } = await query(
      `SELECT u.id, u.full_name AS "fullName", u.role
         FROM users u
        WHERE ${clauses.join(" AND ")}
        ORDER BY CASE WHEN u.role = 'user' THEN 1 ELSE 0 END, u.full_name
        LIMIT 50`,
      params
    );

    res.json({ participants: rows });
  })
);

/** POST /api/advisor/threads - open (or reuse) a thread with a practitioner. */
advisorRouter.post(
  "/threads",
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const { participantId } = parse(
      z.object({ participantId: z.string().trim().uuid("Choose a person to message") }),
      req.body
    );
    if (participantId === req.user.id) throw badRequest("You cannot message yourself");

    const participant = await queryOne(
      `SELECT id, full_name AS "fullName", role FROM users WHERE id = $1 AND status = 'active'`,
      [participantId]
    );
    if (!participant) throw notFound("That person is not available");

    const held = await heldPermissions(req);
    const maySeeClients = held.has("clients.view");
    if (participant.role === "user" && !maySeeClients) {
      throw forbidden("You do not have permission to message clients");
    }

    const conversation = await transaction(async (tx) => {
      const inserted = await tx.query(
        `INSERT INTO conversations (user_id, therapist_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, therapist_id) DO NOTHING
         RETURNING id`,
        [req.user.id, participantId]
      );
      if (inserted.rows[0]) return inserted.rows[0];

      const existing = await tx.query(
        `SELECT id FROM conversations WHERE user_id = $1 AND therapist_id = $2 LIMIT 1`,
        [req.user.id, participantId]
      );
      return existing.rows[0];
    });

    res.status(201).json({ conversationId: conversation.id, participant });
  })
);

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

advisorRouter.get(
  "/announcements",
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const { rows } = await query(
      `SELECT a.id, a.title, a.body, a.audience, a.status, a.publish_at AS "publishAt",
              a.created_at AS "createdAt", u.full_name AS "createdByName"
         FROM clinic_announcements a
         LEFT JOIN users u ON u.id = a.created_by
        ORDER BY a.created_at DESC
        LIMIT 50`
    );
    res.json({ announcements: rows });
  })
);

const announcementSchema = z.object({
  title: z.string().trim().min(3, "Give the announcement a title").max(200),
  body: z.string().trim().min(3, "Write the announcement").max(4000),
  audience: z
    .array(z.enum(["user", "supporter", "therapist", "clinical_advisor", "clinical_supervisor", "collaborative_clinic", "all"]))
    .optional()
    .default(["all"]),
  status: z.enum(["draft", "published", "archived"]).optional().default("draft"),
  publishAt: dateOrNull,
});

advisorRouter.post(
  "/announcements",
  requirePermission("announcements.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const data = parse(announcementSchema, req.body);

    const { rows } = await query(
      `INSERT INTO clinic_announcements (title, body, audience, status, publish_at, created_by)
       VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz, $6)
       RETURNING id`,
      [
        data.title,
        data.body,
        JSON.stringify(data.audience),
        data.status,
        data.publishAt ?? null,
        req.user.id,
      ]
    );

    if (data.status === "published") await fanOutAnnouncement(rows[0].id, data, req.user.id);

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.ANNOUNCEMENT_PUBLISHED,
      targetType: "clinic_announcement",
      targetId: rows[0].id,
      detail: { status: data.status, audience: data.audience },
    });

    res.status(201).json({ id: rows[0].id });
  })
);

advisorRouter.patch(
  "/announcements/:id",
  requirePermission("announcements.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const id = uuidParam(req.params.id, "Announcement");
    const current = await queryOne(`SELECT * FROM clinic_announcements WHERE id = $1`, [id]);
    if (!current) throw notFound("That announcement does not exist");

    const data = parse(announcementSchema.partial(), req.body);
    const publishing = data.status === "published" && current.status !== "published";

    await query(
      `UPDATE clinic_announcements
          SET title = $2, body = $3, audience = $4::jsonb, status = $5,
              publish_at = $6::timestamptz
        WHERE id = $1`,
      [
        id,
        data.title ?? current.title,
        data.body ?? current.body,
        JSON.stringify(data.audience ?? current.audience),
        data.status ?? current.status,
        data.publishAt === undefined
          ? current.publish_at
          : data.publishAt,
      ]
    );

    if (publishing) {
      await fanOutAnnouncement(
        id,
        {
          title: data.title ?? current.title,
          body: data.body ?? current.body,
          audience: data.audience ?? current.audience,
        },
        req.user.id
      );
    }

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.ANNOUNCEMENT_PUBLISHED,
      targetType: "clinic_announcement",
      targetId: id,
      detail: { status: data.status ?? current.status },
    });

    res.json({ ok: true });
  })
);

/** Tells everyone in the audience through the notification inbox they already have. */
async function fanOutAnnouncement(announcementId, data, actorId) {
  const audience = data.audience ?? ["all"];
  const includeAll = audience.includes("all");
  const roles = audience.filter((role) => role !== "all");

  const params = [];
  const clauses = [`status = 'active'`];
  if (!includeAll) {
    params.push(roles);
    clauses.push(`role = ANY($${params.length}::text[])`);
  }
  params.push(actorId);
  clauses.push(`id <> $${params.length}`);

  const { rows } = await query(
    `SELECT id FROM users WHERE ${clauses.join(" AND ")}`,
    params
  );

  for (const row of rows) {
    await notify({
      userId: row.id,
      type: "clinic_announcement",
      title: data.title,
      body: data.body.length > 160 ? `${data.body.slice(0, 157)}...` : data.body,
      link: null,
      data: { announcementId },
      key: `announcement:${announcementId}`,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Clinic settings                                                     */
/* ------------------------------------------------------------------ */

advisorRouter.get(
  "/settings",
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const held = await heldPermissions(req);

    const { rows } = await query(
      `SELECT key, value, category, description, admin_only AS "adminOnly",
              updated_at AS "updatedAt"
         FROM clinic_settings
        ORDER BY category, key`
    );

    res.json({
      settings: rows.map((row) => ({ ...row, canEdit: !row.adminOnly })),
      canManage: held.has("clinic_settings.manage"),
      permissions: [...held],
    });
  })
);

advisorRouter.patch(
  "/settings",
  requirePermission("clinic_settings.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const data = parse(
      z.object({
        settings: z
          .array(z.object({ key: z.string().trim().min(1), value: z.unknown() }))
          .min(1, "Send at least one setting"),
      }),
      req.body
    );

    const changes = [];
    for (const item of data.settings) {
      const row = await queryOne(`SELECT admin_only FROM clinic_settings WHERE key = $1`, [
        item.key,
      ]);
      if (!row) throw badRequest(`Unknown setting: ${item.key}`);
      if (row.admin_only) {
        throw forbidden(`"${item.key}" is managed by the platform administrator`);
      }

      await query(
        `UPDATE clinic_settings SET value = $2::jsonb, updated_by = $3, updated_at = now() WHERE key = $1`,
        [item.key, JSON.stringify(item.value ?? null), req.user.id]
      );
      changes.push(item.key);
    }

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SETTINGS_CHANGED,
      targetType: "clinic_settings",
      targetId: changes.join(","),
      detail: { keys: changes },
    });

    res.json({ ok: true, changed: changes });
  })
);

/* ------------------------------------------------------------------ */
/* Permissions and audit                                               */
/* ------------------------------------------------------------------ */

advisorRouter.get(
  "/permissions",
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const held = await heldPermissions(req);
    res.json({
      permissions: PERMISSIONS.map((permission) => ({
        permission,
        label: PERMISSION_LABELS[permission],
        granted: held.has(permission),
      })),
      held: [...held],
    });
  })
);

advisorRouter.put(
  "/permissions/:userId",
  requirePermission("permissions.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    // "self" lets an advisor edit their own permissions without knowing their id.
    const userId =
      req.params.userId === "self" ? req.user.id : uuidParam(req.params.userId, "Advisor");

    const target = await queryOne(`SELECT id, role FROM users WHERE id = $1`, [userId]);
    if (!target) throw notFound("That advisor does not exist");
    if (target.role !== "clinical_advisor") throw badRequest("Permissions apply to clinical advisors");

    const data = parse(
      z.object({ permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length) }),
      req.body
    );

    await transaction(async (tx) => {
      await tx.query(`DELETE FROM advisor_permissions WHERE user_id = $1`, [userId]);
      for (const permission of data.permissions) {
        await tx.query(
          `INSERT INTO advisor_permissions (user_id, permission, granted_by) VALUES ($1, $2, $3)`,
          [userId, permission, req.user.id]
        );
      }
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.PERMISSIONS_CHANGED,
      targetType: "clinical_advisor",
      targetId: userId,
      detail: { count: data.permissions.length },
    });

    res.json({ ok: true, permissions: data.permissions });
  })
);

advisorRouter.get(
  "/audit",
  requirePermission("audit.view"),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const action = typeof req.query.action === "string" ? req.query.action.trim() : "";

    const params = [];
    let filter = "";
    if (action) {
      params.push(action);
      filter = `WHERE a.action = $1`;
    }
    params.push(limit);

    const { rows } = await query(
      `SELECT a.id, a.action, a.target_type AS "targetType", a.target_id AS "targetId",
              a.result, a.detail, a.created_at AS "createdAt",
              a.actor_id AS "actorId", u.full_name AS "actorName", a.actor_role AS "actorRole"
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
        ${filter}
        ORDER BY a.created_at DESC
        LIMIT $${params.length}`,
      params
    );

    res.json({ entries: rows, total: rows.length });
  })
);

export default advisorRouter;
