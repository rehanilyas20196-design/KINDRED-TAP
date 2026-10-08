"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TherapistPage } from "@/components/therapist/shell";
import { Button, EmptyState, LinkButton, LoadingState } from "@/components/ui";
import {
  Avatar,
  Badge,
  PageHeader,
  ProgressBar,
  SearchField,
  SegmentedControl,
} from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  fetchClients,
  formatDay,
  type CaseloadClient,
  type CaseStatus,
} from "@/lib/therapist";

type ProgressFilter = "all" | "on_track" | "needs_attention";
type SortOption = "recent" | "name" | "next_session" | "progress";

const STATUS_TONE: Record<CaseStatus, "emerald" | "amber" | "slate" | "rose"> = {
  active: "emerald",
  paused: "amber",
  completed: "slate",
  archived: "rose",
};

function statusLabel(status: CaseStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function ClientsClient() {
  const [clients, setClients] = useState<CaseloadClient[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CaseStatus | "all">("all");
  const [progress, setProgress] = useState<ProgressFilter>("all");
  const [sort, setSort] = useState<SortOption>("recent");
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    try {
      const response = await fetchClients({
        search: search || undefined,
        status: status === "all" ? undefined : status,
        progress: progress === "all" ? undefined : progress,
        sort,
      });
      if (requestId !== requestRef.current) return;
      setClients(response.clients);
      setTotal(response.total);
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setClients(null);
      setError(messageFor(err));
    }
  }, [search, status, progress, sort]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void load();
      },
      search ? 250 : 0
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [load, search]);

  return (
    <TherapistPage>
      <PageHeader
        title="Caseload"
        description="Everyone currently assigned to you, with their next session, latest assessment and treatment plan progress."
        action={
          <LinkButton href="/portal/therapist/treatment-plans" variant="secondary">
            Treatment plans
          </LinkButton>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <SearchField value={search} onChange={setSearch} placeholder="Search name or concern" />
        </div>
        <SegmentedControl
          ariaLabel="Filter by status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
            { value: "completed", label: "Completed" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <SegmentedControl
          ariaLabel="Filter by progress"
          value={progress}
          onChange={setProgress}
          options={[
            { value: "all", label: "Any progress" },
            { value: "on_track", label: "On track" },
            { value: "needs_attention", label: "Needs attention" },
          ]}
        />
        <SegmentedControl
          ariaLabel="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "recent", label: "Recent" },
            { value: "name", label: "Name" },
            { value: "next_session", label: "Next session" },
            { value: "progress", label: "Progress" },
          ]}
        />
      </div>

      {error ? (
        <EmptyState
          title="We could not load your caseload"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      ) : clients === null ? (
        <LoadingState label="Loading caseload" />
      ) : clients.length === 0 ? (
        <EmptyState
          title={search || status !== "all" ? "No clients match those filters" : "Your caseload is empty"}
          description={
            search || status !== "all"
              ? "Clear the search or switch the filters to see everyone assigned to you."
              : "Accept an intake match from the dashboard, or a client appears here once they book or message you."
          }
          action={
            <LinkButton href="/portal/therapist" variant="primary">
              Back to dashboard
            </LinkButton>
          }
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-500">
            {clients.length} shown{total > clients.length ? ` of ${total}` : ""}
          </p>
          <ul className="space-y-3">
            {clients.map((client) => (
              <li key={client.id}>
                <Link
                  href={`/portal/therapist/clients/${client.id}`}
                  className="card card-interactive block p-5"
                >
                  <div className="flex flex-wrap items-start gap-4">
                    <Avatar name={client.fullName} url={client.avatarUrl} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {client.fullName}
                        </p>
                        <Badge tone={STATUS_TONE[client.status]}>{statusLabel(client.status)}</Badge>
                        {client.assessmentStatus === "completed" && client.lastReviewedAt === null ? (
                          <Badge tone="amber">Assessment to review</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        {client.concernSummary ?? "No concern recorded yet"}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          <span className="text-slate-500 dark:text-slate-500">Last: </span>
                          {client.lastSessionAt ? (
                            <time dateTime={client.lastSessionAt}>{formatDay(client.lastSessionAt)}</time>
                          ) : (
                            "No sessions"
                          )}
                        </span>
                        <span>
                          <span className="text-slate-500 dark:text-slate-500">Next: </span>
                          {client.nextSessionAt ? (
                            <time dateTime={client.nextSessionAt}>{formatDay(client.nextSessionAt)}</time>
                          ) : (
                            "Not booked"
                          )}
                        </span>
                        <span>
                          <span className="text-slate-500 dark:text-slate-500">Plans: </span>
                          {client.activePlans > 0 ? `${client.activePlans} active` : "None active"}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <ProgressBar percent={client.progressPercent ?? 0} />
                        <span className="w-9 shrink-0 text-right text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {client.progressPercent === null ? "—" : `${client.progressPercent}%`}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </TherapistPage>
  );
}
