import { Router } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../db/index.js";
import {
  asyncHandler,
  badRequest,
  forbidden,
  notFound,
  parse,
} from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { notify } from "../lib/notifications.js";
import { sendMessageSchema, startConversationSchema } from "../lib/schemas.js";

export const supportRouter = Router();

supportRouter.use(requireAuth);

const uuidParam = (value, label) => {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw badRequest(`${label} is not a valid id`);
  return parsed.data;
};

/* ------------------------------------------------------------------ */
/* Therapist directory                                                 */
/* ------------------------------------------------------------------ */

/**
 * The columns below are the whole public surface of a therapist profile.
 *
 * The `therapist_profiles` row also holds phone, address, date of birth and
 * emergency contacts. None of that is ever selected here, and none of it
 * should ever be added without a deliberate decision: a directory is a public
 * list, so anything in the SELECT becomes readable by every signed-in person.
 */
const THERAPIST_DIRECTORY_COLUMNS = `
  u.id,
  u.full_name                         AS "fullName",
  p.discipline,
  p.bio,
  p.clinical_areas                    AS "clinicalAreas",
  p.modalities,
  p.languages,
  p.session_modes                     AS "sessionModes",
  p.session_fee::float8               AS "sessionFee",
  p.currency,
  p.years_experience                  AS "yearsExperience",
  p.accepting_new_cases               AS "acceptingNewCases",
  p.registration_verified             AS "registrationVerified",
  p.registration_body                 AS "registrationBody",
  p.registration_country              AS "registrationCountry"
`;

/**
 * GET /api/support/therapists
 * Every active therapist with a saved profile. Filterable by clinical area and
 * language so the list stays usable once there is more than one of them.
 */
supportRouter.get(
  "/therapists",
  asyncHandler(async (req, res) => {
    const area = typeof req.query.area === "string" ? req.query.area.trim() : "";
    const language = typeof req.query.language === "string" ? req.query.language.trim() : "";

    // Clause text is fixed; only values are parameterised.
    const filters = ["u.role = 'therapist'", "u.status = 'active'"];
    const params = [];

    if (area) {
      params.push(JSON.stringify([area]));
      filters.push(`p.clinical_areas @> $${params.length}::jsonb`);
    }
    if (language) {
      params.push(JSON.stringify([language]));
      filters.push(`p.languages @> $${params.length}::jsonb`);
    }

    const { rows } = await query(
      `SELECT ${THERAPIST_DIRECTORY_COLUMNS}
         FROM users u
         JOIN therapist_profiles p ON p.user_id = u.id
        WHERE ${filters.join("\n          AND ")}
        ORDER BY p.registration_verified DESC,
                 p.accepting_new_cases DESC,
                 p.years_experience DESC NULLS LAST,
                 u.full_name NULLS LAST`,
      params
    );

    res.json({ therapists: rows, total: rows.length });
  })
);

/* ------------------------------------------------------------------ */
/* Conversations                                                        */
/* ------------------------------------------------------------------ */

/**
 * True when `userId` is one of the two people in the thread. Every message
 * read and write goes through this, so a leaked conversation id in a URL
 * cannot be used to read someone else's therapy messages.
 */
async function participantConversation(conversationId, userId) {
  return queryOne(
    `SELECT id, user_id AS "userId", therapist_id AS "therapistId"
       FROM conversations
      WHERE id = $1
        AND (user_id = $2 OR therapist_id = $2)
      LIMIT 1`,
    [conversationId, userId]
  );
}

