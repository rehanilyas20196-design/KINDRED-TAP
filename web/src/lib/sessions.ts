/** Shapes and helpers for the /api/sessions routes. */

import { apiFetch } from "@/lib/api";

export type SessionMode = "online" | "phone" | "in_person";
export type SessionStatus = "scheduled" | "completed" | "cancelled";

export interface SessionFeedback {
  session_id?: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/**
 * A diary row: who, when, how long, how it went. Nothing about what was said
 * in the session ever appears in this shape.
 */
export interface TherapySession {
  id: string;
  userId: string;
  therapistId: string;
  userName: string | null;
  therapistName: string | null;
  scheduledAt: string;
  durationMinutes: number;
  mode: SessionMode;
  status: SessionStatus;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  feedback: SessionFeedback | null;
}

export interface SessionsResponse {
  sessions: TherapySession[];
  total: number;
}

export function fetchSessions(): Promise<SessionsResponse> {
  return apiFetch<SessionsResponse>("/api/sessions", { method: "GET" });
}

export function bookSession(input: {
  therapistId: string;
  scheduledAt: string;
  durationMinutes?: number;
  mode?: SessionMode;
}): Promise<{ session: TherapySession }> {
  return apiFetch<{ session: TherapySession }>("/api/sessions", {
    method: "POST",
    body: input,
  });
}

export function rescheduleSession(
  id: string,
  input: { scheduledAt: string; durationMinutes?: number; mode?: SessionMode }
): Promise<{ session: TherapySession }> {
  return apiFetch<{ session: TherapySession }>(`/api/sessions/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export function cancelSession(id: string, reason?: string): Promise<{ session: TherapySession }> {
  return apiFetch<{ session: TherapySession }>(`/api/sessions/${id}/cancel`, {
    method: "POST",
    body: reason ? { reason } : {},
  });
}

export function completeSession(id: string): Promise<{ session: TherapySession }> {
  return apiFetch<{ session: TherapySession }>(`/api/sessions/${id}/complete`, {
    method: "POST",
    body: {},
  });
}

export function submitSessionFeedback(
  id: string,
  input: { rating: number; comment?: string }
): Promise<{ feedback: SessionFeedback }> {
  return apiFetch<{ feedback: SessionFeedback }>(`/api/sessions/${id}/feedback`, {
    method: "POST",
    body: { rating: input.rating, comment: input.comment?.trim() || undefined },
  });
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

/** `2026-10-05T18:00:00.000Z` becomes `October 5, 2026 — 6:00 PM`. */
export function sessionDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} — ${time}`;
}

export function sessionDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function sessionTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function sessionModeLabel(mode: SessionMode): string {
  if (mode === "phone") return "Phone";
  if (mode === "in_person") return "In person";
  return "Online";
}

export function sessionStatusLabel(status: SessionStatus): string {
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Scheduled";
}

/**
 * Splits the diary into what is still ahead and everything behind it, so the
 * upcoming session can sit at the top without sorting twice in the UI.
 */
export function splitSessions(sessions: TherapySession[]): {
  upcoming: TherapySession[];
  past: TherapySession[];
} {
  const now = Date.now();
  const upcoming: TherapySession[] = [];
  const past: TherapySession[] = [];

  for (const session of sessions) {
    const isAhead = session.status === "scheduled" && Date.parse(session.scheduledAt) >= now;
    (isAhead ? upcoming : past).push(session);
  }

  past.reverse();
  return { upcoming, past };
}

/** Sessions waiting for a star rating: finished, and nobody has rated them. */
export function awaitingFeedback(sessions: TherapySession[]): TherapySession[] {
  return sessions.filter(
    (session) => session.status === "completed" && session.feedback === null
  );
}

