"use client";

import { useParams } from "next/navigation";

import { usePortalGuard, GuardSplash, SignedOutPanel, WrongPortalPanel } from "@/components/portal-guard";
import { DashboardShell, DashboardCard, JourneyCard } from "@/components/dashboard";
import { EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { portalFor } from "@/lib/portals";

export default function AdvisorEthicsPage() {
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
        <DashboardCard title="Clinical Advisor – Ethics agreement">
          <EmptyState
            icon={<Icon name="ethics" className="h-5 w-5" />}
            title="Ethics guidance and agreements"
            description="The clinic's code of conduct, who has acknowledged it and when each document is next reviewed will all appear here."
          />
        </DashboardCard>
      </div>
    </DashboardShell>
  );
}
