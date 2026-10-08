"use client";

import { useParams } from "next/navigation";

import { usePortalGuard, GuardSplash, SignedOutPanel, WrongPortalPanel } from "@/components/portal-guard";
import { DashboardShell, DashboardCard, JourneyCard } from "@/components/dashboard";
import { portalFor } from "@/lib/portals";

export default function ClinicEthicsPage() {
  const role = useParams<{ role: string }>().role;
  const guard = usePortalGuard(role);
  const portal = portalFor(role);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "wrong-portal") return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;

  return (
    <DashboardShell portal={portal!} user={guard.user}>
      <JourneyCard portal={portal!} completedCount={0} />
      <div className="mt-6 space-y-6">
        <DashboardCard title="Collaborative Clinic – Ethics agreement">
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            Organizational ethics agreements and compliance materials will live here.
          </p>
        </DashboardCard>
      </div>
    </DashboardShell>
  );
}