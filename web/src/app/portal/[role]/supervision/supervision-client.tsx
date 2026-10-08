"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import {
  Badge,
  EmptyState,
  ErrorPanel,
  LoadingBlock,
  PageHeader,
  Panel,
  StatTile,
} from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  fetchSupervision,
  formatDay,
  type SupervisionList,
} from "@/lib/advisor";

function statusTone(status: string): "teal" | "amber" | "rose" | "slate" {
  if (status === "current") return "teal";
  if (status === "due") return "amber";
  if (status === "overdue") return "rose";
  return "slate";
}

export default function SupervisionClient() {
  const [data, setData] = useState<SupervisionList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchSupervision();
      setData(response);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  return (
    <AdvisorPage>
      <PageHeader
        title="Supervision"
        description={`Every practitioner is supervised on a ${data?.intervalDays ?? ""}-day cycle. Record sessions, track follow-up actions and see who is due next.`}
      />

      {error ? <ErrorPanel message={error} onRetry={load} /> : null}
      {!data && !error ? <LoadingBlock label="Loading supervision..." /> : null}

      {data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            <StatTile
              label="Requiring supervision"
              value={data.overview.therapistsRequiringSupervision}
              href="/portal/clinical_advisor/supervision"
            />
            <StatTile
              label="Overdue reviews"
              value={data.overview.overdueReviews}
              hint={data.overview.overdueReviews ? "Past the interval" : "None overdue"}
            />
            <StatTile label="Upcoming sessions" value={data.overview.upcomingSessions} />
            <StatTile label="Recent records" value={data.overview.recentRecords} />
            <StatTile label="Practitioners" value={data.overview.totalTherapists} />
          </div>

          <Panel title="Practitioners">
            {data.therapists.length === 0 ? (
              <EmptyState
                title="No practitioners yet"
                body="Therapists appear here as soon as they join the clinic."
              />
            ) : (
              <ul className="space-y-3">
                {data.therapists.map((therapist) => (
                  <li key={therapist.id}>
                    <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/portal/clinical_advisor/supervision/${therapist.id}`}
                            className="text-sm font-semibold text-slate-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-300"
                          >
                            {therapist.fullName}
                          </Link>
                          <Badge tone={statusTone(therapist.supervision.status)}>
                            {therapist.supervision.status}
                            {therapist.supervision.daysOverdue
                              ? ` · ${therapist.supervision.daysOverdue}d`
                              : ""}
                          </Badge>
                          {therapist.openActionItems > 0 ? (
                            <Badge tone="amber">{therapist.openActionItems} open actions</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {therapist.discipline ?? "Practitioner"} ·{" "}
                          {therapist.activeClients} active clients · {therapist.recordCount} record
                          {therapist.recordCount === 1 ? "" : "s"}
                          {therapist.lastSupervisionDate
                            ? ` · last ${formatDay(therapist.lastSupervisionDate)}`
                            : " · no supervision yet"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            Next due
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDay(therapist.supervision.nextDue)}
                          </p>
                        </div>
                        <Link
                          href={`/portal/clinical_advisor/supervision/${therapist.id}`}
                          className="rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-teal-800"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent supervision records">
            {data.recent.length === 0 ? (
              <EmptyState
                title="No records yet"
                body="Record a supervision session from a practitioner's page; it lands here for the whole clinic to audit."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recent.map((record) => (
                  <li
                    key={record.id}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {record.therapistName ?? "Practitioner"} · {record.focus || "Supervision"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {formatDay(record.supervisionDate)} · {record.modality} · by{" "}
                        {record.advisorName ?? "advisor"}
                        {record.followUpDate ? ` · follow-up ${formatDay(record.followUpDate)}` : ""}
                      </p>
                    </div>
                    <Badge tone={record.status === "closed" ? "slate" : record.status === "open" ? "amber" : "teal"}>
                      {record.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </AdvisorPage>
  );
}
