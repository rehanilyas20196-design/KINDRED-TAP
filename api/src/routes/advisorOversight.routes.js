/**
 * Clinical oversight: standards, supervision, safety escalations, ethics.
 *
 * Three rules shape this file:
 *
 *  1. Policy history is append only. A standard or guideline is updated by
 *     writing a new revision row alongside the change, never by overwriting
 *     what the record used to say.
 *  2. Safety escalations are triage, not diagnosis. The portal records what a
 *     human said and moves it through review; nothing here computes risk.
 *  3. Supervision records supervision. They never read session notes or any
 *     other private therapist-client clinical record.
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
  higherPriority,
  notifyAdvisors,
  readIntSetting,
  readSetting,
  textOrNull,
  uuidParam,
} from "../lib/advisor.js";
import { permissionsFor, requireAnyPermission, requirePermission } from "../lib/permissions.js";
import { notify } from "../lib/notifications.js";

export const oversightRouter = Router();

oversightRouter.use(requireAuth);

/* ------------------------------------------------------------------ */
/* Clinical standards                                                  */
/* ------------------------------------------------------------------ */

const STANDARD_COLUMNS = `
  s.id,
  s.key,
  s.title,
  s.description,
  s.category,
  s.version,
  s.status,
  s.owner_user_id                          AS "ownerId",
  owner.full_name                          AS "ownerName",
  s.last_reviewed_at                       AS "lastReviewedAt",
  s.next_review_at                         AS "nextReviewAt",
  s.created_at                             AS "createdAt",
  s.updated_at                             AS "updatedAt",
  (SELECT count(*)::int
     FROM standard_revisions r WHERE r.standard_id = s.id) AS "revisionCount",
  (s.status <> 'archived'
     AND s.next_review_at IS NOT NULL
     AND s.next_review_at <= now() + interval '30 days')   AS "reviewDue"
`;

const STANDARD_FROM = `
  FROM clinical_standards s
  LEFT JOIN users owner ON owner.id = s.owner_user_id
`;

const snapshotOf = (row) =>
  JSON.stringify({
    title: row.title,
    description: row.description,
    category: row.category,
    version: row.version,
    status: row.status,
    nextReviewAt: row.next_review_at,
  });

async function loadStandard(id) {
  const row = await queryOne(
    `SELECT s.*, owner.full_name AS "ownerName"
       ${STANDARD_FROM}
      WHERE s.id = $1
      LIMIT 1`,
    [id]
  );
  if (!row) throw notFound("That clinical standard does not exist");
  return row;
}

/**
 * The detail endpoints share `loadStandard` with the revision writers, which
 * read snake_case columns directly. Everything that leaves the API goes
 * through this view first so clients only ever see the camelCase shape the
 * list endpoint already returns.
 */
