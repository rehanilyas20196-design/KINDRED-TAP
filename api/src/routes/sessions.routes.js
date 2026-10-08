/**
 * Booked sessions.
 *
 * The diary only ever contains who, when, how long and how it went - never
 * what was said. Every read and write is scoped to the two people on the
 * booking, so a session id taken from a URL cannot be used to move or cancel
 * somebody else's appointment.
 */

import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../db/index.js";
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

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

const uuidParam = (value, label) => {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw badRequest(`${label} is not a valid id`);
  return parsed.data;
};

/**
 * Times arrive as anything JavaScript can parse ("2026-10-05T18:00:00",
 * with or without a zone) and leave again as an absolute instant, so the
 * browser's local time zone never leaks into storage.
 */
const instant = z
  .string()
  .trim()
  .refine((value) => Number.isFinite(Date.parse(value)), "Choose a valid date and time")
  .transform((value) => new Date(value).toISOString());

const durationField = z.coerce
  .number()
  .int()
  .min(15, "Sessions are at least 15 minutes")
  .max(180, "Sessions are at most 3 hours");

const bookSchema = z.object({
  therapistId: z.string().trim().uuid("Choose a therapist"),
  scheduledAt: instant,
  durationMinutes: durationField.default(50),
  mode: z.enum(["online", "phone", "in_person"]).default("online"),
});

const rescheduleSchema = z.object({
  scheduledAt: instant,
  durationMinutes: durationField.optional(),
  mode: z.enum(["online", "phone", "in_person"]).optional(),
});

const cancelSchema = z.object({
  reason: z.string().trim().max(500, "That reason is too long").optional(),
});

const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a rating").max(5, "Choose a rating"),
  comment: z
    .string()
    .trim()
    .max(2000, "Keep the comment under 2000 characters")
    .optional()
    .transform((value) => (value ? value : null)),
});

/** Both names and the rating, without putting any clinical detail in here. */
const SESSION_COLUMNS = `
  s.id,
  s.user_id                AS "userId",
  s.therapist_id           AS "therapistId",
  s.scheduled_at           AS "scheduledAt",
  s.duration_minutes       AS "durationMinutes",
  s.mode,
  s.status,
  s.cancel_reason          AS "cancelReason",
  s.created_at             AS "createdAt",
  s.updated_at             AS "updatedAt",
  client.full_name         AS "userName",
  therapist.full_name      AS "therapistName"
`;

const SESSION_FROM = `
  FROM sessions s
  JOIN users client   ON client.id = s.user_id
  JOIN users therapist ON therapist.id = s.therapist_id
`;

/** The person on the other side of this booking, whoever is acting. */
function otherParticipant(session, actorId) {
  return session.userId === actorId ? session.therapistId : session.userId;
}

/**
 * Loads one session the caller is actually on. A missing row and somebody
 * else's row answer the same way, so an id cannot be probed for existence.
 */
async function loadOwnSession(sessionId, userId) {
  const session = await queryOne(
    `SELECT ${SESSION_COLUMNS}
       ${SESSION_FROM}
      WHERE s.id = $1 AND (s.user_id = $2 OR s.therapist_id = $2)
      LIMIT 1`,
    [sessionId, userId]
  );
  if (!session) throw notFound("Session not found");
  return session;
}

/** Attaches `{ rating, comment }` where one exists, keyed by session id. */
async function attachFeedback(sessions) {
  if (!sessions.length) return sessions;
  const { rows } = await query(
    `SELECT session_id, rating, comment, created_at AS "createdAt"
       FROM session_feedback
      WHERE session_id = ANY($1::uuid[])`,
    [sessions.map((session) => session.id)]
  );
  const bySession = new Map(rows.map((row) => [row.session_id, row]));
  return sessions.map((session) => ({
    ...session,
    feedback: bySession.get(session.id) ?? null,
  }));
}

/**
 * Two bookings cannot overlap for either party.
 *
 * Checked in SQL rather than in application state, because both sides of the
 * clash have to be seen at once: the person and the therapist each have their
 * own diary and only the database holds both.
 */
