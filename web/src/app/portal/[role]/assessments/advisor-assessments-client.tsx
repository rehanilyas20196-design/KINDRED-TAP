"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import { Badge, Button, EmptyState, LoadingState, PageTitle } from "@/components/ui";
import { SearchField, SegmentedControl, StatTile } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import { fetchAssessments, formatDay, type AdvisorAssessmentRow } from "@/lib/advisor";

type Filter = "all" | "pending" | "reviewed" | "high_risk";

export default function AdvisorAssessmentsClient() {
  const [rows, setRows] = useState<AdvisorAssessmentRow[] | null>(null);
  const [pending, setPending] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (nextFilter: Filter, nextSearch: string) => {
    const requestId = ++requestRef.current;
    setRows(null);
    setError(null);
    try {
      const response = await fetchAssessments({
        filter: nextFilter,
        q: nextSearch.trim() || undefined,
      });
      if (requestId !== requestRef.current) return;
      setRows(response.assessments);
      setPending(response.pending);
    } catch (err) {
      if (requestId === requestRef.current) setError(messageFor(err));
    }
  }, []);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(filter, search);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [filter, search, reloadKey, load]);

  const list = (rows ?? []).filter((row) => {
    if (filter === "pending") return row.status === "completed" && !row.reviewedAt;
    if (filter === "reviewed") return Boolean(row.reviewedAt);
    if (filter === "high_risk") return row.isHighRisk;
    return true;
  });

  const highRiskCount = (rows ?? []).filter((row) => row.isHighRisk).length;
  const reviewedCount = (rows ?? []).filter((row) => row.reviewedAt).length;
  const hasFilters = filter !== "all" || search.trim().length > 0;

  const tiles = [
    { label: "Total", value: rows?.length ?? 0 },
    { label: "Awaiting review", value: pending, hint: "Completed, not reviewed" },
    { label: "High risk flagged", value: highRiskCount },
    { label: "Reviewed", value: reviewedCount },
  ].filter((tile) => tile.value > 0);

  function clearFilters() {
    setFilter("all");
    setSearch("");
  }

  return (
    <AdvisorPage>
      <PageTitle
        eyebrow="Clinic operations"
        description="Completed assessments across the clinic: scores and risk flags for review - never a diagnosis. Marking one reviewed closes it out for the whole team."
      >
        Assessments
      </PageTitle>

      {tiles.length ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {tiles.map((tile) => (
            <StatTile key={tile.label} label={tile.label} value={tile.value} hint={tile.hint} />
          ))}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel="Filter assessments"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "pending", label: "Awaiting review" },
            { value: "reviewed", label: "Reviewed" },
            { value: "high_risk", label: "High risk" },
          ]}
        />
        <SearchField value={search} onChange={setSearch} placeholder="Search clients" />
      </div>

      {error && rows === null ? (
        <EmptyState
          title="We could not load the assessments"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : rows === null ? (
        <LoadingState label="Loading assessments" />
      ) : list.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No assessments match that" : "No assessments yet"}
          description={
            hasFilters
              ? "Clear the filter or search to see the rest of the clinic's assessments."
              : "Assessments appear here as soon as a client finishes one."
          }
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((row) => (
            <li key={row.id}>
              <Link
                href={`/portal/clinical_advisor/assessments/${row.id}`}
                className="card card-interactive flex flex-wrap items-center gap-3 p-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {row.clientName}
                    </span>
                    <Badge tone="neutral">{row.primaryIssue ?? row.type}</Badge>
                    {row.isHighRisk ? (
                      <Badge tone="danger" dot>
                        High risk
                      </Badge>
                    ) : null}
                    {row.reviewedAt ? (
                      <Badge tone="success">Reviewed</Badge>
                    ) : (
                      <Badge tone="warning">Awaiting review</Badge>
                    )}
                  </span>
                  <span className="mt-1 line-clamp-1 block text-xs text-slate-500 dark:text-slate-400">
                    {row.summary || "No summary."}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {row.percent ?? 0}%
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {row.completedAt ? (
                      <time dateTime={row.completedAt}>{formatDay(row.completedAt)}</time>
                    ) : (
                      "—"
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdvisorPage>
  );
}
