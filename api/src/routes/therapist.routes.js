/**
 * Therapist portal API.
 *
 * Everything in here answers to two rules:
 *
 *  1. Only a signed-in therapist gets in (`checkTherapist` on every route).
 *  2. Only clients this therapist actually works with come out
 *     (`assertClient`), so an id taken from a URL can never be used to read
 *     another practitioner's caseload.
 *
 * Nothing here diagnoses anybody. Scores, categories and summaries are read
 * from the assessment tables exactly as the client's own assessment produced
 * them; plans, goals and notes are written by the therapist and stored as
 * written.
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
import { notify } from "../lib/notifications.js";
import { recordEscalation } from "../lib/advisor.js";

export const therapistRouter = Router();

therapistRouter.use(requireAuth);

function checkTherapist(req) {
  if (req.user.role !== "therapist") {
    throw forbidden("Only licensed therapists can access therapist tools");
  }
}

const uuidParam = (value, label) => {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw badRequest(`${label} is not a valid id`);
  return parsed.data;
};

/** `2026-10-05` style date, or null when the field is cleared. */
const dateOrNull = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .nullable()
  .optional();

/**
 * Optional text that normalises an empty value to null.
 *
 * "Not sent" has to stay undefined: a partial update reads `!== undefined` to
 * decide whether a column was part of the request, and collapsing that to null
 * would silently clear every field the caller left out.
 */
const textOrNull = (max = 8000) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

const STATUSES = ["not_started", "in_progress", "completed", "dropped"];

/* ------------------------------------------------------------------ */
/* Caseload scoping                                                    */
/* ------------------------------------------------------------------ */

/**
 * Every client this therapist has any relationship with: a booked session, a
 * message thread, a case row, a plan, a note or a homework task. Read through
 * one constant so every route agrees on who counts as a client.
 */
const CASELOAD_SQL = `
  SELECT DISTINCT client_id FROM (
    SELECT user_id     AS client_id FROM sessions       WHERE therapist_id = $1 AND user_id <> $1
    UNION
    -- Only real clients. A clinical advisor who opened a thread with this
    -- therapist sits in the same table, and must never appear as a caseload
    -- entry.
    SELECT user_id     AS client_id FROM conversations
      WHERE therapist_id = $1 AND user_id <> $1
        AND EXISTS (SELECT 1 FROM users cu WHERE cu.id = conversations.user_id AND cu.role = 'user')
    UNION
    SELECT client_id FROM client_cases                  WHERE therapist_id = $1
    UNION
    SELECT client_id FROM treatment_plans               WHERE therapist_id = $1
    UNION
    SELECT client_id FROM session_notes                 WHERE therapist_id = $1
    UNION
    SELECT client_id FROM homework_items                WHERE therapist_id = $1
  ) members`;

async function caseloadIds(therapistId) {
  const { rows } = await query(CASELOAD_SQL, [therapistId]);
  return rows.map((row) => row.client_id);
}

/**
 * Throws 404 for somebody outside the caseload, for a malformed id and for a
 * user who does not exist - one answer for all three, so a UUID in the URL
 * cannot be probed for existence.
 */
async function assertClient(therapistId, clientId) {
  const id = uuidParam(clientId, "Client");
  const { rows } = await query(
    `SELECT 1 FROM (${CASELOAD_SQL}) members WHERE client_id = $2`,
    [therapistId, id]
  );
  if (!rows.length) throw notFound("That client is not in your caseload");
  return id;
}

/** Same rule, applied to a session id, returning the diary row. */
async function therapistSession(sessionId, therapistId) {
  const id = uuidParam(sessionId, "Session");
  const session = await queryOne(
    `SELECT s.id,
            s.user_id                AS "clientId",
            s.therapist_id           AS "therapistId",
            s.scheduled_at           AS "scheduledAt",
            s.duration_minutes       AS "durationMinutes",
            s.mode,
            s.status,
            s.cancel_reason          AS "cancelReason",
            s.confirmed_at           AS "confirmedAt",
            s.created_at             AS "createdAt",
            s.updated_at             AS "updatedAt",
            client.full_name         AS "clientName",
            therapist.full_name      AS "therapistName"
       FROM sessions s
       JOIN users client    ON client.id = s.user_id
       JOIN users therapist ON therapist.id = s.therapist_id
      WHERE s.id = $1 AND s.therapist_id = $2
      LIMIT 1`,
    [id, therapistId]
  );
  if (!session) throw notFound("Session not found");
  return session;
}

/* ------------------------------------------------------------------ */
/* Calendar / diary                                                    */
/* ------------------------------------------------------------------ */

const SESSION_SELECT = `
  s.id,
  s.user_id                AS "clientId",
  s.therapist_id           AS "therapistId",
  s.scheduled_at           AS "scheduledAt",
  s.duration_minutes       AS "durationMinutes",
  s.mode,
  s.status,
  s.cancel_reason          AS "cancelReason",
  s.confirmed_at           AS "confirmedAt",
  s.created_at             AS "createdAt",
  s.updated_at             AS "updatedAt",
  client.full_name         AS "clientName",
  client_profile.avatar_url AS "clientAvatar",
  note.id                  AS "noteId",
  note.status              AS "noteStatus",
  note.session_date::text  AS "noteSessionDate"
`;

const SESSION_FROM = `
  FROM sessions s
  JOIN users client ON client.id = s.user_id
  LEFT JOIN user_profiles client_profile ON client_profile.user_id = s.user_id
  LEFT JOIN session_notes note ON note.session_id = s.id
`;

/** Floor of today in the API's clock, plus the Monday of the current week. */
function dayBounds(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return {
    todayStart: start.toISOString(),
    todayEnd: end.toISOString(),
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  };
}

/**
 * GET /api/therapist/sessions
 *
 * The therapist's diary. Filterable by status and by an inclusive-from /
 * exclusive-to window, which is what the calendar's day, week and month views
 * all ask for. Notes status rides along so the sessions list can show which
 * bookings still need writing up.
 */
therapistRouter.get(
  "/sessions",
  asyncHandler(async (req, res) => {
    checkTherapist(req);

    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (status && !["scheduled", "completed", "cancelled"].includes(status)) {
      throw badRequest("Unknown session status");
    }

    const params = [req.user.id];
    const filters = ["s.therapist_id = $1"];

    if (status) {
      params.push(status);
      filters.push(`s.status = $${params.length}`);
    }
    if (typeof req.query.from === "string" && req.query.from) {
      params.push(new Date(req.query.from).toISOString());
      filters.push(`s.scheduled_at >= $${params.length}`);
    }
    if (typeof req.query.to === "string" && req.query.to) {
      params.push(new Date(req.query.to).toISOString());
      filters.push(`s.scheduled_at < $${params.length}`);
    }

    const { rows } = await query(
      `SELECT ${SESSION_SELECT}
         ${SESSION_FROM}
        WHERE ${filters.join("\n          AND ")}
        ORDER BY s.scheduled_at ASC`,
      params
    );

    const counts = await query(
      `SELECT s.status, count(*)::int AS total
         FROM sessions s
        WHERE s.therapist_id = $1
        GROUP BY s.status`,
      [req.user.id]
    );

    res.json({
      sessions: rows,
      total: rows.length,
      counts: Object.fromEntries(counts.rows.map((row) => [row.status, row.total])),
    });
  })
);

/**
 * POST /api/therapist/sessions/:id/confirm
 *
 * A booking arrives from the client's side already scheduled; confirming it is
 * the therapist accepting it into the diary. Only a booking that is still
 * scheduled and has not been confirmed yet can be accepted.
 */
therapistRouter.post(
  "/sessions/:id/confirm",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const session = await therapistSession(req.params.id, req.user.id);

    if (session.status !== "scheduled") {
      throw conflict("Only a session that is still scheduled can be confirmed");
    }
    if (session.confirmedAt) {
      throw conflict("This session has already been confirmed");
    }

    await query(`UPDATE sessions SET confirmed_at = now() WHERE id = $1`, [session.id]);

    await notify({
      userId: session.clientId,
      type: "session_updated",
      title: "Session confirmed",
      body: `${req.user.fullName ?? "Your therapist"} accepted your session request.`,
      link: "/portal/user/support",
      data: { sessionId: session.id },
      key: `session-confirmed:${session.id}`,
    });

    const updated = await therapistSession(session.id, req.user.id);
    res.json({ session: updated });
  })
);

/* ------------------------------------------------------------------ */
/* Session notes                                                       */
/* ------------------------------------------------------------------ */

const NOTE_FIELDS = {
  sessionNumber: z.coerce.number().int().min(1, "Session numbers start at 1").max(9999).nullable().optional(),
  sessionType: textOrNull(120),
  presentation: textOrNull(),
  discussion: textOrNull(),
  interventions: textOrNull(),
  clientResponse: textOrNull(),
  progressNotes: textOrNull(),
  homework: textOrNull(),
  nextSessionPlan: textOrNull(),
  privateNotes: textOrNull(),
  clientSummary: textOrNull(2000),
};

const noteSchema = z.object({
  status: z.enum(["draft", "final"]).default("draft"),
  sessionDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
    .optional(),
  sharedWithClient: z.boolean().optional().default(false),
  ...NOTE_FIELDS,
});

