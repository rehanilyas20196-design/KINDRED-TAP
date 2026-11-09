/**
 * WebSocket server for real-time video call signaling.
 *
 * Uses the native `ws` library. Every connection is authenticated with the
 * same bearer token used by the REST API. Clients join a conversation
 * signaling group so only the two participants receive each other's call
 * signals. The server verifies all caller/receiver/room ids against the
 * database before accepting any signal.
 */

import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken, hashToken } from "./tokens.js";
import { sessionUserByTokenHash } from "./users.js";
import { queryOne, query } from "../db/index.js";

/** How long an unanswered incoming call rings before it is marked missed. */
export const CALL_TIMEOUT_MS = 30_000;

/** Map of conversation id -> set of clients in that conversation. */
const conversationClients = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>} */
const callTimers = new Map();

/**
 * Get or create the client set for a conversation.
 * @param {string} conversationId
 * @returns {Set<WebSocket>}
 */
function clientsFor(conversationId) {
  let set = conversationClients.get(conversationId);
  if (!set) {
    set = new Set();
    conversationClients.set(conversationId, set);
  }
  return set;
}

/**
 * Broadcast a JSON message to all clients in a conversation.
 * @param {string} conversationId
 * @param {unknown} message
 * @param {WebSocket} [exclude]
 */