/**
 * Exported for the Clinical Advisor's diary: the advisor portal reschedules
 * through the same clash rule rather than a second copy of it.
 */
export async function findClash({ parties, scheduledAt, durationMinutes, ignoreId }) {
  const params = [parties, scheduledAt, durationMinutes];
  let ignoreClause = "";
  if (ignoreId) {
    params.push(ignoreId);
    ignoreClause = "AND s.id <> $4::uuid";
  }

  return queryOne(
    `SELECT s.id, s.scheduled_at AS "scheduledAt", s.status
       FROM sessions s
      WHERE s.status = 'scheduled'
        AND (s.user_id = ANY($1::uuid[]) OR s.therapist_id = ANY($1::uuid[]))
        AND s.scheduled_at < $2::timestamptz + make_interval(mins => $3::int)
        AND s.scheduled_at + make_interval(mins => s.duration_minutes) > $2::timestamptz
        ${ignoreClause}
      LIMIT 1`,
    params
  );
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

/**
 * GET /api/sessions
 *
 * Every session the signed-in person is party to, upcoming first. Both sides
 * see the same diary row; only the direction of the names differs.
 */
sessionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ${SESSION_COLUMNS}
         ${SESSION_FROM}
        WHERE s.user_id = $1 OR s.therapist_id = $1
        ORDER BY s.scheduled_at ASC`,
      [req.user.id]
    );

    const sessions = await attachFeedback(rows);
    res.json({ sessions, total: sessions.length });
  })
);

/**
 * POST /api/sessions
 *
 * Booking a session with the therapist the matching system put in front of
 * them. Only the person seeking support books; therapists confirm by marking
 * the session complete afterwards.
 */
sessionsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "user") {
      throw forbidden("Only people seeking support can book a session");
    }

    const data = parse(bookSchema, req.body);

    const therapist = await queryOne(
      `SELECT u.id, u.full_name AS "fullName"
         FROM users u
         JOIN therapist_profiles p ON p.user_id = u.id
        WHERE u.id = $1
          AND u.role = 'therapist'
          AND u.status = 'active'
        LIMIT 1`,
      [data.therapistId]
    );
    if (!therapist) throw notFound("That therapist is not available");

    if (Date.parse(data.scheduledAt) <= Date.now()) {
      throw badRequest("Book a session in the future");
    }

    const clash = await findClash({
      parties: [req.user.id, therapist.id],
      scheduledAt: data.scheduledAt,
      durationMinutes: data.durationMinutes,
    });
    if (clash) {
      throw conflict("That time clashes with another session in your diary", {
        clashAt: clash.scheduledAt,
      });
    }

    const { rows } = await query(
      `INSERT INTO sessions (user_id, therapist_id, scheduled_at, duration_minutes, mode)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [req.user.id, therapist.id, data.scheduledAt, data.durationMinutes, data.mode]
    );

    // A booking is a request until the therapist accepts it, so the diary on
    // the other side shows it as awaiting confirmation.
    await notify({
      userId: therapist.id,
      type: "appointment_request",
      title: "New appointment request",
      body: `${req.user.fullName ?? "A client"} requested a session on ${new Date(
        data.scheduledAt
      ).toLocaleString()}.`,
      link: "/portal/therapist/calendar",
      data: { sessionId: rows[0].id },
      key: `appointment-request:${rows[0].id}`,
    });

    const session = await loadOwnSession(rows[0].id, req.user.id);
    res.status(201).json({ session: { ...session, feedback: null } });
  })
);