const standardView = (row) => ({
  id: row.id,
  key: row.key,
  title: row.title,
  description: row.description,
  category: row.category,
  version: row.version,
  status: row.status,
  ownerId: row.owner_user_id ?? null,
  ownerName: row.ownerName ?? null,
  lastReviewedAt: row.last_reviewed_at ?? null,
  nextReviewAt: row.next_review_at ?? null,
  createdBy: row.created_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function writeRevision({ standardId, version, action, summary, snapshot, actorId }) {
  await query(
    `INSERT INTO standard_revisions (standard_id, version, action, change_summary, snapshot, changed_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [standardId, version, action, summary ?? null, snapshot, actorId ?? null]
  );
}

/** GET /api/advisor/standards */
oversightRouter.get(
  "/standards",
  requirePermission("clinical_standards.view"),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const filters = [];
    const params = [];
    if (status) {
      params.push(status);
      filters.push(`s.status = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT ${STANDARD_COLUMNS}
         ${STANDARD_FROM}
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY CASE s.status
                   WHEN 'active' THEN 0 WHEN 'under_review' THEN 1
                   WHEN 'revision_requested' THEN 2 WHEN 'draft' THEN 3 ELSE 4
                 END,
                 s.next_review_at NULLS LAST,
                 s.title`,
      params
    );

    const reviewDue = rows.filter((row) => row.reviewDue).length;
    res.json({ standards: rows, total: rows.length, reviewDue });
  })
);

/** GET /api/advisor/standards/:id - one standard plus its full revision history. */
oversightRouter.get(
  "/standards/:id",
  requirePermission("clinical_standards.view"),
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Standard");
    const standard = await loadStandard(id);

    const { rows: revisions } = await query(
      `SELECT r.id,
              r.version,
              r.action,
              r.change_summary                  AS "changeSummary",
              r.snapshot,
              r.changed_by                      AS "changedBy",
              u.full_name                       AS "changedByName",
              r.created_at                      AS "createdAt"
         FROM standard_revisions r
         LEFT JOIN users u ON u.id = r.changed_by
        WHERE r.standard_id = $1
        ORDER BY r.created_at DESC`,
      [id]
    );

    res.json({ standard: standardView(standard), revisions });
  })
);

const standardInput = z.object({
  title: z.string().trim().min(3, "Give the standard a title").max(200),
  description: z.string().trim().max(4000).optional().default(""),
  category: z.string().trim().max(60).optional().default("general"),
  version: z.string().trim().max(20).optional().default("1.0"),
  status: z.enum(["draft", "active", "under_review", "revision_requested", "archived"]).optional(),
  ownerId: z.string().trim().uuid().nullable().optional(),
  nextReviewAt: dateOrNull,
});

/** POST /api/advisor/standards */
oversightRouter.post(
  "/standards",
  requirePermission("clinical_standards.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const data = parse(standardInput, req.body);

    const key =
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || `standard-${Date.now().toString(36)}`;

    const existing = await queryOne("SELECT 1 AS taken FROM clinical_standards WHERE key = $1", [
      key,
    ]);
    if (existing) throw conflict("A standard with that title already exists");

    const created = await transaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO clinical_standards
           (key, title, description, category, version, status, owner_user_id, next_review_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9)
         RETURNING id`,
        [
          key,
          data.title,
          data.description ?? "",
          data.category ?? "general",
          data.version ?? "1.0",
          data.status ?? "active",
          data.ownerId ?? req.user.id,
          data.nextReviewAt ?? null,
          req.user.id,
        ]
      );
      const id = rows[0].id;

      await tx.query(
        `INSERT INTO standard_revisions (standard_id, version, action, change_summary, snapshot, changed_by)
         VALUES ($1, $2, 'created', $3, $4::jsonb, $5)`,
        [
          id,
          data.version ?? "1.0",
          "Standard created",
          JSON.stringify({
            title: data.title,
            description: data.description ?? "",
            category: data.category ?? "general",
            version: data.version ?? "1.0",
            status: data.status ?? "active",
            nextReviewAt: data.nextReviewAt ?? null,
          }),
          req.user.id,
        ]
      );
      return id;
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.STANDARD_CREATED,
      targetType: "clinical_standard",
      targetId: created,
      detail: { title: data.title, version: data.version ?? "1.0" },
    });

    res.status(201).json({ standard: standardView(await loadStandard(created)) });
  })
);

/** PATCH /api/advisor/standards/:id - writes a revision of what it replaced. */
oversightRouter.patch(
  "/standards/:id",
  requirePermission("clinical_standards.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const id = uuidParam(req.params.id, "Standard");
    const current = await loadStandard(id);
    const data = parse(standardInput.partial(), req.body);

    const next = {
      title: data.title ?? current.title,
      description: data.description ?? current.description,
      category: data.category ?? current.category,
      version: data.version ?? current.version,
      status: data.status ?? current.status,
      ownerId: data.ownerId === undefined ? current.owner_user_id : data.ownerId,
      nextReviewAt:
        data.nextReviewAt === undefined
          ? current.next_review_at
            ? new Date(current.next_review_at).toISOString().slice(0, 10)
            : null
          : data.nextReviewAt,
    };

    const changed =
      next.title !== current.title ||
      next.description !== current.description ||
      next.category !== current.category ||
      next.version !== current.version ||
      next.status !== current.status ||
      next.ownerId !== current.owner_user_id ||
      next.nextReviewAt !==
        (current.next_review_at ? new Date(current.next_review_at).toISOString().slice(0, 10) : null);

    if (!changed) {
      return res.json({ standard: standardView(current), changed: false });
    }

    const before = snapshotOf(current);

    await transaction(async (tx) => {
      await tx.query(
        `UPDATE clinical_standards
            SET title = $2, description = $3, category = $4, version = $5,
                status = $6, owner_user_id = $7, next_review_at = $8::timestamptz
          WHERE id = $1`,
        [
          id,
          next.title,
          next.description,
          next.category,
          next.version,
          next.status,
          next.ownerId,
          next.nextReviewAt,
        ]
      );

      await tx.query(
        `INSERT INTO standard_revisions (standard_id, version, action, change_summary, snapshot, changed_by)
         VALUES ($1, $2, 'updated', $3, $4::jsonb, $5)`,
        [
          id,
          next.version,
          `Updated from version ${current.version}`,
          before,
          req.user.id,
        ]
      );
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.STANDARD_UPDATED,
      targetType: "clinical_standard",
      targetId: id,
      detail: { fromVersion: current.version, toVersion: next.version, status: next.status },
    });

    return res.json({ standard: standardView(await loadStandard(id)), changed: true });
  })
);

