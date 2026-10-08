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
import { SegmentedControl, inputClass } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import {
  fetchTeam,
  formatDay,
  statusLabel,
  statusTone,
  type TeamList,
  type TeamMember,
} from "@/lib/supervisor";

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

function humanLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/(^|\s)\S/g, (chunk) => chunk.toUpperCase());
}

const FILTERS = [
  { value: "", label: "All" },
  { value: "needs_supervision", label: "Needs supervision" },
  { value: "high_workload", label: "High workload" },
  { value: "open_concern", label: "Open concern" },
  { value: "open_escalation", label: "Open escalation" },
  { value: "documentation", label: "Documentation" },
];

function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  if (value <= 0) return null;
  return (
    <div className="card p-4">
      <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function SupervisorTeamClient() {
  const [data, setData] = useState<TeamList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTeam({ role, filter, q });
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [role, filter, q]);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const counts = data?.counts;

  return (
    <SupervisorPage>
      <PageTitle description="The team assigned to your supervision: caseload, supervision status and open concerns.">
        Therapists &amp; Supporters
      </PageTitle>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Practitioners"
          value={counts?.total ?? 0}
          hint={`${counts?.therapists ?? 0} therapists · ${counts?.supporters ?? 0} supporters`}
        />
        <StatTile label="Needing supervision" value={counts?.needingSupervision ?? 0} />
        <StatTile label="Open concerns" value={counts?.openConcerns ?? 0} />
        <StatTile label="Open escalations" value={counts?.openEscalations ?? 0} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SegmentedControl
          options={[{ value: "", label: "Everyone" }, { value: "therapist", label: "Therapists" }, { value: "supporter", label: "Supporters" }]}
          value={role}
          onChange={setRole}
          ariaLabel="Filter by role"
        />
        <select
          aria-label="Filter team"
          className={`${inputClass} w-full sm:w-52`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {FILTERS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <div className="relative w-full sm:min-w-56 sm:flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            aria-label="Search team"
            placeholder="Search by name"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load the team"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading the team" />
        ) : !data || data.team.length === 0 ? (
          <EmptyState title="No practitioners found" description="No active therapists or supporters match this view." />
        ) : (
          <Card>
            <SectionTitle detail={`${data.total} total`}>Team</SectionTitle>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <caption className="sr-only">Therapists and supporters with supervision and caseload status</caption>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th scope="col" className="py-2 pr-3">Name</th>
                    <th scope="col" className="py-2 pr-3">Role</th>
                    <th scope="col" className="py-2 pr-3">Specialization</th>
                    <th scope="col" className="py-2 pr-3">Clients</th>
                    <th scope="col" className="py-2 pr-3">Sessions</th>
                    <th scope="col" className="py-2 pr-3">Supervision</th>
                    <th scope="col" className="py-2 pr-3">Documentation</th>
                    <th scope="col" className="py-2 pr-3">Concerns</th>
                    <th scope="col" className="py-2 pr-3">Escalations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.team.map((member) => (
                    <MemberRow key={member.id} member={member} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </SupervisorPage>
  );
}

function MemberRow({ member }: { member: TeamMember }) {
  return (
    <tr className="align-top">
      <td className="py-3 pr-3">
        <Link href={`/portal/clinical_supervisor/team/${member.id}`} className="font-semibold text-teal-700">
          {member.fullName}
        </Link>
      </td>
      <td className="py-3 pr-3 capitalize text-slate-600">{humanLabel(member.role)}</td>
      <td className="py-3 pr-3 text-slate-600">{member.specialization ?? "-"}</td>
      <td className="py-3 pr-3 text-slate-600">{member.activeClients}</td>
      <td className="py-3 pr-3 text-slate-600">{member.sessionsThisWeek} this week</td>
      <td className="py-3 pr-3">
        <Badge tone={uiTone(statusTone(member.supervision.status))}>{statusLabel(member.supervision.status)}</Badge>
        <p className="mt-1 text-[11px] text-slate-500">
          Next {member.supervision.nextDue ? <time dateTime={member.supervision.nextDue}>{formatDay(member.supervision.nextDue)}</time> : "-"}
        </p>
      </td>
      <td className="py-3 pr-3">
        {member.documentationPending > 0 ? (
          <Badge tone="warning">{member.documentationPending} pending</Badge>
        ) : (
          <Badge tone="success">Up to date</Badge>
        )}
      </td>
      <td className="py-3 pr-3 text-slate-600">{member.openConcerns}</td>
      <td className="py-3 pr-3 text-slate-600">{member.openEscalations}</td>
    </tr>
  );
}