/** PATCH /api/sessions/:id - move a booking that has not happened yet. */
sessionsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const sessionId = uuidParam(req.params.id, "Session");
    const session = await loadOwnSession(sessionId, req.user.id);

    if (session.status !== "scheduled") {
      throw conflict("Only a session that has not happened yet can be moved");
    }

    const data = parse(rescheduleSchema, req.body);
    const durationMinutes = data.durationMinutes ?? session.durationMinutes;
    const mode = data.mode ?? session.mode;

    if (Date.parse(data.scheduledAt) <= Date.now()) {
      throw badRequest("Choose a time in the future");
    }

    const clash = await findClash({
      parties: [session.userId, session.therapistId],
      scheduledAt: data.scheduledAt,
      durationMinutes,
      ignoreId: sessionId,
    });
    if (clash) {
      throw conflict("That time clashes with another session in your diary", {
        clashAt: clash.scheduledAt,
      });
    }

    await query(
      `UPDATE sessions
          SET scheduled_at = $2, duration_minutes = $3, mode = $4
        WHERE id = $1`,
      [sessionId, data.scheduledAt, durationMinutes, mode]
    );

    await notify({
      userId: otherParticipant(session, req.user.id),
      type: "session_updated",
      title: "Session rescheduled",
      body: `A session was moved to ${new Date(data.scheduledAt).toLocaleString()}.`,
      link: null,
      data: { sessionId },
      key: `session-rescheduled:${sessionId}:${data.scheduledAt}`,
    });

    const updated = await loadOwnSession(sessionId, req.user.id);
    res.json({ session: updated });
  })
);

/** POST /api/sessions/:id/cancel - either side can call off a booking. */
sessionsRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const sessionId = uuidParam(req.params.id, "Session");
    const session = await loadOwnSession(sessionId, req.user.id);

    if (session.status !== "scheduled") {
      throw conflict("Only a session that is still scheduled can be cancelled");
    }

    const { reason } = parse(cancelSchema, req.body ?? {});

    await query(
      `UPDATE sessions SET status = 'cancelled', cancel_reason = $2 WHERE id = $1`,
      [sessionId, reason ?? null]
    );

    await notify({
      userId: otherParticipant(session, req.user.id),
      type: "session_updated",
      title: "Session cancelled",
      body: reason ? `Reason: ${reason}` : "A booked session was cancelled.",
      link: null,
      data: { sessionId },
      key: `session-cancelled:${sessionId}`,
    });

    const updated = await loadOwnSession(sessionId, req.user.id);
    res.json({ session: updated });
  })
);

/**
 * POST /api/sessions/:id/complete
 *
 * Marks the booking as delivered, which is what opens the feedback prompt on
 * the other side. Either participant may confirm it.
 */
sessionsRouter.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    const sessionId = uuidParam(req.params.id, "Session");
    const session = await loadOwnSession(sessionId, req.user.id);

    if (session.status !== "scheduled") {
      throw conflict("Only a session that is still scheduled can be completed");
    }

    await query(`UPDATE sessions SET status = 'completed' WHERE id = $1`, [sessionId]);

    await notify({
      userId: otherParticipant(session, req.user.id),
      type: "session_updated",
      title: "Session completed",
      body: "The session has been marked as completed.",
      link: null,
      data: { sessionId },
      key: `session-completed:${sessionId}`,
    });

    const updated = await loadOwnSession(sessionId, req.user.id);
    res.json({ session: updated });
  })
);

/**
 * POST /api/sessions/:id/feedback
 *
 * The star rating about the experience of the session. Only the person who
 * attended it as a client may leave one, only once it is complete, and it is
 * stored away from anything clinical on purpose.
 */
sessionsRouter.post(
  "/:id/feedback",
  asyncHandler(async (req, res) => {
    const sessionId = uuidParam(req.params.id, "Session");
    const session = await loadOwnSession(sessionId, req.user.id);

    if (session.userId !== req.user.id) {
      throw forbidden("Only the person who attended the session can rate it");
    }
    if (session.status !== "completed") {
      throw conflict("You can rate a session once it has finished");
    }

    const data = parse(feedbackSchema, req.body);

    const { rows } = await query(
      `INSERT INTO session_feedback (session_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id)
       DO UPDATE SET rating = EXCLUDED.rating,
                     comment = EXCLUDED.comment,
                     updated_at = now()
       RETURNING session_id, rating, comment, created_at AS "createdAt"`,
      [sessionId, req.user.id, data.rating, data.comment]
    );

    res.status(201).json({ feedback: rows[0] });
  })
);

export default sessionsRouter;