const reviewSchema = z.object({
  action: z.enum(["reviewed", "revision_requested"]),
  notes: textOrNull(2000),
  nextReviewAt: dateOrNull,
});

/** POST /api/advisor/standards/:id/review - the review workflow. */
oversightRouter.post(
  "/standards/:id/review",
  requirePermission("clinical_standards.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const id = uuidParam(req.params.id, "Standard");
    const current = await loadStandard(id);
    if (current.status === "archived") throw conflict("An archived standard cannot be reviewed");

    const data = parse(reviewSchema, req.body);
    const intervalDays = await readIntSetting("standards_review_interval_days", 90);

    let nextReviewAt = data.nextReviewAt;
    if (data.action === "reviewed" && !nextReviewAt) {
      const date = new Date();
      date.setDate(date.getDate() + intervalDays);
      nextReviewAt = date.toISOString().slice(0, 10);
    }
    if (data.action === "revision_requested" && !nextReviewAt) {
      nextReviewAt = current.next_review_at
        ? new Date(current.next_review_at).toISOString().slice(0, 10)
        : null;
    }

    const status = data.action === "reviewed" ? "active" : "revision_requested";

    await transaction(async (tx) => {
      await tx.query(
        `UPDATE clinical_standards
            SET status = $2,
                last_reviewed_at = CASE WHEN $3::boolean THEN now() ELSE last_reviewed_at END,
                next_review_at = $4::timestamptz
          WHERE id = $1`,
        [id, status, data.action === "reviewed", nextReviewAt]
      );
      await tx.query(
        `INSERT INTO standard_revisions (standard_id, version, action, change_summary, snapshot, changed_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [
          id,
          current.version,
          data.action,
          data.notes ??
            (data.action === "reviewed" ? "Reviewed and confirmed current" : "Revision requested"),
          snapshotOf(current),
          req.user.id,
        ]
      );
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: data.action === "reviewed" ? AUDIT_ACTIONS.STANDARD_REVIEWED : AUDIT_ACTIONS.STANDARD_UPDATED,
      targetType: "clinical_standard",
      targetId: id,
      detail: { action: data.action, version: current.version },
    });

    res.json({ standard: standardView(await loadStandard(id)) });
  })
);

/** POST /api/advisor/standards/:id/archive */
oversightRouter.post(
  "/standards/:id/archive",
  requirePermission("clinical_standards.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const id = uuidParam(req.params.id, "Standard");
    const current = await loadStandard(id);
    if (current.status === "archived") throw conflict("This standard is already archived");

    await transaction(async (tx) => {
      await tx.query(`UPDATE clinical_standards SET status = 'archived' WHERE id = $1`, [id]);
      await tx.query(
        `INSERT INTO standard_revisions (standard_id, version, action, change_summary, snapshot, changed_by)
         VALUES ($1, $2, 'archived', 'Archived', $3::jsonb, $4)`,
        [id, current.version, snapshotOf(current), req.user.id]
      );
    });

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.STANDARD_ARCHIVED,
      targetType: "clinical_standard",
      targetId: id,
      detail: { version: current.version },
    });

    res.json({ standard: standardView(await loadStandard(id)) });
  })
);

/* ------------------------------------------------------------------ */
/* Supervision                                                         */
/* ------------------------------------------------------------------ */

const SUPERVISION_COLUMNS = `
  u.id,
  u.full_name                              AS "fullName",
  p.discipline,
  p.clinical_areas                         AS "clinicalAreas",
  p.availability_days                      AS "availabilityDays",
  (SELECT max(sr.supervision_date)::text
     FROM supervision_records sr WHERE sr.therapist_id = u.id) AS "lastSupervisionDate",
  (SELECT sr.created_at
     FROM supervision_records sr WHERE sr.therapist_id = u.id
    ORDER BY sr.supervision_date DESC, sr.created_at DESC LIMIT 1) AS "lastSupervisionAt",
  (SELECT count(*)::int
     FROM supervision_records sr WHERE sr.therapist_id = u.id) AS "recordCount",
  (SELECT count(*)::int
     FROM supervision_records sr
    WHERE sr.therapist_id = u.id
      AND sr.status IN ('open')
      AND sr.follow_up_date IS NOT NULL)   AS "openActionItems",
  (SELECT min(sr.follow_up_date)::text
     FROM supervision_records sr
    WHERE sr.therapist_id = u.id
      AND sr.status = 'open'
      AND sr.follow_up_date >= CURRENT_DATE) AS "nextFollowUpDate",
  (SELECT count(*)::int
     FROM supervision_records sr
    WHERE sr.therapist_id = u.id
      AND sr.supervision_date >= CURRENT_DATE) AS "upcomingCount",
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
    WHERE c.client_id <> u.id)              AS "activeClients"
`;

/**
 * Supervision status is derived, never stored: the interval comes from clinic
 * settings, so changing it updates every therapist at once.
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

/** GET /api/advisor/supervision - the supervision overview. */
oversightRouter.get(
  "/supervision",
  requirePermission("supervision.view"),
  asyncHandler(async (req, res) => {
    const intervalDays = await readIntSetting("supervision_interval_days", 30);

    const { rows } = await query(
      `SELECT ${SUPERVISION_COLUMNS}
         FROM users u
         JOIN therapist_profiles p ON p.user_id = u.id
        WHERE u.role = 'therapist' AND u.status = 'active'
        ORDER BY u.full_name NULLS LAST`
    );

    const therapists = rows.map((row) => ({
      ...row,
      supervision: supervisionStatus(row.lastSupervisionDate, intervalDays),
    }));

    const requiring = therapists.filter((t) =>
      ["overdue", "due_soon", "never"].includes(t.supervision.status)
    );
    const overdue = therapists.filter((t) => t.supervision.status === "overdue");
    const upcoming = therapists.filter((t) => t.upcomingCount > 0);

    const { rows: recent } = await query(
      `SELECT r.id,
              r.therapist_id                     AS "therapistId",
              t.full_name                        AS "therapistName",
              r.advisor_id                       AS "advisorId",
              a.full_name                        AS "advisorName",
              r.supervision_date::text           AS "supervisionDate",
              r.modality,
              r.focus,
              r.status,
              r.follow_up_date::text             AS "followUpDate",
              r.created_at                       AS "createdAt"
         FROM supervision_records r
         JOIN users t ON t.id = r.therapist_id
         LEFT JOIN users a ON a.id = r.advisor_id
        ORDER BY r.supervision_date DESC, r.created_at DESC
        LIMIT 12`
    );

    res.json({
      intervalDays,
      overview: {
        therapistsRequiringSupervision: requiring.length,
        overdueReviews: overdue.length,
        upcomingSessions: upcoming.length,
        recentRecords: recent.length,
        totalTherapists: therapists.length,
      },
      therapists,
      recent,
    });
  })
);

/** GET /api/advisor/supervision/:therapistId - one therapist's supervision record. */
oversightRouter.get(
  "/supervision/:therapistId",
  requirePermission("supervision.view"),
  asyncHandler(async (req, res) => {
    const therapistId = uuidParam(req.params.therapistId, "Therapist");
    const intervalDays = await readIntSetting("supervision_interval_days", 30);

    const therapist = await queryOne(
      `SELECT ${SUPERVISION_COLUMNS}
         FROM users u
         JOIN therapist_profiles p ON p.user_id = u.id
        WHERE u.id = $1 AND u.role = 'therapist'`,
      [therapistId]
    );
    if (!therapist) throw notFound("That therapist does not exist");

    const { rows: records } = await query(
      `SELECT r.id,
              r.therapist_id                     AS "therapistId",
              r.advisor_id                       AS "advisorId",
              r.supervision_date::text           AS "supervisionDate",
              r.modality,
              r.focus,
              r.discussion_topics                AS "discussionTopics",
              r.development_areas                AS "developmentAreas",
              r.concerns,
              r.action_items                     AS "actionItems",
              r.follow_up_date::text             AS "followUpDate",
              r.status,
              r.created_at                       AS "createdAt",
              r.updated_at                       AS "updatedAt",
              a.full_name                        AS "advisorName"
         FROM supervision_records r
         LEFT JOIN users a ON a.id = r.advisor_id
        WHERE r.therapist_id = $1
        ORDER BY r.supervision_date DESC, r.created_at DESC`,
      [therapistId]
    );

    res.json({
      therapist: {
        ...therapist,
        supervision: supervisionStatus(therapist.lastSupervisionDate, intervalDays),
      },
      records,
      intervalDays,
    });
  })
);

const supervisionInput = z.object({
  supervisionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the supervision date"),
  modality: z.enum(["individual", "group", "peer", "case_review"]).optional().default("individual"),
  focus: textOrNull(200),
  discussionTopics: textOrNull(4000),
  developmentAreas: textOrNull(4000),
  concerns: textOrNull(4000),
  actionItems: textOrNull(4000),
  followUpDate: dateOrNull,
  status: z.enum(["open", "completed", "closed"]).optional().default("open"),
});

/**
 * POST /api/advisor/supervision/:therapistId
 *
 * Records supervision. The payload is deliberately about the practitioner -
 * topics, development, concerns, actions - and there is no field for client
 * clinical detail, because supervision records are not case notes.
 */
oversightRouter.post(
  "/supervision/:therapistId",
  requirePermission("supervision.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const therapistId = uuidParam(req.params.therapistId, "Therapist");
    const data = parse(supervisionInput, req.body);

    const therapist = await queryOne(
      `SELECT id, full_name FROM users WHERE id = $1 AND role = 'therapist'`,
      [therapistId]
    );
    if (!therapist) throw notFound("That therapist does not exist");

    const { rows } = await query(
      `INSERT INTO supervision_records
         (therapist_id, advisor_id, supervision_date, modality, focus,
          discussion_topics, development_areas, concerns, action_items,
          follow_up_date, status)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10::date, $11)
       RETURNING id`,
      [
        therapistId,
        req.user.id,
        data.supervisionDate,
        data.modality,
        data.focus ?? null,
        data.discussionTopics ?? null,
        data.developmentAreas ?? null,
        data.concerns ?? null,
        data.actionItems ?? null,
        data.followUpDate ?? null,
        data.status,
      ]
    );
    const recordId = rows[0].id;

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.SUPERVISION_CREATED,
      targetType: "supervision_record",
      targetId: recordId,
      detail: {
        therapistId,
        supervisionDate: data.supervisionDate,
        status: data.status,
        hasActionItems: Boolean(data.actionItems),
      },
    });

    if (data.followUpDate) {
      await notify({
        userId: therapistId,
        type: "treatment_plan_reminder",
        title: "Supervision follow-up scheduled",
        body: `A supervision follow-up was recorded for ${data.followUpDate}.`,
        link: "/portal/therapist/settings",
        data: { supervisionRecordId: recordId },
        key: `supervision-followup:${recordId}`,
      });
    }

    res.status(201).json({ recordId, ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Safety escalations                                                  */
/* ------------------------------------------------------------------ */

const ESCALATION_COLUMNS = `
  e.id,
  e.reference,
  e.source,
  e.priority,
  e.status,
  e.risk_type                               AS "riskType",
  e.client_id                               AS "clientId",
  e.client_alias                            AS "clientAlias",
  e.therapist_id                            AS "therapistId",
  therapist.full_name                       AS "therapistName",
  e.assigned_reviewer_id                    AS "reviewerId",
  reviewer.full_name                        AS "reviewerName",
  e.session_id                              AS "sessionId",
  e.escalated_at                            AS "escalatedAt",
  e.created_at                              AS "createdAt",
  e.updated_at                              AS "updatedAt",
  e.resolved_at                             AS "resolvedAt",
  e.closed_at                               AS "closedAt",
  (SELECT count(*)::int
     FROM safety_escalation_events ev WHERE ev.escalation_id = e.id) AS "eventCount"
`;

const ESCALATION_FROM = `
  FROM safety_escalations e
  LEFT JOIN users therapist ON therapist.id = e.therapist_id
  LEFT JOIN users reviewer  ON reviewer.id  = e.assigned_reviewer_id
`;

/** GET /api/advisor/safety - the escalation queue. */
oversightRouter.get(
  "/safety",
  requirePermission("safety_escalations.view"),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const priority = typeof req.query.priority === "string" ? req.query.priority.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const filters = [];
    const params = [];
    if (status) {
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
        `(e.reference ILIKE $${at} OR e.client_alias ILIKE $${at} OR therapist.full_name ILIKE $${at})`
      );
    }

    const { rows } = await query(
      `SELECT ${ESCALATION_COLUMNS},
              client.full_name AS "clientName"
         ${ESCALATION_FROM}
         LEFT JOIN users client ON client.id = e.client_id
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

    // A client name is only shown to an advisor who may see clients at all.
    const held = await permissionsFor(req.user.id);
    const maySeeClients = held.has("clients.view");

    const escalations = rows.map((row) => ({
      ...row,
      clientName: maySeeClients ? row.clientName : null,
    }));

    const counts = escalations.reduce(
      (acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      },
      { new: 0, under_review: 0, action_required: 0, resolved: 0, closed: 0 }
    );

    res.json({
      escalations,
      total: escalations.length,
      counts,
      maySeeClients,
    });
  })
);