/** GET /api/therapist/sessions/:id/notes - the write-up for one booking. */
therapistRouter.get(
  "/sessions/:id/notes",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const session = await therapistSession(req.params.id, req.user.id);

    const note = await queryOne(
      `SELECT id,
              session_id             AS "sessionId",
              client_id              AS "clientId",
              status,
              session_date::text     AS "sessionDate",
              session_number         AS "sessionNumber",
              session_type           AS "sessionType",
              presentation,
              discussion,
              interventions,
              client_response        AS "clientResponse",
              progress_notes         AS "progressNotes",
              homework,
              next_session_plan      AS "nextSessionPlan",
              private_notes          AS "privateNotes",
              client_summary         AS "clientSummary",
              shared_with_client     AS "sharedWithClient",
              created_at             AS "createdAt",
              updated_at             AS "updatedAt"
         FROM session_notes
        WHERE session_id = $1 AND therapist_id = $2
        LIMIT 1`,
      [session.id, req.user.id]
    );

    const sessionNumber = await queryOne(
      `SELECT count(*)::int + 1 AS total
         FROM sessions
        WHERE therapist_id = $1 AND user_id = $2 AND scheduled_at <= $3`,
      [req.user.id, session.clientId, session.scheduledAt]
    );

    res.json({
      session: { ...session, noteId: note?.id ?? null },
      note: note ?? null,
      suggestedSessionNumber: sessionNumber?.total ?? 1,
    });
  })
);

/**
 * PUT /api/therapist/sessions/:id/notes - save a draft or finish the note.
 *
 * Upserted on (session_id, therapist_id): writing twice updates the same
 * record rather than stacking duplicates. A `final` note is the signed
 * clinical record; a `draft` is still being written.
 */
therapistRouter.put(
  "/sessions/:id/notes",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const session = await therapistSession(req.params.id, req.user.id);
    const data = parse(noteSchema, req.body ?? {});

    const values = {
      status: data.status,
      sessionDate: data.sessionDate ?? new Date().toISOString().slice(0, 10),
      sessionNumber: data.sessionNumber ?? null,
      ...Object.fromEntries(Object.keys(NOTE_FIELDS).map((key) => [key, data[key] ?? null])),
      sharedWithClient: data.sharedWithClient,
    };

    const note = await queryOne(
      `INSERT INTO session_notes (
         session_id, therapist_id, client_id, status, session_date, session_number,
         session_type, presentation, discussion, interventions, client_response,
         progress_notes, homework, next_session_plan, private_notes, client_summary,
         shared_with_client
       ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (session_id) DO UPDATE SET
         status            = EXCLUDED.status,
         session_date      = EXCLUDED.session_date,
         session_number    = EXCLUDED.session_number,
         session_type      = EXCLUDED.session_type,
         presentation      = EXCLUDED.presentation,
         discussion        = EXCLUDED.discussion,
         interventions     = EXCLUDED.interventions,
         client_response   = EXCLUDED.client_response,
         progress_notes    = EXCLUDED.progress_notes,
         homework          = EXCLUDED.homework,
         next_session_plan = EXCLUDED.next_session_plan,
         private_notes     = EXCLUDED.private_notes,
         client_summary    = EXCLUDED.client_summary,
         shared_with_client = EXCLUDED.shared_with_client,
         updated_at        = now()
       RETURNING id,
                 session_id         AS "sessionId",
                 status,
                 session_date::text AS "sessionDate",
                 session_number     AS "sessionNumber",
                 updated_at         AS "updatedAt"`,
      [
        session.id,
        req.user.id,
        session.clientId,
        values.status,
        values.sessionDate,
        values.sessionNumber,
        values.sessionType,
        values.presentation,
        values.discussion,
        values.interventions,
        values.clientResponse,
        values.progressNotes,
        values.homework,
        values.nextSessionPlan,
        values.privateNotes,
        values.clientSummary,
        values.sharedWithClient,
      ]
    );

    res.json({ note, message: values.status === "final" ? "Session note saved" : "Draft saved" });
  })
);

/* ------------------------------------------------------------------ */
/* Homework                                                            */
/* ------------------------------------------------------------------ */

const homeworkSchema = z.object({
  clientId: z.string().uuid("Choose a client"),
  sessionId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2, "Give the task a title").max(200),
  details: textOrNull(2000),
  dueDate: dateOrNull,
  status: z.enum(["assigned", "in_progress", "completed", "skipped"]).optional(),
});

const HOMEWORK_SELECT = `
  h.id,
  h.client_id              AS "clientId",
  h.session_id             AS "sessionId",
  h.title,
  h.details,
  h.status,
  h.due_date::text         AS "dueDate",
  h.completed_at           AS "completedAt",
  h.created_at             AS "createdAt",
  client.full_name         AS "clientName"
    FROM homework_items h
    JOIN users client ON client.id = h.client_id
`;

therapistRouter.get(
  "/homework",
  asyncHandler(async (req, res) => {
    checkTherapist(req);

    const params = [req.user.id];
    let clientClause = "";
    if (typeof req.query.clientId === "string" && req.query.clientId) {
      const clientId = await assertClient(req.user.id, req.query.clientId);
      params.push(clientId);
      clientClause = `AND h.client_id = $${params.length}`;
    }

    const { rows } = await query(
      `SELECT ${HOMEWORK_SELECT}
        WHERE h.therapist_id = $1 ${clientClause}
        ORDER BY h.created_at DESC
        LIMIT 200`,
      params
    );

    res.json({ homework: rows, total: rows.length });
  })
);

therapistRouter.post(
  "/homework",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const data = parse(homeworkSchema, req.body);
    const clientId = await assertClient(req.user.id, data.clientId);

    if (data.sessionId) await therapistSession(data.sessionId, req.user.id);

    const { rows } = await query(
      `INSERT INTO homework_items (therapist_id, client_id, session_id, title, details, due_date)
       VALUES ($1, $2, $3, $4, $5, $6::date)
       RETURNING id`,
      [req.user.id, clientId, data.sessionId ?? null, data.title, data.details ?? null, data.dueDate ?? null]
    );

    const created = await queryOne(
      `SELECT ${HOMEWORK_SELECT} WHERE h.id = $2 AND h.therapist_id = $1`,
      [req.user.id, rows[0].id]
    );
    res.status(201).json({ homework: created });
  })
);

therapistRouter.patch(
  "/homework/:id",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const id = uuidParam(req.params.id, "Homework");

    const existing = await queryOne(
      `SELECT id, title, status, client_id AS "clientId"
         FROM homework_items WHERE id = $1 AND therapist_id = $2`,
      [id, req.user.id]
    );
    if (!existing) throw notFound("That homework task was not found");

    const data = parse(
      z.object({
        title: z.string().trim().min(2).max(200).optional(),
        details: textOrNull(2000),
        dueDate: dateOrNull,
        status: z.enum(["assigned", "in_progress", "completed", "skipped"]).optional(),
      }),
      req.body ?? {}
    );

    const becameCompleted = data.status === "completed" && existing.status !== "completed";

    await query(
      `UPDATE homework_items
          SET title       = COALESCE($3, title),
              details     = CASE WHEN $4::boolean THEN $5 ELSE details END,
              due_date    = CASE WHEN $6::boolean THEN $7::date ELSE due_date END,
              status      = COALESCE($8, status),
              completed_at = CASE
                               WHEN $8 = 'completed' THEN COALESCE(completed_at, now())
                               WHEN $8 IS NULL THEN completed_at
                               ELSE NULL
                             END
        WHERE id = $1 AND therapist_id = $2`,
      [
        id,
        req.user.id,
        data.title ?? null,
        data.details !== undefined,
        data.details ?? null,
        data.dueDate !== undefined,
        data.dueDate ?? null,
        data.status ?? null,
      ]
    );

    if (becameCompleted) {
      await notify({
        userId: req.user.id,
        type: "homework_completed",
        title: "Homework completed",
        body: `${existing.title} was marked as completed.`,
        link: "/portal/therapist/progress",
        data: { homeworkId: id },
        key: `homework:${id}`,
      });
    }

    const updated = await queryOne(
      `SELECT ${HOMEWORK_SELECT} WHERE h.id = $2 AND h.therapist_id = $1`,
      [req.user.id, id]
    );
    res.json({ homework: updated });
  })
);

/* ------------------------------------------------------------------ */
/* Clients                                                             */
/* ------------------------------------------------------------------ */

const PROGRESS_BANDS = {
  none: { min: null, max: null, isEmpty: true },
  early: { min: 1, max: 49 },
  building: { min: 50, max: 79 },
  on_track: { min: 80, max: 100 },
};

/**
 * GET /api/therapist/clients
 *
 * The caseload with everything the list view needs in one round trip: last
 * and next session, latest assessment, plan progress and a recency stamp for
 * sorting. All of it is derived from rows that already exist - nothing on
 * this endpoint is invented.
 */
