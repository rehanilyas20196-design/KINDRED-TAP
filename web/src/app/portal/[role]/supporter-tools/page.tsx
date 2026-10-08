"use client";

import { useParams } from "next/navigation";

import Link from "next/link";
import { usePortalGuard, GuardSplash, SignedOutPanel, WrongPortalPanel } from "@/components/portal-guard";
import { DashboardShell, DashboardCard, JourneyCard } from "@/components/dashboard";
import { portalFor } from "@/lib/portals";
import { EthicsBadge } from "@/components/ethics-badge";

export default function SupporterToolsPage() {
  const role = useParams<{ role: string }>().role;
  const guard = usePortalGuard(role);
  const portal = portalFor(role);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }
  if (guard.kind === "signed-out") return <SignedOutPanel />;

  return (
    <DashboardShell portal={portal!} user={guard.user}>
      <JourneyCard portal={portal!} completedCount={2} />
      <div className="mt-6 space-y-6">
        <EthicsBadge roleTitle="Peer Supporter" />

        <DashboardCard title="Supporter Tools & Session Management">
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            Access your active peer support workspace, manage matched requests, debrief completed sessions, and escalate safeguarding concerns.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/portal/supporter/supporter-session"
              className="inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800"
            >
              Open Peer Support Workspace →
            </Link>
          </div>
        </DashboardCard>
      </div>
    </DashboardShell>
  );
}