/** GET /api/advisor/safety/:id - one escalation with its full action trail. */
oversightRouter.get(
  "/safety/:id",
  requirePermission("safety_escalations.view"),
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Escalation");

    const escalation = await queryOne(
      `SELECT ${ESCALATION_COLUMNS},
              e.reason,
              e.observations,
              e.recommended_action             AS "recommendedAction",
              e.actions_taken                  AS "actionsTaken",
              e.follow_up_actions              AS "followUpActions",
              e.resolution,
              e.created_by                     AS "createdBy",
              creator.full_name                AS "createdByName",
              client.full_name                 AS "clientName"
         ${ESCALATION_FROM}
         LEFT JOIN users creator ON creator.id = e.created_by
         LEFT JOIN users client  ON client.id  = e.client_id
        WHERE e.id = $1
        LIMIT 1`,
      [id]
    );
    if (!escalation) throw notFound("That escalation does not exist");

    const { rows: events } = await query(
      `SELECT ev.id,
              ev.action,
              ev.detail,
              ev.from_status                   AS "fromStatus",
              ev.to_status                     AS "toStatus",
              ev.actor_id                      AS "actorId",
              u.full_name                      AS "actorName",
              ev.actor_role                    AS "actorRole",
              ev.created_at                    AS "createdAt"
         FROM safety_escalation_events ev
         LEFT JOIN users u ON u.id = ev.actor_id
        WHERE ev.escalation_id = $1
        ORDER BY ev.created_at ASC`,
      [id]
    );

    const held = await permissionsFor(req.user.id);
    const maySeeClients = held.has("clients.view");

    const emergencyProcedure = await readSetting("escalation_emergency_procedure", null);
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
      emergencyProcedure: escalation.priority === "critical" ? emergencyProcedure : null,
      responseHours,
    });
  })
);

