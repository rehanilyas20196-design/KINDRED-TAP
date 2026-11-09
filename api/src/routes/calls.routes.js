/**
 * REST routes for video call lifecycle.
 *
 * All routes require authentication. The caller/conversation/receiver are
 * validated against the database on every request - the client never supplies
 * trusted identifiers. Real-time signaling happens over Socket.IO; these
 * endpoints are used for call state queries and fallback actions.
 */

import { randomUUID } from "node:crypto";
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
import {
  initiateCallSchema,
  callActionSchema,
  endCallSchema,
} from "../lib/schemas.js";

export const callsRouter = Router();

callsRouter.use(requireAuth);

const uuidParam = (value, label) => {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw badRequest(`${label} is not a valid id`);
  return parsed.data;
};

/** The caller and receiver are the two parties of the conversation. */
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

/** POST /api/calls - initiate a video call. */
callsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { conversationId } = parse(initiateCallSchema, req.body);

    const conversation = await participantConversation(conversationId, req.user.id);
    if (!conversation) throw notFound("Conversation not found or you are not a participant");

    const receiverId =
      conversation.userId === req.user.id
        ? conversation.therapistId
        : conversation.userId;

    // Prevent duplicate active calls.
    const existing = await queryOne(
      `SELECT id FROM video_calls
        WHERE conversation_id = $1
          AND status IN ('outgoing', 'ringing', 'accepted', 'connecting', 'connected')
        LIMIT 1`,
      [conversationId]
    );
    if (existing) {
      throw conflict("A call is already active in this conversation");
    }

    const roomId = `kindred-${randomUUID()}`;

    const { rows } = await query(
      `INSERT INTO video_calls (conversation_id, caller_id, receiver_id, room_id, status)
       VALUES ($1, $2, $3, $4, 'outgoing')
       RETURNING id, room_id AS "roomId", status, created_at AS "createdAt"`,
      [conversationId, req.user.id, receiverId, roomId]
    );

    res.status(201).json({ call: rows[0] });
  })
);

/** GET /api/calls/:id - call state (polling fallback). */
callsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const callId = uuidParam(req.params.id, "Call");

    const call = await queryOne(
      `SELECT id, conversation_id AS "conversationId", caller_id AS "callerId",
              receiver_id AS "receiverId", room_id AS "roomId", status,
              created_at AS "createdAt", accepted_at AS "acceptedAt",
              ended_at AS "endedAt"
         FROM video_calls
        WHERE id = $1
        LIMIT 1`,
      [callId]
    );
    if (!call) throw notFound("Call not found");

    if (call.callerId !== req.user.id && call.receiverId !== req.user.id) {
      throw forbidden("You are not a participant in this call");
    }

    res.json({ call });
  })
);

/** POST /api/calls/:id/accept - receiver accepts. */
callsRouter.post(
  "/:id/accept",
  asyncHandler(async (req, res) => {
    const callId = uuidParam(req.params.id, "Call");

    const call = await queryOne(
      `SELECT id, conversation_id, receiver_id, room_id, status
         FROM video_calls
        WHERE id = $1 LIMIT 1`,
      [callId]
    );
    if (!call) throw notFound("Call not found");
    if (call.receiver_id !== req.user.id) throw forbidden("Only the receiver can accept");
    if (call.status !== "ringing") throw conflict("Call is no longer ringing");

    await query(
      `UPDATE video_calls SET status = 'accepted', accepted_at = now() WHERE id = $1`,
      [callId]
    );

    res.json({ ok: true, roomId: call.room_id });
  })
);

/** POST /api/calls/:id/reject - receiver rejects. */
callsRouter.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const callId = uuidParam(req.params.id, "Call");

    const call = await queryOne(
      `SELECT id, conversation_id, receiver_id, status
         FROM video_calls
        WHERE id = $1 LIMIT 1`,
      [callId]
    );
    if (!call) throw notFound("Call not found");
    if (call.receiver_id !== req.user.id) throw forbidden("Only the receiver can reject");
    if (call.status !== "ringing") throw conflict("Call is no longer ringing");

    await query(
      `UPDATE video_calls SET status = 'rejected', ended_at = now() WHERE id = $1`,
      [callId]
    );

    res.json({ ok: true });
  })
);

/** POST /api/calls/:id/cancel - caller cancels. */
callsRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const callId = uuidParam(req.params.id, "Call");

    const call = await queryOne(
      `SELECT id, conversation_id, caller_id, status
         FROM video_calls
        WHERE id = $1 LIMIT 1`,
      [callId]
    );
    if (!call) throw notFound("Call not found");
    if (call.caller_id !== req.user.id) throw forbidden("Only the caller can cancel");
    if (call.status !== "outgoing" && call.status !== "ringing") {
      throw conflict("Call cannot be cancelled");
    }

    await query(
      `UPDATE video_calls SET status = 'cancelled', ended_at = now() WHERE id = $1`,
      [callId]
    );

    res.json({ ok: true });
  })
);

/** POST /api/calls/:id/end - either participant ends. */
callsRouter.post(
  "/:id/end",
  asyncHandler(async (req, res) => {
    const callId = uuidParam(req.params.id, "Call");

    const call = await queryOne(
      `SELECT id, conversation_id, caller_id, receiver_id, status
         FROM video_calls
        WHERE id = $1 LIMIT 1`,
      [callId]
    );
    if (!call) throw notFound("Call not found");
    if (call.caller_id !== req.user.id && call.receiver_id !== req.user.id) {
      throw forbidden("You are not a participant in this call");
    }
    if (call.status === "ended" || call.status === "failed") {
      throw conflict("Call is already ended");
    }

    await query(
      `UPDATE video_calls SET status = 'ended', ended_at = now() WHERE id = $1`,
      [callId]
    );

    res.json({ ok: true });
  })
);

export default callsRouter;
