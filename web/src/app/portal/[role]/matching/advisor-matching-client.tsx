"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import {
  Badge,
  Button,
  EmptyState,
  LoadingState,
  PageTitle,
  type Tone,
} from "@/components/ui";
import { Panel, SegmentedControl, StatTile } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  decisionLabel,
  fetchMatchRequests,
  formatDateTime,
  type MatchRequestRow,
} from "@/lib/advisor";

type Filter = "all" | "pending" | "approved" | "assigned" | "rejected";

const STATE_TONE: Record<string, Tone> = {
  assigned: "success",
  approved: "accent",
  pending: "warning",
  rejected: "danger",
};

export default function AdvisorMatchingClient() {
  const [rows, setRows] = useState<MatchRequestRow[] | null>(null);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, assigned: 0, rejected: 0 });
  const [filter, setFilter] = useState<Filter>("all");
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (nextFilter: Filter) => {
    const requestId = ++requestRef.current;
    try {
      const response = await fetchMatchRequests(nextFilter);
      if (requestId !== requestRef.current) return;
      setRows(response.requests);
      setCounts(response.counts);
      setError(null);
    } catch (err) {
      if (requestId === requestRef.current) {
        setRows(null);
        setError(messageFor(err));
      }
    }
  }, []);

  function applyFilter(nextFilter: Filter) {
    setError(null);
    setRows(null);
    setFilter(nextFilter);
    setReloadKey((value) => value + 1);
  }

  const reload = useCallback(() => {
    setError(null);
    setRows(null);
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    void (async () => {
      await load(filter);
    })();
  }, [filter, reloadKey, load]);

  const list = rows ?? [];
  const hasFilters = filter !== "all";

  const tiles = [
    { label: "Pending", value: counts.pending },
    { label: "Approved", value: counts.approved },
    { label: "Assigned", value: counts.assigned },
    { label: "Rejected", value: counts.rejected },
  ].filter((tile) => tile.value > 0);

  return (
    <AdvisorPage>
      <PageTitle
        eyebrow="Clinic operations"
        description="Every client search waiting on a decision: review the shortlist, approve it or assign a therapist yourself. Each decision is audited."
      >
        Matching
      </PageTitle>

      {tiles.length ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {tiles.map((tile) => (
            <StatTile key={tile.label} label={tile.label} value={tile.value} />
          ))}
        </div>
      ) : null}

      <div className="mb-5">
        <SegmentedControl
          ariaLabel="Filter matching requests"
          value={filter}
          onChange={applyFilter}
          options={[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "assigned", label: "Assigned" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
      </div>

      {error && rows === null ? (
        <EmptyState
          title="We could not load the matching queue"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : rows === null ? (
        <LoadingState label="Loading matching queue" />
      ) : list.length === 0 ? (
        <EmptyState
          title={hasFilters ? "Nothing in this view" : "No matching requests yet"}
          description={
            hasFilters
              ? "Choose another filter to see the rest of the queue."
              : "Client searches land here the moment they complete an assessment and describe what they need."
          }
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={() => applyFilter("all")}>
                Show all
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((row) => (
            <li key={row.id}>
              <Link
                href={`/portal/clinical_advisor/matching/requests/${row.id}`}
                className="card card-interactive flex flex-wrap items-center gap-3 p-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {row.clientName}
                    </span>
                    <Badge tone={STATE_TONE[row.state] ?? "neutral"} dot>
                      {decisionLabel(row.state)}
                    </Badge>
                    <Badge tone="neutral">{row.primaryIssue}</Badge>
                  </span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                    {row.resultCount} recommendation{row.resultCount === 1 ? "" : "s"}
                    {row.secondaryIssues.length ? ` · also ${row.secondaryIssues.join(", ")}` : ""}
                    {row.assignedTherapistName
                      ? ` · assigned to ${row.assignedTherapistName}`
                      : ""}
                    {" · "}
                    <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {row.decisionCount} decision{row.decisionCount === 1 ? "" : "s"}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {row.decidedAt ? (
                      <time dateTime={row.decidedAt}>{formatDateTime(row.decidedAt)}</time>
                    ) : (
                      "Awaiting review"
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <Panel title="How decisions work">
          <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
            Approving confirms the suggested shortlist; assigning picks the therapist directly.
            Either way the client keeps control - nothing reaches them until they choose to write.
          </p>
        </Panel>
      </div>
    </AdvisorPage>
  );
}