const ESCALATION_ACTIONS = {
  acknowledge: { status: "under_review", label: "acknowledged escalation" },
  assign_reviewer: { status: "under_review", label: "assigned a reviewer" },
  request_information: { status: "action_required", label: "requested more information" },
  add_action: { status: null, label: "added a follow-up action" },
  escalate: { status: "action_required", label: "escalated the escalation" },
  resolve: { status: "resolved", label: "marked the escalation resolved" },
  close: { status: "closed", label: "closed the escalation" },
};

const actionSchema = z.object({
  action: z.enum(Object.keys(ESCALATION_ACTIONS)),
  detail: textOrNull(2000),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assignedReviewerId: z.string().trim().uuid().nullable().optional(),
  resolution: textOrNull(4000),
  followUpActions: textOrNull(4000),
});

/**
 * POST /api/advisor/safety/:id/actions
 *
 * Every action writes an event row and an audit entry, so the trail on the
 * detail page is the same data an auditor reads.
 */
oversightRouter.post(
  "/safety/:id/actions",
  requirePermission("safety_escalations.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const id = uuidParam(req.params.id, "Escalation");
    const data = parse(actionSchema, req.body);

    const current = await queryOne(
      `SELECT id, reference, status, priority, therapist_id, actions_taken
         FROM safety_escalations WHERE id = $1`,
      [id]
    );
    if (!current) throw notFound("That escalation does not exist");

    const config = ESCALATION_ACTIONS[data.action];
    const fromStatus = current.status;

    if (fromStatus === "closed" && data.action !== "close") {
      throw conflict("This escalation is closed");
    }
    if (data.action === "resolve" && fromStatus === "resolved") {
      throw conflict("This escalation is already resolved");
    }
    if (data.action === "acknowledge" && fromStatus !== "new") {
      throw conflict("This escalation has already been acknowledged");
    }

    const nextStatus =
      config.status ??
      (data.action === "escalate" && fromStatus === "new" ? "under_review" : fromStatus);

    const nextPriority =
      data.action === "escalate"
        ? higherPriority(current.priority, data.priority ?? "critical")
        : data.priority ?? current.priority;

    if (data.assignedReviewerId) {
      const reviewer = await queryOne(
        `SELECT id FROM users WHERE id = $1 AND role = 'clinical_advisor'`,
        [data.assignedReviewerId]
      );
      if (!reviewer) throw badRequest("Choose a clinical advisor as the reviewer");
    }

    const reviewerId =
      data.action === "assign_reviewer"
        ? data.assignedReviewerId ?? null
        : current.assigned_reviewer_id;

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
          data.action === "assign_reviewer" ? reviewerId : null,
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
            (data.action === "assign_reviewer" && reviewerId
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

    if (data.action === "escalate") {
      await notifyAdvisors({
        type: "safety_escalation",
        title: `Escalation ${current.reference} raised to ${nextPriority}`,
        body: data.detail ?? "A safety escalation was escalated for immediate review.",
        link: `/portal/clinical-advisor/safety/${id}`,
        data: { escalationId: id },
        key: `escalation-raised:${id}:${nextPriority}`,
      });
    }

    res.json({ ok: true, status: nextStatus, priority: nextPriority });
  })
);

