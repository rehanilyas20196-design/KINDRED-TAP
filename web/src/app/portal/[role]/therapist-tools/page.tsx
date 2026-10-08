"use client";

import { useParams } from "next/navigation";

import { usePortalGuard, GuardSplash, SignedOutPanel, WrongPortalPanel } from "@/components/portal-guard";
import { DashboardShell, DashboardCard, JourneyCard } from "@/components/dashboard";
import { LinkButton } from "@/components/ui";
import { portalFor } from "@/lib/portals";
import { EthicsBadge } from "@/components/ethics-badge";

export default function TherapistToolsPage() {
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
      <JourneyCard portal={portal!} completedCount={2} />
      <div className="mt-6 space-y-6">
        <EthicsBadge roleTitle="Licensed Therapist" />

        <DashboardCard title="Clinical tools and case management">
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            Open a consultation room, write SOAP notes, plan follow-ups, or raise a safeguarding
            concern from one place.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <LinkButton href="/portal/therapist/therapist-session" size="sm">
              Open therapy workspace
            </LinkButton>
            <LinkButton href="/portal/therapist/messages" variant="secondary" size="sm">
              View direct messages
            </LinkButton>
          </div>
        </DashboardCard>
      </div>
    </DashboardShell>
  );
}