therapistRouter.get(
  "/clients",
  asyncHandler(async (req, res) => {
    checkTherapist(req);

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort.trim() : "recent";
    const progress = typeof req.query.progress === "string" ? req.query.progress.trim() : "";

    if (status && !["active", "paused", "completed", "archived"].includes(status)) {
      throw badRequest("Unknown therapy status");
    }
    if (sort && !["recent", "name", "next_session"].includes(sort)) {
      throw badRequest("Unknown sort order");
    }
    if (progress && !(progress in PROGRESS_BANDS)) {
      throw badRequest("Unknown progress filter");
    }

    const params = [req.user.id];
    const where = [];

    if (search) {
      params.push(search);
      where.push(`u.full_name ILIKE '%' || $${params.length} || '%'`);
    }
    if (status) {
      params.push(status);
      where.push(`COALESCE(cc.status, 'active') = $${params.length}`);
    }

    const band = PROGRESS_BANDS[progress];
    if (band?.isEmpty) {
      where.push(`COALESCE(g.progress, 0) = 0`);
    } else if (band) {
      params.push(band.min, band.max);
      where.push(`COALESCE(g.progress, 0) BETWEEN $${params.length - 1} AND $${params.length}`);
    }

    const orderBy = {
      recent: `"lastActivity" DESC NULLS LAST, u.full_name ASC`,
      name: `u.full_name ASC`,
      next_session: `"nextSessionAt" ASC NULLS LAST, u.full_name ASC`,
    }[sort];

    const { rows } = await query(
      `WITH members AS (${CASELOAD_SQL})
       SELECT u.id,
              u.full_name                       AS "fullName",
              p.avatar_url                      AS "avatarUrl",
              p.preferred_language              AS "preferredLanguage",
              COALESCE(cc.status, 'active')     AS "status",
              cc.opened_at                      AS "openedAt",
              concern.primary_issue_key         AS "concernKey",
              concern.summary                   AS "concernSummary",
              (SELECT s.scheduled_at
                 FROM sessions s
                WHERE s.therapist_id = $1 AND s.user_id = u.id
                  AND s.status = 'scheduled' AND s.scheduled_at >= now()
                ORDER BY s.scheduled_at ASC LIMIT 1)                AS "nextSessionAt",
              (SELECT s.scheduled_at
                 FROM sessions s
                WHERE s.therapist_id = $1 AND s.user_id = u.id
                  AND s.scheduled_at <= now()
                ORDER BY s.scheduled_at DESC LIMIT 1)               AS "lastSessionAt",
              (SELECT s.status
                 FROM sessions s
                WHERE s.therapist_id = $1 AND s.user_id = u.id
                ORDER BY s.scheduled_at DESC LIMIT 1)               AS "lastSessionStatus",
              (SELECT a.status
                 FROM assessments a
                WHERE a.user_id = u.id
                ORDER BY a.created_at DESC LIMIT 1)                 AS "assessmentStatus",
              (SELECT r.reviewed_at
                 FROM assessment_results r
                WHERE r.user_id = u.id
                ORDER BY r.created_at DESC LIMIT 1)                 AS "lastReviewedAt",
              (SELECT round(avg(gg.progress_percent))::int
                 FROM treatment_goals gg
                 JOIN treatment_plans tp ON tp.id = gg.plan_id
                WHERE tp.therapist_id = $1 AND tp.client_id = u.id
                  AND tp.status IN ('draft', 'active'))             AS "progressPercent",
              (SELECT count(*)::int
                 FROM treatment_plans tp
                WHERE tp.therapist_id = $1 AND tp.client_id = u.id
                  AND tp.status = 'active')                         AS "activePlans",
              GREATEST(
                (SELECT max(s.scheduled_at) FROM sessions s
                  WHERE s.therapist_id = $1 AND s.user_id = u.id),
                (SELECT max(m.created_at) FROM messages m
                  JOIN conversations c ON c.id = m.conversation_id
                 WHERE c.therapist_id = $1 AND m.sender_id = u.id),
                (SELECT max(tp.updated_at) FROM treatment_plans tp
                  WHERE tp.therapist_id = $1 AND tp.client_id = u.id),
                (SELECT max(h.updated_at) FROM homework_items h
                  WHERE h.therapist_id = $1 AND h.client_id = u.id),
                cc.updated_at
              )                                                     AS "lastActivity"
         FROM members m
         JOIN users u ON u.id = m.client_id
         LEFT JOIN user_profiles p ON p.user_id = u.id
         LEFT JOIN client_cases cc ON cc.therapist_id = $1 AND cc.client_id = u.id
         LEFT JOIN LATERAL (
           SELECT primary_issue_key, summary
             FROM user_current_concerns
            WHERE user_id = u.id
            ORDER BY created_at DESC LIMIT 1
         ) concern ON true
         LEFT JOIN LATERAL (
           SELECT round(avg(gg.progress_percent))::int AS progress
             FROM treatment_goals gg
             JOIN treatment_plans tp ON tp.id = gg.plan_id
            WHERE tp.therapist_id = $1 AND tp.client_id = u.id
              AND tp.status IN ('draft', 'active')
         ) g ON true
        WHERE ${where.length ? where.join("\n          AND ") : "TRUE"}
        ORDER BY ${orderBy}`,
      params
    );

    res.json({ clients: rows, total: rows.length });
  })
);

/** The events feed, scoped to a therapist (and optionally to one client). */
async function activityFeed(therapistId, clientIds, limit = 10) {
  if (!clientIds.length) return [];

  const { rows } = await query(
    `SELECT * FROM (
       SELECT 'assessment'  AS type,
              u.full_name || ' completed an assessment' AS title,
              a.user_id     AS "clientId",
              u.full_name   AS "clientName",
              a.completed_at AS at,
              '/portal/therapist/assessments' AS link
         FROM assessments a
         JOIN users u ON u.id = a.user_id
        WHERE a.user_id = ANY($2::uuid[]) AND a.status = 'completed'

       UNION ALL
       SELECT 'message',
              u.full_name || ' sent you a message',
              m.sender_id,
              u.full_name,
              m.created_at,
              '/portal/therapist/messages'
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id AND c.therapist_id = $1
         JOIN users u ON u.id = m.sender_id
        WHERE m.sender_id = ANY($2::uuid[])

       UNION ALL
       SELECT 'appointment_request',
              u.full_name || ' requested an appointment',
              s.user_id,
              u.full_name,
              s.created_at,
              '/portal/therapist/calendar'
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.therapist_id = $1 AND s.confirmed_at IS NULL AND s.status = 'scheduled'

       UNION ALL
       SELECT 'session',
              'Session with ' || u.full_name || ' was completed',
              s.user_id,
              u.full_name,
              s.updated_at,
              '/portal/therapist/sessions'
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.therapist_id = $1 AND s.status = 'completed'

       UNION ALL
       SELECT 'homework',
              u.full_name || ' completed homework: ' || h.title,
              h.client_id,
              u.full_name,
              COALESCE(h.completed_at, h.updated_at),
              '/portal/therapist/progress'
         FROM homework_items h
         JOIN users u ON u.id = h.client_id
        WHERE h.therapist_id = $1 AND h.status = 'completed'

       UNION ALL
       SELECT 'treatment_plan',
              'Treatment plan updated for ' || u.full_name,
              tp.client_id,
              u.full_name,
              tp.updated_at,
              '/portal/therapist/treatment-plans'
         FROM treatment_plans tp
         JOIN users u ON u.id = tp.client_id
        WHERE tp.therapist_id = $1
     ) events
     WHERE "clientId" = ANY($2::uuid[])
     ORDER BY at DESC NULLS LAST
     LIMIT $3`,
    [therapistId, clientIds, limit]
  );

  return rows;
}

/**
 * GET /api/therapist/clients/:id
 *
 * One client's workspace: profile, concern, plan, assessments, diary and the
 * activity feed. Contact details a therapist has no business seeing (address,
 * emergency contact, DOB of a person they have not yet worked with) are never
 * selected here.
 */