/* ------------------------------------------------------------------ */
/* Ethical guidelines                                                  */
/* ------------------------------------------------------------------ */

const ETHICS_COLUMNS = `
  g.id,
  g.key,
  g.title,
  g.description,
  g.category,
  g.version,
  g.status,
  g.applicable_roles                         AS "applicableRoles",
  g.owner_user_id                            AS "ownerId",
  owner.full_name                            AS "ownerName",
  g.last_reviewed_at                         AS "lastReviewedAt",
  g.next_review_at                           AS "nextReviewAt",
  g.created_at                               AS "createdAt",
  g.updated_at                               AS "updatedAt",
  (SELECT count(*)::int
     FROM users p
    WHERE p.status = 'active'
      AND p.role IN (SELECT jsonb_array_elements_text(g.applicable_roles))
      AND EXISTS (SELECT 1 FROM ethics_acknowledgments a
                   WHERE a.guideline_id = g.id AND a.user_id = p.id AND a.version = g.version))
    AS "acknowledgedCount",
  (SELECT count(*)::int
     FROM users p
    WHERE p.status = 'active'
      AND p.role IN (SELECT jsonb_array_elements_text(g.applicable_roles))
      AND NOT EXISTS (SELECT 1 FROM ethics_acknowledgments a
                       WHERE a.guideline_id = g.id AND a.user_id = p.id AND a.version = g.version))
    AS "pendingCount",
  (SELECT count(*)::int
     FROM users p
    WHERE p.status = 'active'
      AND p.role IN (SELECT jsonb_array_elements_text(g.applicable_roles))
      AND EXISTS (SELECT 1 FROM ethics_acknowledgments a
                   WHERE a.guideline_id = g.id AND a.user_id = p.id AND a.version = g.version
                     AND a.acknowledged_at < now() - make_interval(days => $1::int)))
    AS "overdueCount",
  EXISTS (SELECT 1 FROM ethics_acknowledgments a
           WHERE a.guideline_id = g.id AND a.user_id = $2::uuid AND a.version = g.version)
    AS "iHaveAcknowledged",
  (g.status = 'active'
     AND g.next_review_at IS NOT NULL
     AND g.next_review_at <= now() + interval '30 days') AS "reviewDue"
`;

