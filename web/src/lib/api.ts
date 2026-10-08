/** Thin fetch wrapper for the Kindred Tap API. */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status: number, issues?: FieldIssue[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = Object.fromEntries((issues ?? []).map((issue) => [issue.path, issue.message]));
  }
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  status: string;
}

/** Shape returned by POST /api/auth/signup and POST /api/auth/login. */
export interface AuthResponse {
  token: string;
  user: AuthUser;
  portal?: string;
  next: string;
}

/**
 * Sends the session token whenever there is one.
 *
 * Every endpoint except signup, login and the public metadata routes needs it,
 * including GETs - /api/me decides which portal you belong to, so a GET without
 * the header gets a 401 and the portal guard bounces you to the login page.
 */
function authHeaders(): Record<string, string> {
  const token = readSession();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(
  path: string,
  options: { method: string; body?: unknown } = { method: "GET" }
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
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

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(body),
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

const SESSION_KEY = "kindredTap.session";

export function saveSession(token: string): void {
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    // Private browsing or storage disabled — the session just will not persist.
  }
}

export function readSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clean up.
  }
}

/** Field-level messages from a 422 response, keyed by input name. */
export function toFieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}

export function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