therapistRouter.get(
  "/clients/:id",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const clientId = await assertClient(req.user.id, req.params.id);

    const [client, stats, initialResult, latestResult, plan, sessions, activity, homework, conversation] =
      await Promise.all([
        queryOne(
          `SELECT u.id,
                  u.full_name            AS "fullName",
                  u.email,
                  u.created_at           AS "joinedAt",
                  p.avatar_url           AS "avatarUrl",
                  p.preferred_language   AS "preferredLanguage",
                  p.current_support_status AS "supportStatus",
                  p.consented_to_data_sharing AS "consentedToDataSharing",
                  p.what_brought_you_here AS "whatBroughtYouHere",
                  COALESCE(cc.status, 'active') AS "therapyStatus",
                  concern.primary_issue_key AS "concernKey",
                  concern.secondary_issues  AS "concernSecondary",
                  concern.user_description  AS "concernDescription",
                  concern.summary           AS "concernSummary",
                  concern.created_at        AS "concernAt",
                  concern.is_high_risk      AS "isHighRisk"
             FROM users u
             LEFT JOIN user_profiles p ON p.user_id = u.id
             LEFT JOIN client_cases cc ON cc.therapist_id = $2 AND cc.client_id = u.id
             LEFT JOIN LATERAL (
               SELECT primary_issue_key, secondary_issues, user_description, summary,
                      is_high_risk, created_at
                 FROM user_current_concerns
                WHERE user_id = u.id
                ORDER BY created_at DESC LIMIT 1
             ) concern ON true
            WHERE u.id = $1`,
          [clientId, req.user.id]
        ),
        queryOne(
          `SELECT (SELECT count(*)::int FROM sessions
                    WHERE therapist_id = $2 AND user_id = $1)                        AS "totalSessions",
                  (SELECT count(*)::int FROM sessions
                    WHERE therapist_id = $2 AND user_id = $1 AND status = 'completed') AS "completedSessions",
                  (SELECT count(*)::int FROM sessions
                    WHERE therapist_id = $2 AND user_id = $1 AND status = 'cancelled') AS "cancelledSessions",
                  (SELECT max(scheduled_at) FROM sessions
                    WHERE therapist_id = $2 AND user_id = $1 AND scheduled_at <= now()) AS "lastSessionAt",
                  (SELECT min(scheduled_at) FROM sessions
                    WHERE therapist_id = $2 AND user_id = $1
                      AND status = 'scheduled' AND scheduled_at >= now())             AS "nextSessionAt",
                  (SELECT count(*)::int FROM session_notes
                    WHERE therapist_id = $2 AND client_id = $1 AND status = 'final')  AS "notesFinal",
                  (SELECT count(*)::int FROM session_notes
                    WHERE therapist_id = $2 AND client_id = $1)                       AS "notesTotal",
                  (SELECT count(*)::int FROM homework_items
                    WHERE therapist_id = $2 AND client_id = $1)                       AS "homeworkTotal",
                  (SELECT count(*)::int FROM homework_items
                    WHERE therapist_id = $2 AND client_id = $1 AND status = 'completed') AS "homeworkCompleted",
                  (SELECT count(*)::int FROM assessments
                    WHERE user_id = $1 AND status = 'in_progress')                    AS "assessmentsInProgress"`,
          [clientId, req.user.id]
        ),
        queryOne(
          `SELECT r.id,
                  r.assessment_id          AS "assessmentId",
                  r.primary_issue_key      AS "primaryIssueKey",
                  r.secondary_issues       AS "secondaryIssues",
                  r.scores,
                  r.summary,
                  r.source,
                  r.is_high_risk           AS "isHighRisk",
                  r.reviewed_at            AS "reviewedAt",
                  a.completed_at           AS "completedAt",
                  a.type,
                  COALESCE(s.total, 0)     AS "totalScore",
                  COALESCE(s.scored, 0)    AS "scored",
                  CASE WHEN COALESCE(s.scored, 0) > 0
                       THEN round((s.total::numeric / (s.scored * 5)) * 100)::int
                       ELSE NULL END       AS "percent"
             FROM assessment_results r
             JOIN assessments a ON a.id = r.assessment_id
             LEFT JOIN LATERAL (
               SELECT sum(score) AS total, count(score) AS scored
                 FROM assessment_answers
                WHERE assessment_id = a.id AND score IS NOT NULL
             ) s ON true
            WHERE r.user_id = $1
            ORDER BY a.completed_at ASC NULLS LAST
            LIMIT 1`,
          [clientId]
        ),
        queryOne(
          `SELECT r.id,
                  r.assessment_id          AS "assessmentId",
                  r.primary_issue_key      AS "primaryIssueKey",
                  r.secondary_issues       AS "secondaryIssues",
                  r.scores,
                  r.summary,
                  r.source,
                  r.is_high_risk           AS "isHighRisk",
                  r.reviewed_at            AS "reviewedAt",
                  a.completed_at           AS "completedAt",
                  a.type,
                  COALESCE(s.total, 0)     AS "totalScore",
                  COALESCE(s.scored, 0)    AS "scored",
                  CASE WHEN COALESCE(s.scored, 0) > 0
                       THEN round((s.total::numeric / (s.scored * 5)) * 100)::int
                       ELSE NULL END       AS "percent"
             FROM assessment_results r
             JOIN assessments a ON a.id = r.assessment_id
             LEFT JOIN LATERAL (
               SELECT sum(score) AS total, count(score) AS scored
                 FROM assessment_answers
                WHERE assessment_id = a.id AND score IS NOT NULL
             ) s ON true
            WHERE r.user_id = $1
            ORDER BY a.completed_at DESC NULLS LAST
            LIMIT 1`,
          [clientId]
        ),
        queryOne(
          `SELECT tp.id,
                  tp.title,
                  tp.summary,
                  tp.status,
                  tp.start_date::text  AS "startDate",
                  tp.target_date::text AS "targetDate",
                  tp.created_at        AS "createdAt",
                  tp.updated_at        AS "updatedAt"
             FROM treatment_plans tp
            WHERE tp.therapist_id = $1 AND tp.client_id = $2
            ORDER BY CASE tp.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
                     tp.updated_at DESC
            LIMIT 1`,
          [req.user.id, clientId]
        ),
        query(
          `SELECT ${SESSION_SELECT}
             ${SESSION_FROM}
            WHERE s.therapist_id = $1 AND s.user_id = $2
            ORDER BY s.scheduled_at DESC
            LIMIT 6`,
          [req.user.id, clientId]
        ),
        activityFeed(req.user.id, [clientId], 12),
        query(
          `SELECT ${HOMEWORK_SELECT}
            WHERE h.therapist_id = $1 AND h.client_id = $2
            ORDER BY h.created_at DESC
            LIMIT 10`,
          [req.user.id, clientId]
        ),
        queryOne(
          `SELECT id FROM conversations
            WHERE therapist_id = $1 AND user_id = $2
            LIMIT 1`,
          [req.user.id, clientId]
        ),
      ]);

    let goals = [];
    if (plan) {
      const { rows } = await query(
        `SELECT g.id,
                g.title,
                g.notes,
                g.status,
                g.target_date::text      AS "targetDate",
                g.progress_percent       AS "progressPercent",
                g.position,
                COALESCE(
                  (SELECT json_agg(json_build_object(
                     'id', o.id,
                     'title', o.title,
                     'interventions', o.interventions,
                     'status', o.status,
                     'targetDate', to_char(o.target_date, 'YYYY-MM-DD'),
                     'position', o.position
                   ) ORDER BY o.position)
                     FROM treatment_objectives o WHERE o.goal_id = g.id),
                  '[]'::json
                ) AS objectives
           FROM treatment_goals g
          WHERE g.plan_id = $1
          ORDER BY g.position, g.created_at`,
        [plan.id]
      );
      goals = rows;
    }

    res.json({
      client,
      stats,
      initialAssessment: initialResult,
      latestAssessment: latestResult,
      plan: plan ? { ...plan, goals } : null,
      sessions: sessions.rows,
      activity,
      homework: homework.rows,
      conversationId: conversation?.id ?? null,
    });
  })
);

/** PATCH /api/therapist/clients/:id - set the therapy status of a client. */
therapistRouter.patch(
  "/clients/:id",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const clientId = await assertClient(req.user.id, req.params.id);

    const { status } = parse(
      z.object({ status: z.enum(["active", "paused", "completed", "archived"]) }),
      req.body
    );

    const { rows } = await query(
      `INSERT INTO client_cases (therapist_id, client_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (therapist_id, client_id) DO UPDATE
         SET status = EXCLUDED.status,
             closed_at = CASE WHEN EXCLUDED.status IN ('completed', 'archived') THEN now() ELSE NULL END,
             updated_at = now()
       RETURNING status`,
      [req.user.id, clientId, status]
    );

    res.json({ status: rows[0].status });
  })
);

/* ------------------------------------------------------------------ */
/* Assessments                                                         */
/* ------------------------------------------------------------------ */

/**
 * One query, three callers: the caseload list, the client workspace and the
 * cross-caseload assessments screen. `scored` counts the answers that carry a
 * score, so `total / (scored * 5)` is an honest percentage of what was
 * actually answered.
 */
const ASSESSMENT_SELECT = `
  a.id,
  a.user_id                AS "clientId",
  client.full_name         AS "clientName",
  a.type,
  a.status,
  a.started_at             AS "startedAt",
  a.completed_at           AS "completedAt",
  r.primary_issue_key      AS "primaryIssueKey",
  r.secondary_issues       AS "secondaryIssues",
  r.scores,
  r.summary,
  r.source,
  r.is_high_risk           AS "isHighRisk",
  r.safety_message         AS "safetyMessage",
  r.reviewed_at            AS "reviewedAt",
  COALESCE(s.total, 0)     AS "totalScore",
  COALESCE(s.scored, 0)    AS "scored",
  CASE WHEN COALESCE(s.scored, 0) > 0
       THEN round((s.total::numeric / (s.scored * 5)) * 100)::int
       ELSE NULL END       AS "percent"
`;

const ASSESSMENT_FROM = `
  FROM assessments a
  JOIN users client ON client.id = a.user_id
  LEFT JOIN assessment_results r ON r.assessment_id = a.id
  LEFT JOIN LATERAL (
    SELECT sum(score) AS total, count(score) AS scored
      FROM assessment_answers
     WHERE assessment_id = a.id AND score IS NOT NULL
  ) s ON true
`;

