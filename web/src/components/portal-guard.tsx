"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  apiFetch,
  clearSession,
  messageFor,
  readSession,
  type AuthUser,
} from "@/lib/api";
import { loginPath, portalFor, type PortalMeta } from "@/lib/portals";
import { Logo } from "@/components/logo";
import { Spinner, primaryButtonClass } from "@/components/ui";

export interface MeProfile {
  profile: Record<string, unknown> | null;
}

interface MeResponse {
  user: AuthUser;
  profile: Record<string, unknown> | null;
  next: string;
}

export type PortalGuardState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "wrong-portal"; user: AuthUser; expected: PortalMeta; actual: PortalMeta | null }
  | { kind: "ready"; user: AuthUser; portal: PortalMeta; profile: Record<string, unknown> | null; next: string };

/**
 * Guards a portal page: requires a live session, resolves the signed-in user's
 * portal from the API (never the URL) and loads the saved profile if one
 * exists. Renders children only in the `ready` state.
 */
export function usePortalGuard(role: string): PortalGuardState {
  const router = useRouter();
  const [state, setState] = useState<PortalGuardState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = readSession();
      if (!token) {
        setState({ kind: "signed-out" });
        return;
      }

      try {
        const data = await apiFetch<MeResponse>("/api/me");
        if (cancelled) return;

        const portal = portalFor(data.user.role);
        if (data.user.role !== role) {
          setState({
            kind: "wrong-portal",
            user: data.user,
            expected: portalFor(role) ?? portalFor("user")!,
            actual: portal,
          });
          return;
        }

        setState({
          kind: "ready",
          user: data.user,
          portal: portal ?? portalFor("user")!,
          profile: data.profile,
          next: data.next,
        });
      } catch (error) {
        if (cancelled) return;
        if (messageFor(error).includes("Session expired") || messageFor(error).includes("Invalid token")) {
          clearSession();
          setState({ kind: "signed-out" });
          return;
        }
        // Network or server failure — send the person to login rather than
        // looping on a broken session.
        clearSession();
        setState({ kind: "signed-out" });
        router.replace(loginPath(role));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [role, router]);

  return state;
}

export function GuardSplash({
  label = "Loading your portal...",
  children,
}: {
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-100 dark:bg-slate-950">
      <Logo className="h-14 w-auto" />
      {label ? (
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Spinner className="h-4 w-4 text-teal-700" />
          {label}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function SignedOutPanel() {
  const pathname = usePathname();
  // /portal/<role>/... → send them back to that portal's own sign-in page.
  const loginHref = loginPath(pathname.split("/")[2]);

  return (
    <GuardSplash label="">
      <div className="card max-w-sm p-6 text-center">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Your session ended</p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Sign in again to continue to your portal.
        </p>
        <Link href={loginHref} className={`${primaryButtonClass} mt-5`}>
          Log in
        </Link>
      </div>
    </GuardSplash>
  );
}

export function WrongPortalPanel({
  expected,
  actual,
}: {
  expected: PortalMeta;
  actual: PortalMeta | null;
}) {
  const pathname = usePathname();
  const signOutTarget = loginPath(pathname.split("/")[2]);

  function signOut() {
    clearSession();
    window.location.assign(signOutTarget);
  }

  return (
    <GuardSplash label="">
      <div className="card max-w-sm p-6 text-center">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          This page belongs to the {expected.portal}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {actual
            ? `Your account is registered with the ${actual}.`
            : "Your account does not have a portal yet."}
        </p>
        <Link
          href={actual ? `/portal/${actual.key}/profile` : "/login"}
          className={`${primaryButtonClass} mt-5`}
        >
          Go to your portal
        </Link>
        <div className="mt-3">
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 transition hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:text-slate-300 dark:hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </GuardSplash>
  );
}
