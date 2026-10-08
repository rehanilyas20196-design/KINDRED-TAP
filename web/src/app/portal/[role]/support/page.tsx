"use client";

import { useParams } from "next/navigation";

import { usePortalGuard, GuardSplash, SignedOutPanel, WrongPortalPanel } from "@/components/portal-guard";
import { DashboardShell, DashboardCard, JourneyCard } from "@/components/dashboard";
import { portalFor } from "@/lib/portals";
import Link from "next/link";

export default function SupportPortalPage() {
  const role = useParams<{ role: string }>().role;
  const guard = usePortalGuard(role);
  const portal = portalFor(role);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }

  return (
    <DashboardShell portal={portal!} user={guard.user}>
      <JourneyCard portal={portal!} completedCount={0} />
      <div className="mt-6 space-y-6">
        <DashboardCard title="Support resources">
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            This is a placeholder support portal page. The directory and messaging
            live under the user portal for now.
          </p>
          <Link
            href="/portal/user"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:text-white"
          >
            Go to user portal
          </Link>
        </DashboardCard>
      </div>
    </DashboardShell>
  );
}