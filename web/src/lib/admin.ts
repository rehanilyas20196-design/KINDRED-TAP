/**
 * Admin panel data layer.
 *
 * The admin session lives under its own storage key, so a portal session and
 * an admin session can never be confused for one another in the browser. The
 * API enforces the same separation: every /api/admin route rejects a portal
 * token, and every portal route rejects an admin token.
 */

import { API_BASE, ApiError, type FieldIssue } from "@/lib/api";

const ADMIN_SESSION_KEY = "kindredTap.admin";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  role: string | null;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy?: string | null;
  termsAcceptedAt: string | null;
  ethicsAgreedAt?: string | null;
  ethicsVersion?: string | null;
  ethicsAccepted: boolean;
  lastLoginAt: string | null;
  onboardedAt?: string | null;
  personalityType?: string | null;
  personalityLabel?: string | null;
  createdAt: string;
}

export interface AdminUserList {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminStats {
  total: number;
  pendingReview: number;
  pendingProfile: number;
  active: number;
  rejected: number;
  suspended: number;
  byRole: Record<string, number>;
  /** Per portal, how many accounts sit in each status. */
  byRoleStatus: Record<string, Record<string, number>>;
  configured: boolean;
}

export interface AdminUserDetail {
  user: AdminUser;
  profile: Record<string, unknown> | null;
}

/* ------------------------------------------------------------------ */
/* Ask Cube knowledge base                                             */
/* ------------------------------------------------------------------ */

export interface AdminKbDocument {
  id: string;
  source: string;
  title: string;
  kind: string;
  /** Shipped by the sync (site copy, datasets) rather than added by hand. */
  managed: boolean;
  chunkCount: number;
  embeddedChunks: number;
  indexedAt: string | null;
  updatedAt: string | null;
}

export interface AdminKbSyncRun {
  status: string;
  documentsSeen: number;
  documentsIndexed: number;
  documentsRemoved: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AdminKbStats {
  configured: boolean;
  documents: number;
  chunks: number;
  /** Similarity floor a document must clear to be cited. */
  minScore: number;
  /** Share of the question's words a document must contain to be cited. */
  keywordMin: number;
  byKind: Record<string, number> | null;
  lastSync: AdminKbSyncRun | null;
}

export interface AdminKbDocumentList {
  documents: AdminKbDocument[];
  stats: AdminKbStats;
}

export interface AdminKbIndexResult {
  results: { source: string; title: string; status: string; chunks: number }[];
  stats: AdminKbStats;
  sync?: {
    documents: number;
    indexed: number;
    removed: number;
    warnings: string[];
    failed: string[];
    durationMs: number;
  };
}

export function saveAdminSession(token: string): void {
  try {
    localStorage.setItem(ADMIN_SESSION_KEY, token);
  } catch {
    // Private browsing or storage disabled — the session just will not persist.
  }
}

export function readAdminSession(): string | null {
  try {
    return localStorage.getItem(ADMIN_SESSION_KEY);
  } catch {
    return null;
  }
}

export function clearAdminSession(): void {
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // Nothing to clean up.
  }
}

export async function adminFetch<T>(
  path: string,
  options: { method: string; body?: unknown } = { method: "GET" }
): Promise<T> {
  const token = readAdminSession();

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error(`Could not reach the server at ${API_BASE}. Is the API running?`);
  }

  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string; fields?: FieldIssue[] })
    | null;

  if (!response.ok) {
    throw new ApiError(
      data?.error ?? "Something went wrong. Please try again.",
      response.status,
      data?.fields
    );
  }

  return data as T;
}

/** Session expiry is the one failure the panel recovers from by signing in again. */
export function isAuthFailure(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const STATUS_TONE: Record<
  string,
  "neutral" | "accent" | "success" | "warning" | "danger" | "info"
> = {
  pending_review: "warning",
  pending_profile: "info",
  pending_portal: "neutral",
  active: "success",
  rejected: "danger",
  suspended: "danger",
};

export const STATUS_LABEL: Record<string, string> = {
  pending_review: "Awaiting verification",
  pending_profile: "Profile incomplete",
  pending_portal: "No portal yet",
  active: "Active",
  rejected: "Rejected",
  suspended: "Suspended",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Human label for a profile field name stored as snake_case by the API. */
export function humanize(key: string): string {
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Value for the detail drawer: readable, never an object dump. */
export function displayValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const items = value
      .map((entry) =>
        typeof entry === "object" && entry !== null
          ? String((entry as { label?: string; value?: string }).label ?? JSON.stringify(entry))
          : String(entry)
      )
      .filter(Boolean);
    return items.length ? items.join(", ") : null;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