/** GET /api/support/conversations - the threads the signed-in person is in. */
supportRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT c.id,
              c.created_at                          AS "createdAt",
              c.updated_at                          AS "updatedAt",
              u.id                                  AS "otherUserId",
              u.full_name                           AS "otherName",
              u.role                                AS "otherRole",
              (SELECT m.body
                 FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC
                LIMIT 1)                           AS "lastMessage",
              (SELECT m.created_at
                 FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC
                LIMIT 1)                           AS "lastMessageAt",
              (SELECT count(*)::int
                 FROM messages m
                WHERE m.conversation_id = c.id)   AS "messageCount",
              -- What the caller has not seen: messages from the other side
              -- sent after this reader last opened the thread.
              (SELECT count(*)::int
                 FROM messages m
                WHERE m.conversation_id = c.id
                  AND m.sender_id <> $1
                  AND m.created_at > COALESCE(
                        (SELECT mr.last_read_at
                           FROM message_reads mr
                          WHERE mr.conversation_id = c.id AND mr.user_id = $1),
                        '-infinity'::timestamptz)) AS "unreadCount"
         FROM conversations c
         JOIN users u
           ON u.id = CASE WHEN c.user_id = $1 THEN c.therapist_id ELSE c.user_id END
        WHERE c.user_id = $1 OR c.therapist_id = $1
        ORDER BY c.updated_at DESC`,
      [req.user.id]
    );

    res.json({ conversations: rows, total: rows.length });
  })
);

/**
 * POST /api/support/conversations
 * Opens a thread with a therapist, or returns the one that already exists.
 * Only people seeking support start threads; therapists reply to what arrives.
 */
supportRouter.post(
  "/conversations",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "user") {
      throw forbidden("Only people seeking support can start a conversation");
    }

    const { therapistId } = parse(startConversationSchema, req.body);
    if (therapistId === req.user.id) {
      throw badRequest("You cannot start a conversation with yourself");
    }

    const therapist = await queryOne(
      `SELECT u.id, u.full_name AS "fullName"
         FROM users u
         JOIN therapist_profiles p ON p.user_id = u.id
        WHERE u.id = $1
          AND u.role = 'therapist'
          AND u.status = 'active'
        LIMIT 1`,
      [therapistId]
    );
    if (!therapist) throw notFound("That therapist is not available");

    const conversation = await transaction(async (tx) => {
      // The unique constraint on (user_id, therapist_id) is what makes a
      // double tap on "Message" safe.
      const inserted = await tx.query(
        `INSERT INTO conversations (user_id, therapist_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, therapist_id) DO NOTHING
         RETURNING id`,
        [req.user.id, therapistId]
      );
      if (inserted.rows[0]) return { id: inserted.rows[0].id };

      const existing = await tx.query(
        `SELECT id FROM conversations
          WHERE user_id = $1 AND therapist_id = $2
          LIMIT 1`,
        [req.user.id, therapistId]
      );
      return existing.rows[0];
    });

    res.status(201).json({ conversationId: conversation.id, therapist });
  })
);

/* ------------------------------------------------------------------ */
/* Messages                                                             */
/* ------------------------------------------------------------------ */

/** GET /api/support/conversations/:id/messages - one thread, oldest first. */
supportRouter.get(
  "/conversations/:id/messages",
  asyncHandler(async (req, res) => {
    const conversationId = uuidParam(req.params.id, "Conversation");
    const conversation = await participantConversation(conversationId, req.user.id);
    if (!conversation) throw notFound("Conversation not found");

    const { rows } = await query(
      `SELECT m.id,
              m.body,
              m.sender_id                            AS "senderId",
              m.created_at                           AS "createdAt"
         FROM messages m
        WHERE m.conversation_id = $1
        ORDER BY m.created_at ASC`,
      [conversationId]
    );

    const otherId = conversation.userId === req.user.id ? conversation.therapistId : conversation.userId;
    const other = await queryOne(
      `SELECT id, full_name AS "fullName", role FROM users WHERE id = $1 LIMIT 1`,
      [otherId]
    );

    res.json({ conversationId, other, messages: rows, total: rows.length });
  })
);

/** POST /api/support/conversations/:id/messages - append one message. */
supportRouter.post(
  "/conversations/:id/messages",
  asyncHandler(async (req, res) => {
    const conversationId = uuidParam(req.params.id, "Conversation");
    const conversation = await participantConversation(conversationId, req.user.id);
    if (!conversation) throw notFound("Conversation not found");

    const { body } = parse(sendMessageSchema, req.body);

    const message = await transaction(async (tx) => {
      const inserted = await tx.query(
        `INSERT INTO messages (conversation_id, sender_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, body, sender_id AS "senderId", created_at AS "createdAt"`,
        [conversationId, req.user.id, body]
      );

      // Keeps "my conversations" ordered by recency of the last word spoken.
      await tx.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [
        conversationId,
      ]);

      return inserted.rows[0];
    });

    // Tell the person on the other side. Their own notification switches are
    // applied inside `notify`, and a failure here never fails the message.
    const recipient =
      conversation.userId === req.user.id ? conversation.therapistId : conversation.userId;

    await notify({
      userId: recipient,
      type: "new_message",
      title: `New message from ${req.user.fullName ?? "Kindred Tap"}`,
      body: body.length > 140 ? `${body.slice(0, 137)}...` : body,
      link: null,
      data: { conversationId },
      key: `message:${message.id}`,
    });

    res.status(201).json({ message });
  })
);

/**
 * POST /api/support/conversations/:id/read - mark the thread as seen.
 *
 * Writes the caller's own read marker and nobody else's, so a conversation id
 * in a URL cannot be cleared on another reader's behalf.
 */
supportRouter.post(
  "/conversations/:id/read",
  asyncHandler(async (req, res) => {
    const conversationId = uuidParam(req.params.id, "Conversation");
    const conversation = await participantConversation(conversationId, req.user.id);
    if (!conversation) throw notFound("Conversation not found");

    await query(
      `INSERT INTO message_reads (user_id, conversation_id, last_read_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id, conversation_id)
       DO UPDATE SET last_read_at = now()`,
      [req.user.id, conversationId]
    );

    res.json({ ok: true, lastReadAt: new Date().toISOString() });
  })
);

export default supportRouter;