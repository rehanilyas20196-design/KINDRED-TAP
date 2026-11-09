/**
 * WebSocket client for video call signaling.
 *
 * Connects to the API's WebSocket endpoint with the bearer token as a query
 * parameter. The server authenticates the connection before accepting any
 * signals. Clients join a conversation group so only the two participants
 * receive each other's call signals.
 */

import { readSession } from "@/lib/api";

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
const listeners = new Map<string, Set<(payload: unknown) => void>>();

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const WS_URL = API_URL.replace(/^http/, "ws") + "/api/calls/ws";

export function getSocket(): WebSocket {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;

  const token = readSession();
  const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;

  const socket = new WebSocket(url);
  ws = socket;

  socket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      const { type } = data;
      if (type && listeners.has(type)) {
        for (const fn of listeners.get(type)!) {
          fn(data);
        }
      }
    } catch {
      // Ignore malformed messages.
    }
  });

  socket.addEventListener("close", () => {
    ws = null;
    // Attempt to reconnect after a short delay.
    reconnectTimeout = setTimeout(() => {
      getSocket();
    }, 3000);
  });

  socket.addEventListener("error", () => {
    // Connection errors are handled by the close event.
  });

  return socket;
}

export function disconnectSocket(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

export interface CallEvents {
  call_incoming: {
    callId: string;
    conversationId: string;
    callerId: string;
    roomId: string;
  };
  call_accepted: {
    callId: string;
    conversationId: string;
    roomId: string;
  };
  call_rejected: {
    callId: string;
    conversationId: string;
    rejectedBy: string;
  };
  call_cancelled: {
    callId: string;
    conversationId: string;
    cancelledBy: string;
  };
  call_ended: {
    callId: string;
    conversationId: string;
    endedBy: string;
  };
  call_busy: {
    callId: string;
    conversationId: string;
    busyBy: string;
  };
  call_missed: {
    callId: string;
    conversationId: string;
  };
  call_failed: {
    callId: string;
    conversationId: string;
    failedBy: string;
  };
  call_user_disconnected: {
    userId: string;
  };
}

export type CallEventName = keyof CallEvents;

export function on<T extends CallEventName>(event: T, fn: (payload: unknown) => void): void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn as (payload: unknown) => void);
}

export function off<T extends CallEventName>(event: T, fn: (payload: unknown) => void): void {
  listeners.get(event)?.delete(fn as (payload: unknown) => void);
}

export function send(type: string, payload: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

export function joinConversation(conversationId: string): void {
  send("join_conversation", { conversationId });
}

export function leaveConversation(conversationId: string): void {
  send("leave_conversation", { conversationId });
}