const ETHICS_FROM = `
  FROM ethics_guidelines g
  LEFT JOIN users owner ON owner.id = g.owner_user_id
`;

/** GET /api/advisor/ethics */
oversightRouter.get(
  "/ethics",
  requireAnyPermission(["ethics.view", "ethics.manage"]),
  asyncHandler(async (req, res) => {
    const intervalDays = await readIntSetting("ethics_acknowledgment_interval_days", 365);

    const { rows } = await query(
      `SELECT ${ETHICS_COLUMNS}
         ${ETHICS_FROM}
        ORDER BY CASE g.status WHEN 'active' THEN 0 WHEN 'under_review' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
                 g.title`,
      [intervalDays, req.user.id]
    );

    res.json({
      guidelines: rows,
      total: rows.length,
      intervalDays,
      needsAttention: rows.filter((row) => row.reviewDue || row.pendingCount > 0 || row.overdueCount > 0)
        .length,
    });
  })
);

const ethicsInput = z.object({
  title: z.string().trim().min(3, "Give the guideline a title").max(200),
  description: z.string().trim().max(4000).optional().default(""),
  category: z.string().trim().max(60).optional().default("general"),
  version: z.string().trim().max(20).optional().default("1.0"),
  applicableRoles: z
    .array(z.enum(["user", "supporter", "therapist", "clinical_advisor", "clinical_supervisor", "collaborative_clinic"]))
    .optional(),
  nextReviewAt: dateOrNull,
});

/** POST /api/advisor/ethics */
oversightRouter.post(
  "/ethics",
  requirePermission("ethics.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const data = parse(ethicsInput, req.body);

    const key =
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || `guideline-${Date.now().toString(36)}`;

    if (await queryOne("SELECT 1 AS taken FROM ethics_guidelines WHERE key = $1", [key])) {
      throw conflict("A guideline with that title already exists");
    }

    const { rows } = await query(
      `INSERT INTO ethics_guidelines
         (key, title, description, category, version, applicable_roles, owner_user_id, next_review_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz)
       RETURNING id`,
      [
        key,
        data.title,
        data.description ?? "",
        data.category ?? "general",
        data.version ?? "1.0",
        JSON.stringify(data.applicableRoles ?? ["therapist", "clinical_advisor"]),
        req.user.id,
        data.nextReviewAt ?? null,
      ]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.ETHICS_UPDATED,
      targetType: "ethics_guideline",
      targetId: rows[0].id,
      detail: { action: "created", title: data.title, version: data.version ?? "1.0" },
    });

    res.status(201).json({ id: rows[0].id });
  })
);