async function assessmentList(therapistId, { clientId = null, status = null, limit = 100 } = {}) {
  const params = [];

  let scope;
  if (clientId) {
    params.push(clientId);
    scope = `a.user_id = $${params.length}`;
  } else {
    // The caseload subquery expects the therapist id bound as $1, so it goes
    // in first - and only when it is actually referenced. PostgreSQL cannot
    // type a parameter that never appears in the statement.
    params.push(therapistId);
    scope = `a.user_id IN (SELECT client_id FROM (${CASELOAD_SQL}) members)`;
  }

  if (status) {
    params.push(status);
    scope += ` AND a.status = $${params.length}`;
  }
  params.push(limit);

  const { rows } = await query(
    `SELECT ${ASSESSMENT_SELECT}
       ${ASSESSMENT_FROM}
      WHERE ${scope}
      ORDER BY COALESCE(a.completed_at, a.started_at) DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

/** GET /api/therapist/assessments - every assessment across the caseload. */
therapistRouter.get(
  "/assessments",
  asyncHandler(async (req, res) => {
    checkTherapist(req);

    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (status && !["in_progress", "completed", "abandoned"].includes(status)) {
      throw badRequest("Unknown assessment status");
    }

    let clientId = null;
    if (typeof req.query.clientId === "string" && req.query.clientId) {
      clientId = await assertClient(req.user.id, req.query.clientId);
    }

    const rows = await assessmentList(req.user.id, {
      clientId,
      status: status || null,
      limit: 200,
    });

    const pending = rows.filter((row) => row.status === "completed" && !row.reviewedAt).length;

    res.json({ assessments: rows, total: rows.length, pending });
  })
);

/** GET /api/therapist/clients/:id/assessments - one client's history. */
therapistRouter.get(
  "/clients/:id/assessments",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const clientId = await assertClient(req.user.id, req.params.id);
    const rows = await assessmentList(req.user.id, { clientId, limit: 100 });
    res.json({ assessments: rows, total: rows.length });
  })
);

/**
 * GET /api/therapist/assessments/:id
 *
 * The full result: the answers as scored, the categorisation, and the previous
 * sitting so the two can be compared side by side. Marked reviewed by the
 * explicit POST below, never as a side effect of a read that may fail.
 */
therapistRouter.get(
  "/assessments/:id",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const assessmentId = uuidParam(req.params.id, "Assessment");

    const head = await queryOne(
      `SELECT user_id AS "clientId" FROM assessments WHERE id = $1`,
      [assessmentId]
    );
    if (!head) throw notFound("Assessment not found");
    await assertClient(req.user.id, head.clientId);

    const [assessment, answers, history] = await Promise.all([
      queryOne(
        `SELECT ${ASSESSMENT_SELECT}
           ${ASSESSMENT_FROM}
          WHERE a.id = $2 AND a.user_id IN (SELECT client_id FROM (${CASELOAD_SQL}) members)`,
        [req.user.id, assessmentId]
      ),
      query(
        `SELECT an.question_id          AS "questionId",
                q.prompt,
                q.test_number           AS "testNumber",
                q.position,
                q.category,
                q.question_type         AS "questionType",
                an.answer_value         AS "answerValue",
                an.answer_text          AS "answerText",
                an.score
           FROM assessment_answers an
           JOIN assessment_questions q ON q.id = an.question_id
          WHERE an.assessment_id = $1
          ORDER BY q.test_number, q.position`,
        [assessmentId]
      ),
      assessmentList(req.user.id, { clientId: head.clientId, status: "completed", limit: 20 }),
    ]);

    if (!assessment) throw notFound("Assessment not found");

    const ordered = [...history].reverse();
    const index = ordered.findIndex((row) => row.id === assessmentId);
    const previous = index > 0 ? ordered[index - 1] : null;

    res.json({ assessment, answers: answers.rows, previous });
  })
);

/** POST /api/therapist/assessments/:id/review - clear it from the queue. */
therapistRouter.post(
  "/assessments/:id/review",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const assessmentId = uuidParam(req.params.id, "Assessment");

    const head = await queryOne(`SELECT user_id AS "clientId" FROM assessments WHERE id = $1`, [
      assessmentId,
    ]);
    if (!head) throw notFound("Assessment not found");
    await assertClient(req.user.id, head.clientId);

    await query(
      `UPDATE assessment_results
          SET reviewed_at = COALESCE(reviewed_at, now())
        WHERE assessment_id = $1`,
      [assessmentId]
    );

    res.json({ ok: true, reviewedAt: new Date().toISOString() });
  })
);

/* ------------------------------------------------------------------ */
/* Treatment plans                                                     */
/* ------------------------------------------------------------------ */

const objectiveSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2, "Give the objective a title").max(300),
  interventions: z
    .array(z.string().trim().min(1).max(160))
    .max(25)
    .default([]),
  status: z.enum(STATUSES).default("not_started"),
  targetDate: dateOrNull,
});

const goalSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2, "Give the goal a title").max(300),
  notes: textOrNull(4000),
  status: z.enum(STATUSES).default("in_progress"),
  targetDate: dateOrNull,
  progressPercent: z.coerce.number().int().min(0).max(100).default(0),
  objectives: z.array(objectiveSchema).max(40).default([]),
});

const planHeaderSchema = z.object({
  clientId: z.string().uuid("Choose a client").optional(),
  title: z.string().trim().min(2, "Give the plan a title").max(200).optional(),
  summary: textOrNull(4000),
  status: z.enum(["draft", "active", "completed", "archived"]).optional(),
  startDate: dateOrNull,
  targetDate: dateOrNull,
});

const PLAN_COLUMNS = `
  tp.id,
  tp.client_id              AS "clientId",
  client.full_name          AS "clientName",
  tp.title,
  tp.summary,
  tp.status,
  tp.start_date::text       AS "startDate",
  tp.target_date::text      AS "targetDate",
  tp.created_at             AS "createdAt",
  tp.updated_at             AS "updatedAt",
  (SELECT count(*)::int FROM treatment_goals g WHERE g.plan_id = tp.id) AS "goalCount",
  (SELECT count(*)::int FROM treatment_goals g
    WHERE g.plan_id = tp.id AND g.status = 'completed')                AS "goalsCompleted",
  (SELECT round(avg(g.progress_percent))::int FROM treatment_goals g
    WHERE g.plan_id = tp.id)                                           AS "progressPercent"
`;

async function loadPlan(planId, therapistId) {
  const id = uuidParam(planId, "Treatment plan");
  const plan = await queryOne(
    `SELECT ${PLAN_COLUMNS}
       FROM treatment_plans tp
       JOIN users client ON client.id = tp.client_id
      WHERE tp.id = $1 AND tp.therapist_id = $2
      LIMIT 1`,
    [id, therapistId]
  );
  if (!plan) throw notFound("Treatment plan not found");
  return plan;
}

async function goalsFor(planId) {
  const { rows } = await query(
    `SELECT g.id,
            g.title,
            g.notes,
            g.status,
            g.target_date::text  AS "targetDate",
            g.progress_percent   AS "progressPercent",
            g.position,
            COALESCE(
              (SELECT json_agg(json_build_object(
                 'id', o.id,
                 'title', o.title,
                 'interventions', o.interventions,
                 'status', o.status,
                 'targetDate', to_char(o.target_date, 'YYYY-MM-DD'),
                 'position', o.position
               ) ORDER BY o.position)
                 FROM treatment_objectives o WHERE o.goal_id = g.id),
              '[]'::json
            ) AS objectives
       FROM treatment_goals g
      WHERE g.plan_id = $1
      ORDER BY g.position, g.created_at`,
    [planId]
  );
  return rows;
}

/** GET /api/therapist/treatment-plans?clientId= */
therapistRouter.get(
  "/treatment-plans",
  asyncHandler(async (req, res) => {
    checkTherapist(req);

    const params = [req.user.id];
    let scope = "tp.therapist_id = $1";
    if (typeof req.query.clientId === "string" && req.query.clientId) {
      const clientId = await assertClient(req.user.id, req.query.clientId);
      params.push(clientId);
      scope += ` AND tp.client_id = $${params.length}`;
    }
    if (typeof req.query.status === "string" && req.query.status) {
      params.push(req.query.status);
      scope += ` AND tp.status = $${params.length}`;
    }

    const { rows } = await query(
      `SELECT ${PLAN_COLUMNS}
         FROM treatment_plans tp
         JOIN users client ON client.id = tp.client_id
        WHERE ${scope}
        ORDER BY tp.updated_at DESC`,
      params
    );

    res.json({ plans: rows, total: rows.length });
  })
);

/**
 * POST /api/therapist/treatment-plans
 *
 * The plan, its goals and their objectives are written in one transaction. The
 * therapist supplies every word; nothing here is generated.
 */
therapistRouter.post(
  "/treatment-plans",
  asyncHandler(async (req, res) => {
    checkTherapist(req);

    const data = parse(
      planHeaderSchema.extend({ goals: z.array(goalSchema).max(25).default([]) }),
      req.body
    );
    if (!data.clientId) throw badRequest("Choose a client for this plan");
    if (!data.title) throw badRequest("Give the plan a title");

    const clientId = await assertClient(req.user.id, data.clientId);

    const planId = await transaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO treatment_plans (therapist_id, client_id, title, summary, status, start_date, target_date)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7::date)
         RETURNING id`,
        [
          req.user.id,
          clientId,
          data.title,
          data.summary ?? null,
          data.status ?? "draft",
          data.startDate ?? null,
          data.targetDate ?? null,
        ]
      );
      const id = rows[0].id;
      await writeGoals(tx, id, req.user.id, data.goals);
      return id;
    });

    const plan = await loadPlan(planId, req.user.id);
    res.status(201).json({ plan: { ...plan, goals: await goalsFor(planId) } });
  })
);

