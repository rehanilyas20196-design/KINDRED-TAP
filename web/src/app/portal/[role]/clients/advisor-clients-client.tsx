"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import { Badge, Button, EmptyState, LoadingState, PageTitle, type Tone } from "@/components/ui";
import { SearchField, SegmentedControl, StatTile } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import { fetchClients, formatDay, type AdvisorClient } from "@/lib/advisor";

type Filter = "all" | "attention";

const SESSION_TONE: Record<string, Tone> = {
  completed: "success",
  scheduled: "accent",
  confirmed: "accent",
  cancelled: "danger",
  no_show: "warning",
};

function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function AdvisorClientsClient() {
  const [rows, setRows] = useState<AdvisorClient[] | null>(null);
  const [needingAttention, setNeedingAttention] = useState(0);
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
      const response = await fetchClients({
        q: nextSearch.trim() || undefined,
        attention: nextFilter === "attention",
      });
      if (requestId !== requestRef.current) return;
      setRows(response.clients);
      setNeedingAttention(response.needingAttention);
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

  const list = rows ?? [];
  const withTherapist = list.filter((row) => row.assignedTherapist).length;
  const openEscalations = list.reduce((sum, row) => sum + row.openEscalations, 0);
  const hasFilters = filter !== "all" || search.trim().length > 0;

  const tiles = [
    { label: "Clients", value: list.length },
    {
      label: "Need attention",
      value: needingAttention,
      hint: "Cancelled or stalled",
    },
    { label: "With a therapist", value: withTherapist },
    { label: "Open escalations", value: openEscalations },
  ].filter((tile) => tile.value > 0);

  function clearFilters() {
    setFilter("all");
    setSearch("");
  }

  return (
    <AdvisorPage>
      <PageTitle
        eyebrow="Clinic operations"
        description="Every client the clinic is working with: who they are with, how treatment is going and who needs attention. Private session notes stay with the treating therapist."
      >
        Clients
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
          ariaLabel="Filter clients"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            {
              value: "attention",
              label: needingAttention > 0
                ? `Needs attention (${needingAttention})`
                : "Needs attention",
            },
          ]}
        />
        <SearchField value={search} onChange={setSearch} placeholder="Search clients" />
      </div>

      {error && rows === null ? (
        <EmptyState
          title="We could not load the clients"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : rows === null ? (
        <LoadingState label="Loading clients" />
      ) : list.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No clients match that" : "No clients yet"}
          description={
            hasFilters
              ? "Clear the filter or search to see the rest of the caseload."
              : "Clients appear here as soon as the clinic takes them on."
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
                href={`/portal/clinical_advisor/clients/${row.id}`}
                className="card card-interactive flex flex-wrap items-center gap-3 p-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {row.fullName}
                    </span>
                    {row.needsAttention ? (
                      <Badge tone="warning" dot>
                        Needs attention
                      </Badge>
                    ) : null}
                    {row.openEscalations > 0 ? (
                      <Badge tone="danger" dot>
                        {row.openEscalations} open escalation
                        {row.openEscalations === 1 ? "" : "s"}
                      </Badge>
                    ) : null}
                    {row.assessmentStatus === "completed" ? (
                      <Badge tone="info">
                        Assessment{" "}
                        {row.assessmentPercent !== null ? `${row.assessmentPercent}%` : ""}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                    {row.assignedTherapist
                      ? `With ${row.assignedTherapist}`
                      : row.lastTherapistName
                        ? `Last with ${row.lastTherapistName}`
                        : "Not assigned"}
                    {row.nextSessionAt ? ` · next ${formatDay(row.nextSessionAt)}` : ""}
                    {row.progressPercent !== null ? ` · ${row.progressPercent}% progress` : ""}
                    {row.activePlans
                      ? ` · ${row.activePlans} active plan${row.activePlans === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {row.lastSessionStatus ? (
                    <Badge tone={SESSION_TONE[row.lastSessionStatus] ?? "neutral"} dot>
                      {humanize(row.lastSessionStatus)}
                    </Badge>
                  ) : (
                    <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      No sessions
                    </span>
                  )}
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    last{" "}
                    {row.lastSessionAt ? (
                      <time dateTime={row.lastSessionAt}>{formatDay(row.lastSessionAt)}</time>
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
