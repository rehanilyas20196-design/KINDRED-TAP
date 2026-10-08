"use client";

import { useParams } from "next/navigation";

import { usePortalGuard, GuardSplash, SignedOutPanel, WrongPortalPanel } from "@/components/portal-guard";
import { DashboardShell, DashboardCard, JourneyCard } from "@/components/dashboard";
import { EmptyState } from "@/components/ui";
import { portalFor } from "@/lib/portals";

export default function SupervisorEthicsPage() {
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
        <DashboardCard title="Ethics agreement">
          <EmptyState
            title="No ethics documentation yet"
            description="Ethics oversight documentation and signed agreements will appear here."
          />
        </DashboardCard>
      </div>
    </DashboardShell>
  );
}