function broadcastToConversation(conversationId, message, exclude) {
  const set = conversationClients.get(conversationId);
  if (!set) return;
  const payload = JSON.stringify(message);
  for (const client of set) {
    if (client === exclude) continue;
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

/** @param {string} callId */
function clearCallTimer(callId) {
  const timer = callTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    callTimers.delete(callId);
  }
}

/**
 * @param {string} callId
 * @param {number} ms
 * @param {() => void} fn
 */
function setCallTimer(callId, ms, fn) {
  clearCallTimer(callId);
  callTimers.set(callId, setTimeout(fn, ms));
}

/**
 * Attach a WebSocket server to the Express HTTP server. Call this after `app`
 * is built but before `server.listen()`.
 *
 * @param {import("express").Application} app
 * @returns {{ wss: WebSocketServer, httpServer: import("node:http").Server }}
 */
export function createSocketServer(app) {
  const httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: "/api/calls/ws" });
  wss.on("close", () => {
    for (const timer of callTimers.values()) clearTimeout(timer);
    callTimers.clear();
  });

  wss.on("connection", async (ws, req) => {
    // Authenticate using the bearer token from the query string.
    /** @type {string|null} */
    let userId = null;
    try {
      const url = new URL(req.url ?? "", `http://${req.headers.host}`);
      const token = url.searchParams.get("token") || "";
      if (!token) {
        ws.close(1008, "Missing authentication token");
        return;
      }

      verifyToken(token);
      const user = await sessionUserByTokenHash(hashToken(token));
      if (!user) {
        ws.close(1008, "Session expired, please sign in again");
        return;
      }
      if (user.status === "suspended") {
        ws.close(1008, "This account is suspended");
        return;
      }
      if (user.status === "pending_review" || user.status === "rejected") {
        ws.close(1008, "Account not yet approved");
        return;
      }

      userId = user.id;
      /** @type {string|null} */
      ws.userId = userId;
      /** @type {string|null} */
      ws.conversationId = null;
    } catch {
      ws.close(1008, "Authentication failed");
      return;
    }

    ws.on("message", async (raw) => {
      /** @type {any} */
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      /** @type {string} */
      const { type } = data;

      switch (type) {
        case "join_conversation": {
          /** @type {string} */
          const { conversationId } = data;
          if (!conversationId || typeof conversationId !== "string") break;

          let conversation;
          try {
            conversation = await queryOne(
              `SELECT id
                 FROM conversations
                WHERE id = $1 AND (user_id = $2 OR therapist_id = $2)
                LIMIT 1`,
              [conversationId, userId]
            );
          } catch {
            ws.send(JSON.stringify({ error: "Unable to join conversation" }));
            break;
          }
          if (!conversation) {
            ws.send(JSON.stringify({ error: "Conversation not found or you are not a participant" }));
            break;
          }

          // Leave any previous conversation.
          if (ws.conversationId) {
            const prevSet = conversationClients.get(ws.conversationId);
            prevSet && prevSet.delete(ws);
          }

          ws.conversationId = conversationId;
          clientsFor(conversationId).add(ws);
          break;
        }

        case "leave_conversation": {
          const { conversationId } = data;
          if (typeof conversationId !== "string" || ws.conversationId !== conversationId) break;
          conversationClients.get(conversationId)?.delete(ws);
          ws.conversationId = null;
          break;
        }

        case "call_start": {
          const { callId, conversationId, receiverId } = data;
          const callerId = userId;

          if (!callId || !conversationId || !receiverId) {
            ws.send(JSON.stringify({ error: "Missing call, conversation or receiver" }));
            break;
          }

          try {
            const conversation = await queryOne(
              `SELECT id, user_id AS "userId", therapist_id AS "therapistId"
                 FROM conversations
                WHERE id = $1
                  AND (user_id = $2 OR therapist_id = $2)
                LIMIT 1`,
              [conversationId, callerId]
            );
            if (!conversation) {
              ws.send(JSON.stringify({ error: "Conversation not found or you are not a participant" }));
              break;
            }
            const otherId =
              conversation.userId === callerId ? conversation.therapistId : conversation.userId;
            if (receiverId !== otherId) {
              ws.send(JSON.stringify({ error: "You can only call the other participant" }));
              break;
            }

            const call = await queryOne(
              `SELECT id, conversation_id, caller_id, receiver_id, room_id, status
                 FROM video_calls
                WHERE id = $1 AND conversation_id = $2
                LIMIT 1`,
              [callId, conversationId]
            );
            if (!call || call.caller_id !== callerId || call.receiver_id !== receiverId) {
              ws.send(JSON.stringify({ error: "Call not found or you are not the caller" }));
              break;
            }
            if (call.status !== "outgoing") {
              ws.send(JSON.stringify({ error: "Call is no longer available" }));
              break;
            }

            const ringingCall = await queryOne(
              `UPDATE video_calls
                  SET status = 'ringing'
                WHERE id = $1 AND status = 'outgoing'
                RETURNING id`,
              [callId]
            );
            if (!ringingCall) {
              ws.send(JSON.stringify({ error: "Call is no longer available" }));
              break;
            }

            setCallTimer(callId, CALL_TIMEOUT_MS, async () => {
              try {
                const call = await queryOne(
                  `SELECT conversation_id, status FROM video_calls WHERE id = $1 LIMIT 1`,
                  [callId]
                );
                if (call && call.status === "ringing") {
                  await queryOne(
                    `UPDATE video_calls SET status = 'missed', ended_at = now() WHERE id = $1`,
                    [callId]
                  );
                  broadcastToConversation(call.conversation_id, { type: "call_missed", callId });
                }
              } finally {
                clearCallTimer(callId);
              }
            });

            broadcastToConversation(conversationId, {
              type: "call_incoming",
              callId,
              conversationId,
              callerId,
              roomId: call.room_id,
            });

            ws.send(JSON.stringify({ ok: true, callId, roomId: call.room_id }));
          } catch (err) {
            ws.send(JSON.stringify({ error: err.message || "Failed to start call" }));
          }
          break;
        }

        case "call_accept": {
          /** @type {string} */
          const { callId } = data;
          const receiverId = userId;

          if (!callId) {
            ws.send(JSON.stringify({ error: "Missing call id" }));
            break;
          }

          try {
            const call = await queryOne(
              `SELECT id, conversation_id, caller_id, receiver_id, room_id, status
                 FROM video_calls
                WHERE id = $1 LIMIT 1`,
              [callId]
            );
            if (!call) {
              ws.send(JSON.stringify({ error: "Call not found" }));
              break;
            }
            if (call.receiver_id !== receiverId) {
              ws.send(JSON.stringify({ error: "Only the receiver can accept" }));
              break;
            }
            if (call.status !== "accepted") {
              ws.send(JSON.stringify({ error: "Call was not accepted" }));
              break;
            }

            clearCallTimer(callId);

            broadcastToConversation(call.conversation_id, {
              type: "call_accepted",
              callId,
              conversationId: call.conversation_id,
              roomId: call.room_id,
            });

            ws.send(JSON.stringify({ ok: true, roomId: call.room_id }));
          } catch (err) {
            ws.send(JSON.stringify({ error: err.message || "Failed to accept call" }));
          }
          break;
        }

        case "call_reject": {
          /** @type {string} */
          const { callId } = data;
          const receiverId = userId;

          if (!callId) {
            ws.send(JSON.stringify({ error: "Missing call id" }));
            break;
          }

          try {
            const call = await queryOne(
              `SELECT id, conversation_id, caller_id, receiver_id, status
                 FROM video_calls
                WHERE id = $1 LIMIT 1`,
              [callId]
            );
            if (!call) {
              ws.send(JSON.stringify({ error: "Call not found" }));
              break;
            }
            if (call.receiver_id !== receiverId) {
              ws.send(JSON.stringify({ error: "Only the receiver can reject" }));
              break;
            }
            if (call.status !== "rejected") {
              ws.send(JSON.stringify({ error: "Call was not declined" }));
              break;
            }

            clearCallTimer(callId);

            broadcastToConversation(call.conversation_id, {
              type: "call_rejected",
              callId,
              conversationId: call.conversation_id,
              rejectedBy: receiverId,
            });

            ws.send(JSON.stringify({ ok: true }));
          } catch (err) {
            ws.send(JSON.stringify({ error: err.message || "Failed to reject call" }));
          }
          break;
        }

        case "call_cancel": {
          /** @type {string} */
          const { callId } = data;
          const callerId = userId;

          if (!callId) {
            ws.send(JSON.stringify({ error: "Missing call id" }));
            break;
          }

          try {
            const call = await queryOne(
              `SELECT id, conversation_id, caller_id, status
                 FROM video_calls
                WHERE id = $1 LIMIT 1`,
              [callId]
            );
            if (!call) {
              ws.send(JSON.stringify({ error: "Call not found" }));
              break;
            }
            if (call.caller_id !== callerId) {
              ws.send(JSON.stringify({ error: "Only the caller can cancel" }));
              break;
            }
            if (call.status !== "cancelled") {
              ws.send(JSON.stringify({ error: "Call was not cancelled" }));
              break;
            }

            clearCallTimer(callId);

            broadcastToConversation(call.conversation_id, {
              type: "call_cancelled",
              callId,
              conversationId: call.conversation_id,
              cancelledBy: callerId,
            });

            ws.send(JSON.stringify({ ok: true }));
          } catch (err) {
            ws.send(JSON.stringify({ error: err.message || "Failed to cancel call" }));
          }
          break;
        }

        case "call_end": {
          /** @type {string} */
          const { callId } = data;
          const actorId = userId;

          if (!callId) {
            ws.send(JSON.stringify({ error: "Missing call id" }));
            break;
          }

          try {
            const call = await queryOne(
              `SELECT id, conversation_id, caller_id, receiver_id, status
                 FROM video_calls
                WHERE id = $1 LIMIT 1`,
              [callId]
            );
            if (!call) {
              ws.send(JSON.stringify({ error: "Call not found" }));
              break;
            }
            if (call.caller_id !== actorId && call.receiver_id !== actorId) {
              ws.send(JSON.stringify({ error: "You are not a participant in this call" }));
              break;
            }
            if (call.status !== "ended") {
              ws.send(JSON.stringify({ error: "Call was not ended" }));
              break;
            }

            clearCallTimer(callId);

            broadcastToConversation(call.conversation_id, {
              type: "call_ended",
              callId,
              conversationId: call.conversation_id,
              endedBy: actorId,
            });

            ws.send(JSON.stringify({ ok: true }));
          } catch (err) {
            ws.send(JSON.stringify({ error: err.message || "Failed to end call" }));
          }
          break;
        }

        case "call_busy": {
          /** @type {string} */
          const { callId } = data;
          const receiverId = userId;

          if (!callId) {
            ws.send(JSON.stringify({ error: "Missing call id" }));
            break;
          }

          try {
            const call = await queryOne(
              `SELECT id, conversation_id, caller_id, receiver_id, status
                 FROM video_calls
                WHERE id = $1 LIMIT 1`,
              [callId]
            );
            if (!call) {
              ws.send(JSON.stringify({ error: "Call not found" }));
              break;
            }
            if (call.receiver_id !== receiverId) {
              ws.send(JSON.stringify({ error: "Only the receiver can mark busy" }));
              break;
            }

            await queryOne(
              `UPDATE video_calls SET status = 'rejected', ended_at = now() WHERE id = $1`,
              [callId]
            );
            clearCallTimer(callId);

            broadcastToConversation(call.conversation_id, {
              type: "call_busy",
              callId,
              conversationId: call.conversation_id,
              busyBy: receiverId,
            });

            ws.send(JSON.stringify({ ok: true }));
          } catch (err) {
            ws.send(JSON.stringify({ error: err.message || "Failed to mark busy" }));
          }
          break;
        }

        case "call_failed": {
          /** @type {string} */
          const { callId } = data;
          const actorId = userId;

          if (!callId) {
            ws.send(JSON.stringify({ error: "Missing call id" }));
            break;
          }

          try {
            const call = await queryOne(
              `SELECT id, conversation_id, caller_id, receiver_id, status
                 FROM video_calls
                WHERE id = $1 LIMIT 1`,
              [callId]
            );
            if (!call) {
              ws.send(JSON.stringify({ error: "Call not found" }));
              break;
            }
            if (call.caller_id !== actorId && call.receiver_id !== actorId) {
              ws.send(JSON.stringify({ error: "You are not a participant in this call" }));
              break;
            }

            await queryOne(
              `UPDATE video_calls SET status = 'failed', ended_at = now() WHERE id = $1`,
              [callId]
            );
            clearCallTimer(callId);

            broadcastToConversation(call.conversation_id, {
              type: "call_failed",
              callId,
              conversationId: call.conversation_id,
              failedBy: actorId,
            });

            ws.send(JSON.stringify({ ok: true }));
          } catch (err) {
            ws.send(JSON.stringify({ error: err.message || "Failed to report call failure" }));
          }
          break;
        }

        default:
          ws.send(JSON.stringify({ error: `Unknown message type: ${type}` }));
      }
    });

    ws.on("close", () => {
      // Notify conversation rooms that this user disconnected.
      if (ws.conversationId) {
        broadcastToConversation(ws.conversationId, {
          type: "call_user_disconnected",
          userId,
        });
        const set = conversationClients.get(ws.conversationId);
        set && set.delete(ws);
      }
    });

    ws.on("error", () => {
      // Ignore errors; the close handler will clean up.
    });
  });

  return { wss, httpServer };
}