/** Replaces the goal tree wholesale, which is what the editor submits. */
async function writeGoals(tx, planId, therapistId, goals) {
  await tx.query(`DELETE FROM treatment_goals WHERE plan_id = $1`, [planId]);

  for (const [index, goal] of goals.entries()) {
    const { rows } = await tx.query(
      `INSERT INTO treatment_goals (plan_id, therapist_id, position, title, notes, status, target_date, progress_percent)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8)
       RETURNING id`,
      [planId, therapistId, index, goal.title, goal.notes ?? null, goal.status, goal.targetDate ?? null, goal.progressPercent]
    );
    const goalId = rows[0].id;

    for (const [position, objective] of goal.objectives.entries()) {
      await tx.query(
        `INSERT INTO treatment_objectives (goal_id, therapist_id, position, title, interventions, status, target_date)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::date)`,
        [
          goalId,
          therapistId,
          position,
          objective.title,
          JSON.stringify(objective.interventions ?? []),
          objective.status,
          objective.targetDate ?? null,
        ]
      );
    }
  }
}

therapistRouter.get(
  "/treatment-plans/:id",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const plan = await loadPlan(req.params.id, req.user.id);
    res.json({ plan: { ...plan, goals: await goalsFor(plan.id) } });
  })
);

therapistRouter.patch(
  "/treatment-plans/:id",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const existing = await loadPlan(req.params.id, req.user.id);
    const data = parse(planHeaderSchema.omit({ clientId: true }), req.body ?? {});

    await query(
      `UPDATE treatment_plans
          SET title       = COALESCE($3, title),
              summary     = CASE WHEN $4::boolean THEN $5 ELSE summary END,
              status      = COALESCE($6, status),
              start_date  = CASE WHEN $7::boolean THEN $8::date ELSE start_date END,
              target_date = CASE WHEN $9::boolean THEN $10::date ELSE target_date END
        WHERE id = $1 AND therapist_id = $2`,
      [
        existing.id,
        req.user.id,
        data.title ?? null,
        data.summary !== undefined,
        data.summary ?? null,
        data.status ?? null,
        data.startDate !== undefined,
        data.startDate ?? null,
        data.targetDate !== undefined,
        data.targetDate ?? null,
      ]
    );

    const plan = await loadPlan(existing.id, req.user.id);
    res.json({ plan: { ...plan, goals: await goalsFor(plan.id) } });
  })
);

/** PUT /api/therapist/treatment-plans/:id/structure - the goal editor save. */
therapistRouter.put(
  "/treatment-plans/:id/structure",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const plan = await loadPlan(req.params.id, req.user.id);
    const data = parse(z.object({ goals: z.array(goalSchema).max(25) }), req.body ?? {});

    await transaction(async (tx) => {
      await writeGoals(tx, plan.id, req.user.id, data.goals);
    });

    const updated = await loadPlan(plan.id, req.user.id);
    res.json({ plan: { ...updated, goals: await goalsFor(plan.id) } });
  })
);

/**
 * PATCH /api/therapist/treatment-plans/:id/goals/:goalId
 *
 * Just the progress or status of one goal, for the quick "update progress"
 * control on a client card without re-submitting the whole plan.
 */
therapistRouter.patch(
  "/treatment-plans/:id/goals/:goalId",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const plan = await loadPlan(req.params.id, req.user.id);

    const data = parse(
      z.object({
        progressPercent: z.coerce.number().int().min(0).max(100).optional(),
        status: z.enum(STATUSES).optional(),
      }),
      req.body ?? {}
    );

    const { rows } = await query(
      `UPDATE treatment_goals
          SET progress_percent = COALESCE($3, progress_percent),
              status           = COALESCE($4, status)
        WHERE id = $1 AND plan_id = $2 AND therapist_id = $5
        RETURNING id, progress_percent AS "progressPercent", status`,
      [req.params.goalId, plan.id, data.progressPercent ?? null, data.status ?? null, req.user.id]
    );
    if (!rows.length) throw notFound("Goal not found");

    res.json({ goal: rows[0] });
  })
);

therapistRouter.delete(
  "/treatment-plans/:id",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const plan = await loadPlan(req.params.id, req.user.id);
    await query(`DELETE FROM treatment_plans WHERE id = $1 AND therapist_id = $2`, [
      plan.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

/**
 * GET /api/therapist/progress?clientId=
 *
 * Four honest series per client, each computed from rows that already exist:
 * assessment totals over time, goal completion, session attendance and
 * homework completion. Nothing is estimated.
 */
therapistRouter.get(
  "/progress",
  asyncHandler(async (req, res) => {
    checkTherapist(req);

    let ids = await caseloadIds(req.user.id);
    if (typeof req.query.clientId === "string" && req.query.clientId) {
      const clientId = await assertClient(req.user.id, req.query.clientId);
      ids = ids.filter((id) => id === clientId);
    }
    if (!ids.length) return res.json({ clients: [], total: 0 });

    const clients = [];

    for (const clientId of ids) {
      const [client, sessions, goals, homework, series] = await Promise.all([
        queryOne(
          `SELECT u.id, u.full_name AS "fullName", p.avatar_url AS "avatarUrl"
             FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
            WHERE u.id = $1`,
          [clientId]
        ),
        query(
          `SELECT status, count(*)::int AS total
             FROM sessions
            WHERE therapist_id = $1 AND user_id = $2
            GROUP BY status`,
          [req.user.id, clientId]
        ),
        query(
          `SELECT count(*)::int                              AS total,
                  count(*) FILTER (WHERE g.status = 'completed')::int AS completed,
                  round(avg(g.progress_percent))::int        AS progress
             FROM treatment_goals g
             JOIN treatment_plans tp ON tp.id = g.plan_id
            WHERE tp.therapist_id = $1 AND tp.client_id = $2`,
          [req.user.id, clientId]
        ),
        query(
          `SELECT count(*)::int                              AS total,
                  count(*) FILTER (WHERE h.status = 'completed')::int AS completed
             FROM homework_items h
            WHERE h.therapist_id = $1 AND h.client_id = $2`,
          [req.user.id, clientId]
        ),
        query(
          `SELECT a.id,
                  a.completed_at                    AS "completedAt",
                  COALESCE(s.total, 0)              AS "totalScore",
                  COALESCE(s.scored, 0)             AS "scored",
                  CASE WHEN COALESCE(s.scored, 0) > 0
                       THEN round((s.total::numeric / (s.scored * 5)) * 100)::int
                       ELSE NULL END                AS "percent",
                  r.primary_issue_key               AS "primaryIssueKey"
             FROM assessments a
             LEFT JOIN assessment_results r ON r.assessment_id = a.id
             LEFT JOIN LATERAL (
               SELECT sum(score) AS total, count(score) AS scored
                 FROM assessment_answers
                WHERE assessment_id = a.id AND score IS NOT NULL
             ) s ON true
            WHERE a.user_id = $1 AND a.status = 'completed'
            ORDER BY a.completed_at ASC`,
          [clientId]
        ),
      ]);

      const sessionMap = Object.fromEntries(sessions.rows.map((row) => [row.status, row.total]));
      const attended = sessionMap.completed ?? 0;
      const cancelled = sessionMap.cancelled ?? 0;
      const scheduled = sessionMap.scheduled ?? 0;
      const held = attended + cancelled;

      // The first completed sitting is the baseline the rest is read against.
      const first = series.rows[0]?.completedAt
        ? Date.parse(series.rows[0].completedAt)
        : null;

      const assessmentSeries = series.rows.map((row, index) => ({
        ...row,
        label:
          index === 0 || first === null
            ? "Initial"
            : `Week ${Math.max(1, Math.round((Date.parse(row.completedAt) - first) / 604800000))}`,
      }));

      const goal = goals.rows[0] ?? { total: 0, completed: 0, progress: 0 };
      const hw = homework.rows[0] ?? { total: 0, completed: 0 };

      const parts = [];
      if (goal.total) parts.push(Number(goal.progress ?? 0));
      if (held) parts.push(Math.round((attended / held) * 100));
      if (hw.total) parts.push(Math.round((hw.completed / hw.total) * 100));
      if (assessmentSeries.length && assessmentSeries[0].percent !== null) {
        const latest = assessmentSeries[assessmentSeries.length - 1];
        parts.push(Number(latest.percent ?? 0));
      }

      clients.push({
        ...client,
        assessmentSeries,
        goals: { ...goal, total: Number(goal.total), completed: Number(goal.completed) },
        sessions: { scheduled, completed: attended, cancelled, attendanceRate: held ? Math.round((attended / held) * 100) : 0 },
        homework: { total: Number(hw.total), completed: Number(hw.completed), percent: hw.total ? Math.round((hw.completed / hw.total) * 100) : 0 },
        overallPercent: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0,
      });
    }

    res.json({ clients, total: clients.length });
  })
);

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

/**
 * Reminders are derived from rows rather than scheduled by a clock job, so
 * they are always correct for the moment the inbox is opened. Each carries an
 * idempotency key, so opening the page ten times creates one row.
 */
async function ensureReminders(therapistId, now = new Date()) {
  const in24h = new Date(now.getTime() + 86400000);

  const { rows: sessions } = await query(
    `SELECT s.id, s.scheduled_at AS "scheduledAt", u.full_name AS "clientName"
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.therapist_id = $1
        AND s.status = 'scheduled'
        AND s.scheduled_at >= $2
        AND s.scheduled_at < $3`,
    [therapistId, now.toISOString(), in24h.toISOString()]
  );

  for (const session of sessions) {
    await notify({
      userId: therapistId,
      type: "session_reminder",
      title: `Session with ${session.clientName}`,
      body: `Starts ${new Date(session.scheduledAt).toLocaleString()}.`,
      link: "/portal/therapist/calendar",
      data: { sessionId: session.id },
      key: `session-reminder:${session.id}:${session.scheduledAt}`,
    });
  }

  const { rows: goals } = await query(
    `SELECT g.id, g.title, g.target_date::text AS "targetDate", u.full_name AS "clientName"
       FROM treatment_goals g
       JOIN treatment_plans tp ON tp.id = g.plan_id
       JOIN users u ON u.id = tp.client_id
      WHERE tp.therapist_id = $1
        AND tp.status = 'active'
        AND g.status IN ('not_started', 'in_progress')
        AND g.target_date IS NOT NULL
        AND g.target_date <= ($2::date + 3)`,
    [therapistId, now.toISOString().slice(0, 10)]
  );

  for (const goal of goals) {
    await notify({
      userId: therapistId,
      type: "treatment_plan_reminder",
      title: `Goal due: ${goal.title}`,
      body: `Target date ${goal.targetDate} for ${goal.clientName}.`,
      link: "/portal/therapist/treatment-plans",
      data: { goalId: goal.id },
      key: `goal-reminder:${goal.id}:${goal.targetDate}`,
    });
  }
}

const NOTIFICATION_SELECT = `
  id, type, title, body, link, data, read_at AS "readAt", created_at AS "createdAt"
`;

therapistRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    await ensureReminders(req.user.id);

    const { rows } = await query(
      `SELECT ${NOTIFICATION_SELECT}
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.user.id]
    );

    const unread = rows.filter((row) => !row.readAt).length;
    res.json({ notifications: rows, total: rows.length, unread });
  })
);

therapistRouter.post(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const { rowCount } = await query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.id]
    );
    res.json({ ok: true, updated: rowCount });
  })
);

therapistRouter.post(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const id = uuidParam(req.params.id, "Notification");

    // Scoped by user id: somebody else's notification answers 404, not 200.
    const { rows } = await query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
        WHERE id = $1 AND user_id = $2
        RETURNING id, read_at AS "readAt"`,
      [id, req.user.id]
    );
    if (!rows.length) throw notFound("Notification not found");

    res.json({ notification: rows[0] });
  })
);

