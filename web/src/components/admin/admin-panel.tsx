"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminUsers } from "@/components/admin/admin-users";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { Logo } from "@/components/logo";
import {
  adminFetch,
  clearAdminSession,
  isAuthFailure,
  readAdminSession,
  type AdminStats,
} from "@/lib/admin";
import { messageFor } from "@/lib/api";

type PanelState = "checking" | "signed-out" | "ready";

/**
 * Shell for /admin. Nothing here is trusted for authorisation - the panel only
 * ever shows what /api/admin returns, and every route there refuses a portal
 * token, so a leaked admin session cannot be mixed into the product and a
 * leaked portal session cannot open the panel.
 */
export function AdminPanel() {
  const [state, setState] = useState<PanelState>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(() => {
    clearAdminSession();
    setEmail(null);
    setStats(null);
    setState("signed-out");
  }, []);

  useEffect(() => {
    let cancelled = false;

    // The session check is the first thing the panel does: without a live
    // admin token there is nothing to render but the sign-in form.
    async function start() {
      if (!readAdminSession()) {
        setState("signed-out");
        return;
      }

      try {
        const me = await adminFetch<{ email: string }>("/api/admin/me");
        if (cancelled) return;
        setEmail(me.email);
        setState("ready");

        const next = await adminFetch<AdminStats>("/api/admin/stats");
        if (!cancelled) setStats(next);
      } catch (error) {
        if (cancelled) return;
        if (isAuthFailure(error)) {
          signOut();
          return;
        }
        setStatsError(messageFor(error));
        setState("ready");
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  function onSignedIn(signedInEmail: string) {
    setEmail(signedInEmail);
    setState("ready");
    setStatsError(null);

    void adminFetch<AdminStats>("/api/admin/stats")
      .then((next) => setStats(next))
      .catch((error) => {
        if (isAuthFailure(error)) return signOut();
        setStatsError(messageFor(error));
      });
  }

  async function onSignOutClick() {
    setSigningOut(true);
    await adminFetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    setSigningOut(false);
    signOut();
  }

  if (state === "checking") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-100 dark:bg-slate-950">
        <Logo className="h-12 w-auto" />
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Spinner className="h-4 w-4 text-teal-700" />
          Checking your admin session…
        </p>
      </div>
    );
  }

  if (state === "signed-out") {
    return <AdminLogin onSignedIn={onSignedIn} />;
  }

  return (
    <div className="min-h-dvh bg-slate-100 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo className="h-9 w-auto" />
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                Admin panel
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{email}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            loading={signingOut}
            onClick={() => void onSignOutClick()}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        {statsError ? (
          <Alert tone="warning" title="Live counts are unavailable">
            {statsError}
          </Alert>
        ) : null}

        {stats && !stats.configured ? (
          <Alert tone="danger" title="Admin access is not configured">
            Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH in the API .env file, then restart the API.
          </Alert>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Awaiting verification"
            value={stats?.pendingReview ?? null}
            emphasis
          />
          <Metric label="Active accounts" value={stats?.active ?? null} />
          <Metric label="Rejected" value={stats?.rejected ?? null} />
          <Metric label="All accounts" value={stats?.total ?? null} />
        </section>

        {stats ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byRole).map(([role, count]) => (
              <Badge key={role} tone="neutral">
                {role.replace(/_/g, " ")} · {count}
              </Badge>
            ))}
          </div>
        ) : null}

        <AdminUsers onSessionLost={signOut} />
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number | null;
  emphasis?: boolean;
}) {
  return (
    <Card className={emphasis ? "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10" : ""}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {value === null ? "—" : value}
      </p>
    </Card>
  );
}
