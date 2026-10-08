"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, clearSession, readSession, type AuthUser } from "@/lib/api";
import { portalFor, type PortalMeta, type Role } from "@/lib/portals";

interface MeResponse {
  user: AuthUser;
  profile: Record<string, unknown> | null;
  next: string;
}

/**
 * What is already in the browser before the form is shown.
 *
 * Every portal has its own accounts, so an auth page must not quietly accept a
 * session that belongs to another portal: it either tells you where you are
 * signed in, or shows the form.
 */
export type SessionGateState =
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "same"; user: AuthUser; next: string }
  | { kind: "wrong"; user: AuthUser; actual: PortalMeta | null };

export function useSessionGate(role: Role): {
  state: SessionGateState;
  signOut: () => Promise<void>;
} {
  // Tagged with the portal it was checked for: switching portal means
  // "checking" again without an effect having to write state synchronously.
  const [result, setResult] = useState<{ role: Role; state: SessionGateState } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!readSession()) {
        if (!cancelled) setResult({ role, state: { kind: "none" } });
        return;
      }

      try {
        const data = await apiFetch<MeResponse>("/api/me");
        if (cancelled) return;
        if (data.user.role === role) {
          setResult({ role, state: { kind: "same", user: data.user, next: data.next } });
        } else {
          setResult({
            role,
            state: { kind: "wrong", user: data.user, actual: portalFor(data.user.role) },
          });
        }
      } catch {
        // Expired, revoked or unreachable — start from a clean slate.
        clearSession();
        if (!cancelled) setResult({ role, state: { kind: "none" } });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const signOut = useCallback(async () => {
    if (readSession()) {
      // Best effort: the local session is cleared either way.
      await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    }
    clearSession();
    setResult({ role, state: { kind: "none" } });
  }, [role]);

  const state: SessionGateState =
    result && result.role === role ? result.state : { kind: "checking" };

  return { state, signOut };
}
