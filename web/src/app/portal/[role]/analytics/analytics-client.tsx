"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import { Button, EmptyState, LoadingState } from "@/components/ui";
import { Badge, PageHeader, Panel, ProgressBar, StatTile } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import { fetchAnalytics, type AnalyticsReport } from "@/lib/advisor";

function percent(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${value}%`;
}

export default function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchAnalytics();
      setData(response);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <AdvisorPage>
      <PageHeader
        title="Analytics"
        description="How the clinic is doing: growth, workload, appointments, assessments, supervision coverage and quality."
      />

      {error ? (
        <EmptyState
          title="We could not load your analytics"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      ) : !data ? (
        <LoadingState label="Loading analytics" />
      ) : null}

      {data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label="Appointment completion"
              value={`${data.appointments.completionRate}%`}
              hint={`${data.appointments.completed} of ${data.appointments.total}`}
            />
            <StatTile
              label="Assessment review"
              value={`${data.quality.assessmentReviewRate}%`}
              hint={`${data.assessments.reviewed} of ${data.assessments.completed}`}
            />
            <StatTile
              label="Goal completion"
              value={`${data.quality.goalCompletionRate}%`}
            />
            <StatTile
              label="Supervision coverage"
              value={`${data.supervision.completionRate}%`}
              hint={`${data.supervision.current} of ${data.supervision.therapists} current`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Growth">
              {data.growth.length === 0 ? (
                <EmptyState title="No activity yet" description="Signups appear month by month." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[26rem] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                        <th className="py-2 font-semibold">Month</th>
                        <th className="py-2 font-semibold">Signups</th>
                        <th className="py-2 font-semibold">Clients</th>
                        <th className="py-2 font-semibold">Therapists</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.growth.map((row) => (
                        <tr
                          key={row.month}
                          className="border-b border-slate-100 text-slate-600 last:border-0 dark:border-slate-800 dark:text-slate-300"
                        >
                          <td className="py-2 font-semibold text-slate-800 dark:text-slate-100">
                            {row.month}
                          </td>
                          <td className="py-2">{row.signups}</td>
                          <td className="py-2">{row.clients}</td>
                          <td className="py-2">{row.therapists}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Workload">
              {data.workload.rows.length === 0 ? (
                <EmptyState title="No practitioners" description="Workload appears once therapists have caseloads." />
              ) : (
                <ul className="space-y-2">
                  {data.workload.rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/portal/clinical_advisor/therapists/${row.id}`}
                          className="truncate text-sm font-semibold text-slate-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-300"
                        >
                          {row.fullName}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {row.activeClients} active clients · {row.upcomingSessions} upcoming
                        </p>
                      </div>
                      <Badge tone={row.acceptingNewCases ? "teal" : "slate"}>
                        {row.acceptingNewCases ? "open" : "paused"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Appointments">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Scheduled" value={data.appointments.scheduled} />
                <StatTile label="Completed" value={data.appointments.completed} />
                <StatTile label="Cancelled" value={data.appointments.cancelled} />
                <StatTile label="Total" value={data.appointments.total} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.appointments.online > 0 ? (
                  <Badge tone="teal">Online {data.appointments.online}</Badge>
                ) : null}
                {data.appointments.phone > 0 ? (
                  <Badge tone="sky">Phone {data.appointments.phone}</Badge>
                ) : null}
                {data.appointments.inPerson > 0 ? (
                  <Badge tone="slate">In person {data.appointments.inPerson}</Badge>
                ) : null}
              </div>
            </Panel>

            <Panel title="Assessments">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Completed" value={data.assessments.completed} />
                <StatTile label="In progress" value={data.assessments.inProgress} />
                <StatTile label="Reviewed" value={data.assessments.reviewed} />
                <StatTile label="High risk" value={data.assessments.flagged} />
              </div>
              <div className="mt-4">
                <Link
                  href="/portal/clinical_advisor/assessments"
                  className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                >
                  Open the review queue <span aria-hidden="true">→</span>
                </Link>
              </div>
            </Panel>

            <Panel title="Escalations by month">
              {data.escalations.length === 0 ? (
                <EmptyState
                  title="No escalations"
                  description="Nothing has been raised in the reporting window."
                />
              ) : (
                <ul className="space-y-2">
                  {data.escalations.map((row) => (
                    <li
                      key={row.month}
                      className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {row.month}
                      </span>
                      <span className="flex gap-2">
                        {row.total > 0 ? <Badge tone="slate">{row.total} total</Badge> : null}
                        {row.critical > 0 ? <Badge tone="rose">{row.critical} critical</Badge> : null}
                        {row.open > 0 ? <Badge tone="amber">{row.open} open</Badge> : null}
                        {row.resolved > 0 ? <Badge tone="emerald">{row.resolved} resolved</Badge> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Quality indicators">
              <div className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      Attendance
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {data.quality.attendanceRate}%
                    </span>
                  </div>
                  <ProgressBar percent={data.quality.attendanceRate} tone="teal" />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      Documentation
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {percent(data.quality.documentationRate)}
                    </span>
                  </div>
                  <ProgressBar percent={data.quality.documentationRate ?? 0} tone="amber" />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      Assessment review
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {data.quality.assessmentReviewRate}%
                    </span>
                  </div>
                  <ProgressBar percent={data.quality.assessmentReviewRate} tone="emerald" />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      Goal completion
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {data.quality.goalCompletionRate}%
                    </span>
                  </div>
                  <ProgressBar percent={data.quality.goalCompletionRate} tone="sky" />
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Standards">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Total" value={data.standards.total} />
                <StatTile label="Active" value={data.standards.active} />
                <StatTile label="Overdue" value={data.standards.overdue} />
                <StatTile label="Due soon" value={data.standards.dueSoon} />
              </div>
            </Panel>

            <Panel title="Ethics acknowledgment rates">
              <ul className="space-y-2">
                {data.ethics.map((row) => (
                  <li key={`${row.title}-${row.version}`}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate font-semibold text-slate-700 dark:text-slate-200">
                        {row.title} · v{row.version}
                      </span>
                      <span className="shrink-0 text-slate-500 dark:text-slate-400">
                        {row.acknowledged}/{row.practitioners}
                      </span>
                    </div>
                    <ProgressBar
                      percent={row.rate}
                      tone={row.rate === 100 ? "emerald" : row.rate >= 60 ? "amber" : "rose"}
                    />
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      ) : null}
    </AdvisorPage>
  );
}