/** Compact inbox badge for the portal header. */
therapistRouter.get(
  "/notifications/unread",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const { rows } = await query(
      `SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.id]
    );
    res.json({ unread: rows[0].unread });
  })
);

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const settingsSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(120).optional(),
  avatarUrl: z
    .string()
    .trim()
    .max(400)
    .refine((value) => !value || /^https?:\/\//.test(value), "Use a full http(s) image URL")
    .nullable()
    .optional(),
  bio: textOrNull(2000),
  discipline: z.string().trim().min(2).max(120).optional(),
  registrationNumber: z.string().trim().min(2).max(60).optional(),
  registrationBody: textOrNull(160),
  acceptingNewCases: z.boolean().optional(),
  availabilityHoursPerWeek: z.coerce.number().int().min(0).max(168).nullable().optional(),
  availabilityDays: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).max(7).optional(),
  availabilityHours: textOrNull(120),
  notificationPrefs: z
    .object({
      appointments: z.boolean().optional(),
      messages: z.boolean().optional(),
      assessments: z.boolean().optional(),
      reminders: z.boolean().optional(),
    })
    .optional(),
});

/** GET /api/therapist/settings - profile, availability and preferences. */
therapistRouter.get(
  "/settings",
  asyncHandler(async (req, res) => {
    checkTherapist(req);

    const profile = await queryOne(
      `SELECT p.avatar_url           AS "avatarUrl",
              p.bio,
              p.discipline,
              p.registration_number  AS "registrationNumber",
              p.registration_body    AS "registrationBody",
              p.registration_country AS "registrationCountry",
              p.registration_verified AS "registrationVerified",
              p.years_experience     AS "yearsExperience",
              p.session_fee::float8  AS "sessionFee",
              p.currency,
              p.accepting_new_cases  AS "acceptingNewCases",
              p.availability_hours_per_week AS "availabilityHoursPerWeek",
              p.availability_days    AS "availabilityDays",
              p.availability_hours   AS "availabilityHours",
              p.notification_prefs   AS "notificationPrefs",
              p.modalities,
              p.clinical_areas       AS "clinicalAreas",
              p.languages,
              p.consented_to_data_sharing AS "consentedToDataSharing"
         FROM therapist_profiles p
        WHERE p.user_id = $1`,
      [req.user.id]
    );

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        fullName: req.user.fullName,
        role: req.user.role,
      },
      profile: {
        avatarUrl: profile?.avatarUrl ?? null,
        bio: profile?.bio ?? "",
        discipline: profile?.discipline ?? "",
        registrationNumber: profile?.registrationNumber ?? "",
        registrationBody: profile?.registrationBody ?? "",
        registrationCountry: profile?.registrationCountry ?? "",
        registrationVerified: profile?.registrationVerified ?? false,
        yearsExperience: profile?.yearsExperience ?? 0,
        sessionFee: Number(profile?.sessionFee ?? 0),
        currency: profile?.currency ?? "GBP",
        acceptingNewCases: profile?.acceptingNewCases ?? true,
        availabilityHoursPerWeek: profile?.availabilityHoursPerWeek ?? null,
        availabilityDays: profile?.availabilityDays ?? [],
        availabilityHours: profile?.availabilityHours ?? "",
        notificationPrefs: {
          appointments: profile?.notificationPrefs?.appointments ?? true,
          messages: profile?.notificationPrefs?.messages ?? true,
          assessments: profile?.notificationPrefs?.assessments ?? true,
          reminders: profile?.notificationPrefs?.reminders ?? true,
        },
        modalities: profile?.modalities ?? [],
        clinicalAreas: profile?.clinicalAreas ?? [],
        languages: profile?.languages ?? [],
        consentedToDataSharing: profile?.consentedToDataSharing ?? false,
      },
    });
  })
);

/** PATCH /api/therapist/settings - save profile, availability and prefs. */
therapistRouter.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const data = parse(settingsSchema, req.body ?? {});

    await transaction(async (tx) => {
      if (data.fullName) {
        await tx.query(`UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1`, [
          req.user.id,
          data.fullName,
        ]);
      }

      const sets = [];
      const values = [req.user.id];
      const push = (column, value, cast = "") => {
        values.push(value);
        sets.push(`${column} = $${values.length}${cast}`);
      };

      if (data.avatarUrl !== undefined) push("avatar_url", data.avatarUrl);
      if (data.bio !== undefined) push("bio", data.bio);
      if (data.discipline !== undefined) push("discipline", data.discipline);
      if (data.registrationNumber !== undefined) push("registration_number", data.registrationNumber);
      if (data.registrationBody !== undefined) push("registration_body", data.registrationBody);
      if (data.acceptingNewCases !== undefined) push("accepting_new_cases", data.acceptingNewCases);
      if (data.availabilityHoursPerWeek !== undefined) push("availability_hours_per_week", data.availabilityHoursPerWeek);
      if (data.availabilityDays !== undefined) push("availability_days", JSON.stringify(data.availabilityDays), "::jsonb");
      if (data.availabilityHours !== undefined) push("availability_hours", data.availabilityHours);
      if (data.notificationPrefs !== undefined) push("notification_prefs", JSON.stringify(data.notificationPrefs), "::jsonb");

      if (sets.length) {
        await tx.query(
          `UPDATE therapist_profiles SET ${sets.join(", ")}, updated_at = now() WHERE user_id = $1`,
          values
        );
      }
    });

    res.json({ ok: true, message: "Settings saved" });
  })
);

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

/**
 * GET /api/therapist/dashboard
 *
 * Everything the landing screen needs in one request so the first paint is a
 * single round trip: four counts, today's diary, the next few bookings, the
 * activity feed and the inbox.
 */
therapistRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    checkTherapist(req);

    const bounds = dayBounds();
    const clientIds = await caseloadIds(req.user.id);

    const [stats, today, upcoming, results] = await Promise.all([
      queryOne(
        `SELECT (SELECT count(*)::int FROM sessions
                  WHERE therapist_id = $1 AND scheduled_at >= $2 AND scheduled_at < $3) AS "todaySessions",
                (SELECT count(*)::int FROM sessions
                  WHERE therapist_id = $1 AND scheduled_at >= $4 AND scheduled_at < $5) AS "sessionsThisWeek",
                (SELECT count(*)::int FROM (
                   SELECT client_id FROM (
                     SELECT user_id AS client_id FROM sessions WHERE therapist_id = $1 AND user_id <> $1
                     UNION
                     SELECT user_id FROM conversations WHERE therapist_id = $1 AND user_id <> $1
                     UNION
                     SELECT client_id FROM client_cases WHERE therapist_id = $1
                     UNION
                     SELECT client_id FROM treatment_plans WHERE therapist_id = $1
                     UNION
                     SELECT client_id FROM session_notes WHERE therapist_id = $1
                     UNION
                     SELECT client_id FROM homework_items WHERE therapist_id = $1
                   ) all_members
                 ) members
                 LEFT JOIN client_cases cc ON cc.therapist_id = $1 AND cc.client_id = members.client_id
                 WHERE COALESCE(cc.status, 'active') = 'active')     AS "activeClients",
                (SELECT count(*)::int
                   FROM assessment_results r
                   JOIN assessments a ON a.id = r.assessment_id
                  WHERE r.user_id = ANY($6::uuid[]) AND r.reviewed_at IS NULL
                    AND a.status = 'completed')                      AS "pendingAssessments",
                (SELECT count(*)::int FROM sessions
                  WHERE therapist_id = $1 AND status = 'scheduled'
                    AND confirmed_at IS NULL AND scheduled_at >= now()) AS "pendingRequests",
                (SELECT count(*)::int FROM notifications
                  WHERE user_id = $1 AND read_at IS NULL)            AS "unreadNotifications"`,
        [
          req.user.id,
          bounds.todayStart,
          bounds.todayEnd,
          bounds.weekStart,
          bounds.weekEnd,
          clientIds,
        ]
      ),
      query(
        `SELECT ${SESSION_SELECT}
           ${SESSION_FROM}
          WHERE s.therapist_id = $1
            AND s.scheduled_at >= $2 AND s.scheduled_at < $3
          ORDER BY s.scheduled_at ASC`,
        [req.user.id, bounds.todayStart, bounds.todayEnd]
      ),
      query(
        `SELECT ${SESSION_SELECT}
           ${SESSION_FROM}
          WHERE s.therapist_id = $1
            AND s.status = 'scheduled'
            AND s.scheduled_at >= $2
          ORDER BY s.scheduled_at ASC
          LIMIT 6`,
        [req.user.id, new Date().toISOString()]
      ),
      Promise.all([
        activityFeed(req.user.id, clientIds, 8),
        query(
          `SELECT ${NOTIFICATION_SELECT}
             FROM notifications
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 6`,
          [req.user.id]
        ),
      ]),
    ]);

    res.json({
      stats: {
        todaySessions: stats?.todaySessions ?? 0,
        sessionsThisWeek: stats?.sessionsThisWeek ?? 0,
        activeClients: stats?.activeClients ?? 0,
        pendingAssessments: stats?.pendingAssessments ?? 0,
        pendingRequests: stats?.pendingRequests ?? 0,
        unreadNotifications: stats?.unreadNotifications ?? 0,
      },
      todaySessions: today.rows,
      upcoming: upcoming.rows,
      activity: results[0],
      notifications: results[1].rows,
      clientCount: clientIds.length,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Existing endpoints (kept as they were)                              */
/* ------------------------------------------------------------------ */

// Sample case queue for demonstration
const MOCK_THERAPIST_CASES = [
  {
    id: "case-th-301",
    clientAlias: "Client #9042",
    age: 31,
    primaryConcern: "Generalized Anxiety & Panic Episodes",
    matchedScore: 96,
    aiRecommendationReason: "High alignment with Cognitive Behavioral Therapy (CBT) and Mindfulness specialties",
    preferredMode: "Video / Audio",
    urgency: "Moderate",
    assignedAt: new Date(Date.now() - 7200000).toISOString(),
    status: "pending_acceptance",
  },
  {
    id: "case-th-302",
    clientAlias: "Client #8819",
    age: 27,
    primaryConcern: "Depression & Life Transition",
    matchedScore: 91,
    aiRecommendationReason: "Matches Psychodynamic therapy experience and evening availability",
    preferredMode: "Messaging & Scheduled Sessions",
    urgency: "Low",
    assignedAt: new Date(Date.now() - 172800000).toISOString(),
    status: "pending_acceptance",
  },
];

const soapNotesStore = [];
const followupsStore = [];

/** GET /api/therapist/cases - Receive AI matched & intake cases */
therapistRouter.get(
  "/cases",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    res.json({
      cases: MOCK_THERAPIST_CASES,
      aiMatchingEngineStatus: "reserved_slot", // indicates placeholder for custom AI algorithm
    });
  })
);

/** POST /api/therapist/cases/:id/accept - Accept case */
therapistRouter.post(
  "/cases/:id/accept",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const { id } = req.params;
    const item = MOCK_THERAPIST_CASES.find((c) => c.id === id);
    if (!item) throw badRequest("Case not found");
    item.status = "accepted";

    res.json({
      success: true,
      message: "Case accepted into active caseload",
      sessionId: `ther-session-${id}`,
      caseItem: item,
    });
  })
);

/** POST /api/therapist/session/:id/notes - Save SOAP Documentation */
therapistRouter.post(
  "/session/:id/notes",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const schema = z.object({
      subjective: z.string().min(5, "Subjective notes required"),
      objective: z.string().min(5, "Objective notes required"),
      assessment: z.string().min(5, "Assessment required"),
      plan: z.string().min(5, "Treatment plan required"),
    });
    const payload = parse(schema, req.body);

    const doc = {
      sessionId: req.params.id,
      therapistId: req.user.id,
      updatedAt: new Date().toISOString(),
      ...payload,
    };
    soapNotesStore.push(doc);

    res.json({
      success: true,
      message: "SOAP clinical documentation saved securely",
      doc,
    });
  })
);

/** POST /api/therapist/session/:id/followup - Schedule follow-up & care plan */
therapistRouter.post(
  "/session/:id/followup",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const schema = z.object({
      followupDate: z.string(),
      assignedTasks: z.array(z.string()).optional(),
      notes: z.string().optional(),
    });
    const payload = parse(schema, req.body);

    const record = {
      sessionId: req.params.id,
      therapistId: req.user.id,
      createdAt: new Date().toISOString(),
      ...payload,
    };
    followupsStore.push(record);

    res.json({
      success: true,
      message: "Follow-up and care plan recorded",
      record,
    });
  })
);

/** POST /api/therapist/escalate - Clinical Safety Escalation */
therapistRouter.post(
  "/escalate",
  asyncHandler(async (req, res) => {
    checkTherapist(req);
    const schema = z.object({
      sessionId: z.string(),
      clientAlias: z.string().optional(),
      riskLevel: z.enum(["moderate", "severe", "imminent_danger"]),
      clinicalObservations: z.string().min(10, "Clinical observations required"),
      recommendedAction: z.string(),
    });
    const payload = parse(schema, req.body);

    // The session, when it is one of this therapist's, gives the escalation a
    // real client and diary row. A free-text alias is the fallback so a
    // concern can still be raised without inventing an id.
    const sessionId = z.string().uuid().safeParse(payload.sessionId).success
      ? payload.sessionId
      : null;
    let clientId = null;
    let linkedSessionId = null;
    if (sessionId) {
      const { rows } = await query(
        `SELECT id, user_id FROM sessions WHERE id = $1 AND therapist_id = $2 LIMIT 1`,
        [sessionId, req.user.id]
      );
      if (rows[0]) {
        linkedSessionId = rows[0].id;
        clientId = rows[0].user_id;
      }
    }

    const priorityByRisk = { moderate: "medium", severe: "high", imminent_danger: "critical" };

    const escalation = await recordEscalation({
      source: "therapist",
      priority: priorityByRisk[payload.riskLevel],
      riskType: payload.riskLevel,
      reason: `Therapist reported ${payload.riskLevel.replace(/_/g, " ")} risk during a session.`,
      observations: payload.clinicalObservations,
      recommendedAction: payload.recommendedAction,
      clientId,
      clientAlias: payload.clientAlias ?? null,
      therapistId: req.user.id,
      sessionId: linkedSessionId,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: "Clinical safety escalation logged and dispatched for clinical review",
      escalation: {
        ...escalation,
        riskLevel: payload.riskLevel,
        clinicalObservations: payload.clinicalObservations,
        recommendedAction: payload.recommendedAction,
        therapistId: req.user.id,
        createdAt: escalation.created_at,
      },
    });
  })
);

export default therapistRouter;
