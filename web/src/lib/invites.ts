/**
 * QR invite API client.
 *
 * Mirrors `api/src/routes/invite.routes.js`. Owner routes need the session
 * token (see `apiFetch`); scanner routes are public because the capability is
 * the invite code printed in the QR.
 */
import { apiFetch, apiPost } from "@/lib/api";

/** The two portals whose accounts can issue QR invites. */
export type InviteRole = "collaborative_clinic" | "supporter";

export type InviteStatus =
  | "pending"
  | "approved"
  | "declined"
  | "used"
  | "revoked";

/** An owner-side row, as returned by generate/list/pending. */
export interface InviteRecord {
  id: string;
  code: string;
  role: string;
  status: InviteStatus;
  joinerEmail: string | null;
  joinerFullName: string | null;
  joinerNote: string | null;
  requestedAt: string | null;
  decisionAt: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Response of POST /api/invites/generate. */
export interface GeneratedInvite {
  invite: Pick<InviteRecord, "id" | "code" | "role" | "status" | "expiresAt" | "createdAt">;
  joinUrl: string;
  qrPayload: string;
  message: string;
}

/** What the join page may show a stranger (no owner details leak here). */
export interface ScannerView {
  code: string;
  role: string;
  /** waiting | awaiting_decision | declined | used | revoked */
  state: string;
  email: string | null;
  decisionAt: string | null;
}

/** Response of POST /api/invites/:code/claim after the owner accepted. */
export interface ClaimResponse {
  ok: true;
  token: string;
  user: { id: string; email: string; fullName: string | null; role: string; status: string };
  next: string;
}

/* ------------------------------------------------------------------ */
/* Owner routes                                                        */
/* ------------------------------------------------------------------ */

export function generateInvite(role: InviteRole): Promise<GeneratedInvite> {
  return apiPost<GeneratedInvite>("/api/invites/generate", { role });
}

export function listInvites(): Promise<{ invites: InviteRecord[] }> {
  return apiFetch<{ invites: InviteRecord[] }>("/api/invites");
}

export function listPendingRequests(): Promise<{ requests: InviteRecord[] }> {
  return apiFetch<{ requests: InviteRecord[] }>("/api/invites/pending");
}

export function acceptInvite(id: string): Promise<{ ok: true; invite: InviteRecord }> {
  return apiPost(`/api/invites/${id}/accept`, {});
}

export function declineInvite(id: string): Promise<{ ok: true; invite: InviteRecord }> {
  return apiPost(`/api/invites/${id}/decline`, {});
}

export function revokeInvite(id: string): Promise<{ ok: true; invite: InviteRecord }> {
  return apiPost(`/api/invites/${id}/revoke`, {});
}

/* ------------------------------------------------------------------ */
/* Scanner routes (public)                                             */
/* ------------------------------------------------------------------ */

export function fetchInviteStatus(code: string): Promise<ScannerView> {
  return apiFetch<ScannerView>(`/api/invites/${encodeURIComponent(code)}/status`);
}

export function scanInvite(
  code: string,
  body: { email: string; fullName: string; note?: string; device?: string }
): Promise<{ ok: true } & ScannerView> {
  return apiPost(`/api/invites/${encodeURIComponent(code)}/scan`, body);
}
