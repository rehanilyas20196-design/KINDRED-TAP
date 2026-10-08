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
import { messageFor } from "@/lib/api";
import { fetchWorkload, type WorkloadList } from "@/lib/supervisor";

function humanLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/(^|\s)\S/g, (chunk) => chunk.toUpperCase());
}

function bandTone(band: string): Tone {
  if (band === "overloaded") return "danger";
  if (band === "underutilized") return "warning";
  if (band === "normal") return "success";
  return "neutral";
}

function StatTile({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <div className="card p-4">
      <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function SupervisorWorkloadClient() {
  const [data, setData] = useState<WorkloadList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchWorkload()
      .then(setData)
      .catch((err) => setError(messageFor(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <SupervisorPage>
      <PageTitle description="Caseload, sessions and follow-up load across the team. Bands identify where to look, not how well someone is doing.">
        Workload
      </PageTitle>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load workload"
            description={error}
            action={<Button onClick={load}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading workload" />
        ) : !data ? (
          <EmptyState title="No workload data yet" description="Team workload will appear once practitioners are active." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Overloaded" value={data.counts.overloaded} />
              <StatTile label="Normal" value={data.counts.normal} />
              <StatTile label="Underutilized" value={data.counts.underutilized} />
              <StatTile label="Needs review" value={data.counts.needsReview} />
            </div>

            <div className="mt-5">
              <Card>
                <SectionTitle detail="Reassignment requires authorisation">Team workload</SectionTitle>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[880px] text-sm">
                    <caption className="sr-only">Workload by practitioner</caption>
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th scope="col" className="py-2 pr-3">Practitioner</th>
                        <th scope="col" className="py-2 pr-3">Clients</th>
                        <th scope="col" className="py-2 pr-3">Sessions / week</th>
                        <th scope="col" className="py-2 pr-3">Upcoming</th>
                        <th scope="col" className="py-2 pr-3">Overdue docs</th>
                        <th scope="col" className="py-2 pr-3">Open reviews</th>
                        <th scope="col" className="py-2 pr-3">Escalations</th>
                        <th scope="col" className="py-2 pr-3">Workload</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.team.map((row) => (
                        <tr key={row.id} className="align-top">
                          <td className="py-3 pr-3">
                            <Link href={`/portal/clinical_supervisor/team/${row.id}`} className="font-semibold text-teal-700">
                              {row.fullName}
                            </Link>
                            <p className="text-[11px] capitalize text-slate-500">{humanLabel(row.role)}</p>
                          </td>
                          <td className="py-3 pr-3 text-slate-600">{row.activeClients}</td>
                          <td className="py-3 pr-3 text-slate-600">{row.sessionsThisWeek}</td>
                          <td className="py-3 pr-3 text-slate-600">{row.upcomingSessions}</td>
                          <td className="py-3 pr-3 text-slate-600">{row.overdueDocumentation}</td>
                          <td className="py-3 pr-3 text-slate-600">{row.openCaseReviews}</td>
                          <td className="py-3 pr-3 text-slate-600">{row.openEscalations}</td>
                          <td className="py-3 pr-3">
                            <Badge tone={bandTone(row.workload.band)}>{row.workload.label}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </SupervisorPage>
  );
}
