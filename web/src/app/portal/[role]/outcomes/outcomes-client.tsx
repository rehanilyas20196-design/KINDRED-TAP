"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import { Panel, ProgressBar, StatTile } from "@/components/therapist/ui";
import {
  Badge,
  Button,
  EmptyState,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import { fetchOutcomes, formatDay, type OutcomesReport } from "@/lib/advisor";

const STATE_LABEL: Record<string, string> = {
  needs_attention: "Needs attention",
  improving: "Improving",
  stable: "Stable",
};

export default function OutcomesClient() {
  const [data, setData] = useState<OutcomesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchOutcomes();
      setData(response);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  const reload = useCallback(() => {
    setData(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const maxSessions = data ? Math.max(1, ...data.series.map((row) => row.sessions)) : 1;

  return (
    <AdvisorPage>
      <PageTitle description="How the clinic is doing over the last window: attendance, goal progress, follow-up completion and the clients whose trend needs a closer look.">
        Outcomes
      </PageTitle>

      {error && data === null ? (
        <EmptyState
          title="We could not load outcomes"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : data === null ? (
        <LoadingState label="Loading outcomes" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label="Attendance"
              value={`${data.attendance.attendanceRate}%`}
              hint={`${data.attendance.completed} of ${data.attendance.scheduled} attended`}
            />
            <StatTile
              label="Goals completed"
              value={`${data.goals.goalsCompleted}/${data.goals.goalCount}`}
              hint={`${data.goals.averageProgress}% average progress`}
            />
            <StatTile
              label="Follow-up completion"
              value={`${data.followUp.completionRate}%`}
              hint={`${data.followUp.completed} of ${data.followUp.assigned}`}
            />
            <StatTile
              label="Session feedback"
              value={data.feedback.averageRating !== null ? `${data.feedback.averageRating}/5` : "—"}
              hint={data.feedback.count > 0 ? `${data.feedback.count} ratings` : undefined}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
              <Panel title="Session volume by month">
                {data.series.length === 0 ? (
                  <EmptyState
                    title="No sessions in this window"
                    description="Volume appears once sessions are booked inside the reporting window."
                  />
                ) : (
                  <ul className="space-y-3">
                    {data.series.map((row) => (
                      <li key={row.month}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {row.month}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {row.completed} completed · {row.cancelled} cancelled of {row.sessions}
                          </span>
                        </div>
                        <div
                          className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                          aria-hidden="true"
                        >
                          <div
                            className="bg-teal-600"
                            style={{ width: `${(row.completed / maxSessions) * 100}%` }}
                          />
                          <div
                            className="bg-rose-400"
                            style={{ width: `${(row.cancelled / maxSessions) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-500">
                  {data.note}
                </p>
              </Panel>

              <Panel title="Clients to look at">
                {data.clients.length === 0 ? (
                  <EmptyState
                    title="No clients in the window"
                    description="Clients with sessions in the window appear here, ranked by recent cancellations."
                  />
                ) : (
                  <ul className="space-y-2">
                    {data.clients.map((row) => (
                      <li key={row.id}>
                        <Link
                          href={`/portal/clinical_advisor/clients/${row.id}`}
                          className="card card-interactive flex flex-wrap items-center gap-3 p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {row.fullName}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {row.progressPercent !== null ? `${row.progressPercent}% progress` : "No goals"}{" "}
                              · {row.cancelledRecently} recent cancellations · last session{" "}
                              <time dateTime={row.lastSessionAt ?? undefined}>
                                {formatDay(row.lastSessionAt)}
                              </time>
                            </p>
                          </div>
                          <Badge
                            tone={
                              row.state === "needs_attention"
                                ? "danger"
                                : row.state === "improving"
                                  ? "success"
                                  : "neutral"
                            }
                            dot
                          >
                            {STATE_LABEL[row.state] ?? row.state}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="space-y-6 lg:col-span-2">
              <Panel title="Outcome trend">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-500/10">
                    <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                      {data.trend.improving}
                    </p>
                    <p className="text-[11px] font-semibold text-emerald-700/80 dark:text-emerald-300/80">
                      Improving
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-800">
                    <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                      {data.trend.stable}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Stable
                    </p>
                  </div>
                  <div className="rounded-2xl bg-rose-50 p-3 dark:bg-rose-500/10">
                    <p className="text-lg font-semibold text-rose-700 dark:text-rose-300">
                      {data.trend.needsAttention}
                    </p>
                    <p className="text-[11px] font-semibold text-rose-700/80 dark:text-rose-300/80">
                      Needs attention
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-500">
                  {data.trend.withTrend > 0
                    ? `Based on ${data.trend.withTrend} clients with at least two recorded assessments over ${data.windowDays} days.`
                    : `No client has two recorded assessments in the last ${data.windowDays} days yet.`}
                </p>
              </Panel>

              <Panel title="Goal progress">
                <ProgressBar percent={data.goals.averageProgress} tone={data.goals.averageProgress >= 60 ? "emerald" : "amber"} />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {data.goals.goalsCompleted} of {data.goals.goalCount} goals completed across the
                  clinic.
                </p>
              </Panel>

              <Panel title="Attendance">
                <ProgressBar percent={data.attendance.attendanceRate} tone="teal" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {data.attendance.completed} completed, {data.attendance.cancelled} cancelled,{" "}
                  {data.attendance.scheduled - data.attendance.completed - data.attendance.cancelled}{" "}
                  still pending of {data.attendance.scheduled} scheduled.
                </p>
              </Panel>
            </div>
          </div>
        </div>
      )}
    </AdvisorPage>
  );
}