/** PATCH /api/advisor/ethics/:id - a new version re-opens acknowledgment. */
oversightRouter.patch(
  "/ethics/:id",
  requirePermission("ethics.manage"),
  asyncHandler(async (req, res) => {
    checkAdvisor(req);
    const id = uuidParam(req.params.id, "Guideline");
    const current = await queryOne(`SELECT * FROM ethics_guidelines WHERE id = $1`, [id]);
    if (!current) throw notFound("That guideline does not exist");

    const data = parse(ethicsInput.partial(), req.body);

    await query(
      `UPDATE ethics_guidelines
          SET title = $2,
              description = $3,
              category = $4,
              version = $5,
              applicable_roles = $6::jsonb,
              next_review_at = $7::timestamptz,
              last_reviewed_at = CASE WHEN $8::boolean THEN now() ELSE last_reviewed_at END,
              status = COALESCE($9, status)
        WHERE id = $1`,
      [
        id,
        data.title ?? current.title,
        data.description ?? current.description,
        data.category ?? current.category,
        data.version ?? current.version,
        JSON.stringify(data.applicableRoles ?? current.applicable_roles),
        data.nextReviewAt === undefined
          ? current.next_review_at
          : data.nextReviewAt,
        data.version !== undefined && data.version !== current.version,
        data.status ?? null,
      ]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.ETHICS_UPDATED,
      targetType: "ethics_guideline",
      targetId: id,
      detail: { fromVersion: current.version, toVersion: data.version ?? current.version },
    });

    res.json({ ok: true });
  })
);

/**
 * POST /api/advisor/ethics/:id/acknowledge
 *
 * Any practitioner required to accept the code of conduct acknowledges for
 * themselves. There is no route here for one person to acknowledge on behalf
 * of another.
 */
oversightRouter.post(
  "/ethics/:id/acknowledge",
  asyncHandler(async (req, res, next) => {
    const professional = ["supporter", "therapist", "clinical_advisor", "clinical_supervisor", "collaborative_clinic"];
    if (!professional.includes(req.user.role)) {
      return next(forbidden("Only practitioners acknowledge professional guidelines"));
    }

    const id = uuidParam(req.params.id, "Guideline");
    const guideline = await queryOne(
      `SELECT id, title, version, status FROM ethics_guidelines WHERE id = $1`,
      [id]
    );
    if (!guideline) throw notFound("That guideline does not exist");
    if (guideline.status === "archived") throw conflict("This guideline is archived");

    await query(
      `INSERT INTO ethics_acknowledgments (guideline_id, user_id, version)
       VALUES ($1, $2, $3)
       ON CONFLICT (guideline_id, user_id)
       DO UPDATE SET version = EXCLUDED.version, acknowledged_at = now()`,
      [id, req.user.id, guideline.version]
    );

    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: AUDIT_ACTIONS.ETHICS_ACKNOWLEDGED,
      targetType: "ethics_guideline",
      targetId: id,
      detail: { version: guideline.version },
    });

    return res.json({ ok: true, version: guideline.version });
  })
);

/** GET /api/advisor/ethics/:id/acknowledgments - who has, who has not. */
oversightRouter.get(
  "/ethics/:id/acknowledgments",
  requirePermission("ethics.view"),
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, "Guideline");
    const guideline = await queryOne(`SELECT * FROM ethics_guidelines WHERE id = $1`, [id]);
    if (!guideline) throw notFound("That guideline does not exist");

    const intervalDays = await readIntSetting("ethics_acknowledgment_interval_days", 365);

    const { rows } = await query(
      `SELECT u.id,
              u.full_name                       AS "fullName",
              u.role,
              a.version                         AS "acknowledgedVersion",
              a.acknowledged_at                 AS "acknowledgedAt",
              CASE
                WHEN a.user_id IS NULL THEN 'pending'
                WHEN a.version <> $2 THEN 'pending'
                WHEN a.acknowledged_at < now() - make_interval(days => $3::int) THEN 'overdue'
                ELSE 'acknowledged'
              END AS status
         FROM users u
         LEFT JOIN ethics_acknowledgments a
                ON a.user_id = u.id AND a.guideline_id = $1
        WHERE u.status = 'active'
          AND u.role IN (SELECT jsonb_array_elements_text($4::jsonb))
        ORDER BY CASE
                   WHEN a.user_id IS NULL THEN 0
                   WHEN a.version <> $2 THEN 1
                   WHEN a.acknowledged_at < now() - make_interval(days => $3::int) THEN 2
                   ELSE 3
                 END,
                 u.full_name`,
      [id, guideline.version, intervalDays, JSON.stringify(guideline.applicable_roles)]
    );

    res.json({
      guideline: {
        id: guideline.id,
        title: guideline.title,
        version: guideline.version,
        status: guideline.status,
        applicableRoles: guideline.applicable_roles,
      },
      practitioners: rows,
      counts: {
        acknowledged: rows.filter((r) => r.status === "acknowledged").length,
        pending: rows.filter((r) => r.status === "pending").length,
        overdue: rows.filter((r) => r.status === "overdue").length,
      },
      intervalDays,
    });
  })
);

export default oversightRouter;
