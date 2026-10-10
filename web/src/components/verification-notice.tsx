"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button, Spinner, primaryButtonClass } from "@/components/ui";
import { AuthCard } from "@/components/auth";
import {
  apiFetch,
  clearSession,
  messageFor,
  readSession,
  type AuthUser,
} from "@/lib/api";

interface MeResponse {
  user: AuthUser;
  profile: Record<string, unknown> | null;
  next: string;
}

/**
 * The screen an account sits on while the admin decides, and after a refusal.
 * It answers one question - has this account been reviewed yet - straight from
 * /api/me, so it never has to guess at a rule the API also owns.
 */
export function VerificationNotice() {
  const [state, setState] = useState<"loading" | "signed-out" | "pending" | "rejected" | "ready">(
    "loading"
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [next, setNext] = useState("/login");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!readSession()) {
        setState("signed-out");
        return;
      }

      try {
        const data = await apiFetch<MeResponse>("/api/me");
        if (cancelled) return;
        setUser(data.user);
        setNext(data.next);

        if (data.user.status === "pending_review") setState("pending");
        else if (data.user.status === "rejected") setState("rejected");
        else setState("ready");
      } catch (err) {
        if (cancelled) return;
        const message = messageFor(err);
        if (message.includes("Session expired") || message.includes("Invalid token")) {
          clearSession();
          setState("signed-out");
          return;
        }
        setError(message);
      }
    }

    loadRef.current = load;
    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    await loadRef.current();
    setRefreshing(false);
  }

  function signOut() {
    void apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSession();
    setState("signed-out");
  }

  if (state === "loading") {
    return (
      <Shell>
        <AuthCard>
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500 dark:text-slate-400">
            <Spinner className="h-4 w-4 text-teal-700" />
            Checking your account…
          </p>
        </AuthCard>
      </Shell>
    );
  }

  if (state === "signed-out") {
    return (
      <Shell>
        <AuthCard>
          <div className="py-4 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Sign in to check your account
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
              We will show you whether your account has been verified yet.
            </p>
            <Link href="/login" className={`${primaryButtonClass} mt-6`}>
              Sign in
            </Link>
          </div>
        </AuthCard>
      </Shell>
    );
  }

  if (state === "ready") {
    return (
      <Shell>
        <AuthCard>
          <div className="py-4 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path d="m5 12.5 4.5 4.5L19 7" />
              </svg>
            </span>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Your account is verified
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
              You can carry on into your portal.
            </p>
            <button type="button" onClick={() => window.location.assign(next)} className={`mt-6 ${primaryButtonClass}`}>
              Continue
            </button>
          </div>
        </AuthCard>
      </Shell>
    );
  }

  const pending = state === "pending";

  return (
    <Shell>
      <AuthCard>
        <div className="py-4 text-center">
          <span
            className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
              pending
                ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              {pending ? (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7.5V12l3 2" />
                </>
              ) : (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" />
                </>
              )}
            </svg>
          </span>

          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {pending ? "Your account is being verified" : "Your account was not approved"}
          </h1>

          <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {user ? `${user.fullName ? `${user.fullName} · ` : ""}${user.email}` : null}
          </p>

          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">
            {pending
              ? "A Kindred Tap admin checks every Clinical Advisor, Clinical Supervisor and Collaborative Clinic account by hand. Your portal stays locked until they finish - nothing you entered is lost."
              : "An admin reviewed your details and could not approve this account. You can read the reason below, then contact support if anything is missing."}
          </p>

          {!pending && user?.reviewNote ? (
            <p className="mx-auto mt-4 max-w-md rounded-xl bg-slate-50 px-4 py-3 text-left text-sm leading-6 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              <span className="font-semibold">Reason: </span>
              {user.reviewNote}
            </p>
          ) : null}

          {error ? (
            <p className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          <div className="mt-6 space-y-3">
            {pending ? (
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className={`${primaryButtonClass} flex items-center justify-center gap-2`}
              >
                {refreshing ? <Spinner className="h-4 w-4" /> : null}
                {refreshing ? "Checking..." : "Check again"}
              </button>
            ) : null}

            <Button variant="secondary" className="w-full" onClick={signOut}>
              Sign out
            </Button>
          </div>

          <p className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {pending
              ? "You can close this page and come back later - signing in again brings you straight here."
              : "Signing in again will always bring you back to this page until the account is approved."}
          </p>
        </div>
      </AuthCard>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 px-5 py-10 dark:bg-slate-950">
      <div className="mb-5 w-full max-w-md">
        <Logo className="mx-auto h-12 w-auto" />
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
