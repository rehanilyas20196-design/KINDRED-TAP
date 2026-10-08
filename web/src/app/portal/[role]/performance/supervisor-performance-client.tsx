"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SupervisorPage } from "@/components/supervisor/shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageTitle,
  SectionTitle,
  type Tone,
} from "@/components/ui";
import { SegmentedControl } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import { fetchTeam, statusLabel, statusTone, type TeamList, type TeamMember } from "@/lib/supervisor";

const UI_TONE: Record<string, Tone> = {
  teal: "accent",
  slate: "neutral",
  amber: "warning",
  rose: "danger",
  emerald: "success",
  sky: "info",
};

function uiTone(tone: string): Tone {
  return tone in UI_TONE ? UI_TONE[tone] : "neutral";
}

type View = "all" | "needs_support" | "high_load";

function StatTile({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <div className="card p-4">
      <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function SupervisorPerformanceClient() {
  const [data, setData] = useState<TeamList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("all");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchTeam()
      .then(setData)
      .catch((err) => setError(messageFor(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const team = data?.team ?? [];
  const filtered = team.filter((member) => {
    if (view === "needs_support") {
      return member.supervision.status === "overdue" || member.supervision.status === "never" || member.documentationPending > 0;
    }
    if (view === "high_load") return member.workload.band === "overloaded";
    return true;
  });

  return (
    <SupervisorPage>
      <PageTitle description="Indicators to identify where support, supervision, training or intervention may be required. Not a single score.">
        Performance
      </PageTitle>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load performance indicators"
            description={error}
            action={<Button onClick={load}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading performance indicators" />
        ) : !data ? (
          <EmptyState
            title="No performance data yet"
            description="Team indicators will appear here once practitioners have activity."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Practitioners" value={data.counts.total} />
              <StatTile label="Needing supervision" value={data.counts.needingSupervision} />
              <StatTile label="Documentation pending" value={team.reduce((sum, m) => sum + m.documentationPending, 0)} />
              <StatTile label="High workload" value={data.counts.highWorkload} />
            </div>

            <div className="mt-5">
              <SegmentedControl
                options={[
                  { value: "all", label: "Everyone" },
                  { value: "needs_support", label: "Needs support" },
                  { value: "high_load", label: "High load" },
                ]}
                value={view}
                onChange={setView}
                ariaLabel="Filter performance view"
              />
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {filtered.length === 0 ? (
                <div className="sm:col-span-2">
                  <EmptyState title="Nothing to flag" description="No practitioner matches this view." />
                </div>
              ) : (
                filtered.map((member) => <MemberCard key={member.id} member={member} />)
              )}
            </div>
          </>
        )}
      </div>
    </SupervisorPage>
  );
}

function MemberCard({ member }: { member: TeamMember }) {
  const flags: string[] = [];
  if (member.supervision.status === "overdue") flags.push("Supervision overdue");
  if (member.supervision.status === "never") flags.push("No supervision recorded");
  if (member.documentationPending > 0) flags.push(`${member.documentationPending} note(s) incomplete`);
  if (member.openEscalations > 0) flags.push(`${member.openEscalations} open escalation(s)`);
  if (member.workload.band === "overloaded") flags.push("High workload");

  return (
    <Card>
      <SectionTitle detail={<Badge tone={uiTone(statusTone(member.supervision.status))}>{statusLabel(member.supervision.status)}</Badge>}>
        {member.fullName}
      </SectionTitle>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">Clients</dt><dd className="text-slate-700">{member.activeClients}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Sessions / wk</dt><dd className="text-slate-700">{member.sessionsThisWeek}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Open reviews</dt><dd className="text-slate-700">{member.openCaseReviews}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Interventions</dt><dd className="text-slate-700">{member.openInterventions}</dd></div>
      </dl>
      {flags.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-amber-700">
          {flags.map((flag) => (
            <li key={flag}>• {flag}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-emerald-700">No indicators require support right now.</p>
      )}
      <Link href={`/portal/clinical_supervisor/team/${member.id}`} className="mt-3 inline-block text-xs font-semibold text-teal-700">
        Open profile
      </Link>
    </Card>
  );
}
