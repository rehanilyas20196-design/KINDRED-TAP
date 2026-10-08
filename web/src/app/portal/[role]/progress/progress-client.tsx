"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TherapistPage } from "@/components/therapist/shell";
import { Avatar, Panel, ProgressBar, SearchField } from "@/components/therapist/ui";
import {
  Badge,
  Button,
  EmptyState,
  LinkButton,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import { fetchProgress, formatDay, type ProgressClient } from "@/lib/therapist";

export default function ProgressPageClient() {
  const [clients, setClients] = useState<ProgressClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetchProgress();
      setClients(response.clients);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  const reload = useCallback(() => {
    setClients(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return clients ?? [];
    return (clients ?? []).filter((client) => client.fullName.toLowerCase().includes(needle));
  }, [clients, search]);

  return (
    <TherapistPage>
      <PageTitle
        description="Four measured series per client: assessment scores over time, goal completion, session attendance and homework."
        action={
          <LinkButton href="/portal/therapist/assessments" variant="secondary" size="sm">
            Assessments
          </LinkButton>
        }
      >
        Progress
      </PageTitle>

      <div className="mb-5 max-w-sm">
        <SearchField value={search} onChange={setSearch} placeholder="Find a client" />
      </div>

      {error && clients === null ? (
        <EmptyState
          title="We could not load progress"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : clients === null ? (
        <LoadingState label="Loading progress" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={search ? "No client by that name" : "No progress data yet"}
          description={
            search
              ? "Try part of a name instead."
              : "Once sessions, assessments or goals exist, the four series appear here per client."
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {visible.map((client) => (
            <Panel
              key={client.id}
              title={client.fullName}
              action={
                <Link
                  href={`/portal/therapist/clients/${client.id}`}
                  className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                >
                  Open
                </Link>
              }
            >
              <div className="flex items-center gap-3">
                <Avatar name={client.fullName} url={client.avatarUrl} />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Overall
                    </span>
                    <span className="text-lg font-semibold text-slate-900 dark:text-white">
                      {client.overallPercent}%
                    </span>
                  </div>
                  <ProgressBar percent={client.overallPercent} />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <Metric
                  label="Assessment trend"
                  value={
                    client.assessmentSeries.length
                      ? `${client.assessmentSeries[client.assessmentSeries.length - 1].percent ?? "—"}% latest`
                      : "No results"
                  }
                />
                <Metric
                  label="Goals"
                  value={`${client.goals.completed}/${client.goals.total} done`}
                  hint={client.goals.progress === null ? undefined : `${client.goals.progress}% average`}
                />
                <Metric
                  label="Attendance"
                  value={`${client.sessions.completed}/${client.sessions.scheduled} attended`}
                  hint={`${client.sessions.attendanceRate}% rate`}
                />
                <Metric
                  label="Homework"
                  value={`${client.homework.completed}/${client.homework.total} completed`}
                  hint={client.homework.total > 0 ? `${client.homework.percent}%` : undefined}
                />
              </div>

              {client.assessmentSeries.length > 1 ? (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                    Score history
                  </p>
                  <div className="flex items-end gap-1.5" role="img" aria-label="Assessment score history">
                    {client.assessmentSeries.map((point) => (
                      <span key={point.id} className="flex flex-1 flex-col items-center gap-1">
                        <span
                          className="w-full rounded-t bg-teal-600/80"
                          style={{ height: `${Math.max(6, point.percent ?? 0)}px` }}
                          title={`${point.label}: ${point.percent ?? "—"}%`}
                        />
                        <span className="text-[9px] text-slate-500 dark:text-slate-500">
                          {point.percent ?? "—"}%
                        </span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-500">
                    <time dateTime={client.assessmentSeries[0].completedAt ?? undefined}>
                      {formatDay(client.assessmentSeries[0].completedAt ?? "")}
                    </time>{" "}
                    →{" "}
                    <time
                      dateTime={
                        client.assessmentSeries[client.assessmentSeries.length - 1].completedAt ??
                        undefined
                      }
                    >
                      {formatDay(
                        client.assessmentSeries[client.assessmentSeries.length - 1].completedAt ?? ""
                      )}
                    </time>
                  </p>
                </div>
              ) : client.assessmentSeries.length === 1 ? (
                <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-500">
                  One assessment on file
                  {client.assessmentSeries[0].completedAt ? (
                    <>
                      {" · "}
                      <time dateTime={client.assessmentSeries[0].completedAt}>
                        {formatDay(client.assessmentSeries[0].completedAt)}
                      </time>
                    </>
                  ) : null}
                  {client.assessmentSeries[0].percent !== null
                    ? ` · ${client.assessmentSeries[0].percent}%`
                    : ""}
                </p>
              ) : (
                <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-500">
                  No completed assessments yet.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {client.sessions.scheduled -
                  client.sessions.completed -
                  client.sessions.cancelled >
                0 ? (
                  <Badge tone="neutral">
                    {client.sessions.scheduled -
                      client.sessions.completed -
                      client.sessions.cancelled}{" "}
                    upcoming
                  </Badge>
                ) : null}
                {client.sessions.cancelled > 0 ? (
                  <Badge tone="danger" dot>
                    {client.sessions.cancelled} cancelled
                  </Badge>
                ) : null}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </TherapistPage>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
      <p className="text-[11px] text-slate-500 dark:text-slate-500">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">{value}</p>
      {hint ? <p className="text-[10px] text-slate-500 dark:text-slate-500">{hint}</p> : null}
    </div>
  );
}
