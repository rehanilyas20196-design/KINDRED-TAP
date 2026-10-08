"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import { SearchField, SegmentedControl, StatTile } from "@/components/therapist/ui";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LoadingState,
  PageTitle,
  type Tone,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import {
  escalationStatusLabel,
  fetchSafety,
  formatDateTime,
  type EscalationRow,
  type SafetyList,
} from "@/lib/advisor";

function priorityTone(priority: string): Tone {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "info";
  return "neutral";
}

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function statusTone(status: string): Tone {
  if (status === "new") return "danger";
  if (status === "under_review") return "info";
  if (status === "action_required") return "warning";
  if (status === "resolved") return "success";
  return "neutral";
}

type StatusFilter = "all" | "new" | "under_review" | "action_required" | "resolved" | "closed";

export default function SafetyClient() {
  const [data, setData] = useState<SafetyList | null>(null);
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // One debounced server fetch: filters and search travel to the API so the
  // queue stays correct as it grows, and typing cannot cause a request storm.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetchSafety({
            status: status === "all" ? undefined : status,
            q: search.trim() || undefined,
          });
          if (cancelled) return;
          setData(response);
          setRows(response.escalations);
          setError(null);
        } catch (err) {
          if (!cancelled) setError(messageFor(err));
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, search, reload]);

  const retry = () => setReload((value) => value + 1);

  return (
    <AdvisorPage>
      <PageTitle description="Everything therapists and supporters have raised, in triage order. Acknowledge, escalate or resolve - every action is audited.">
        Safety escalations
      </PageTitle>

      {data ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {(data.counts.new ?? 0) > 0 ? (
            <StatTile label="New" value={data.counts.new ?? 0} href="#queue" />
          ) : null}
          {(data.counts.under_review ?? 0) > 0 ? (
            <StatTile label="Under review" value={data.counts.under_review ?? 0} href="#queue" />
          ) : null}
          {(data.counts.action_required ?? 0) > 0 ? (
            <StatTile label="Action required" value={data.counts.action_required ?? 0} href="#queue" />
          ) : null}
          {(data.counts.resolved ?? 0) > 0 ? (
            <StatTile label="Resolved" value={data.counts.resolved ?? 0} href="#queue" />
          ) : null}
          <StatTile
            label="Total"
            value={data.total}
            hint={data.maySeeClients ? undefined : "Client identities hidden"}
          />
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-3" id="queue">
        <SegmentedControl
          ariaLabel="Filter escalations"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "new", label: "New" },
            { value: "under_review", label: "Under review" },
            { value: "action_required", label: "Action" },
            { value: "resolved", label: "Resolved" },
            { value: "closed", label: "Closed" },
          ]}
        />
        <div className="w-full sm:max-w-xs">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Reference, client or therapist"
          />
        </div>
      </div>

      {error && !data ? (
        <EmptyState
          title="We could not load safety escalations"
          description={error}
          action={<Button onClick={retry}>Try again</Button>}
        />
      ) : !data ? (
        <LoadingState label="Loading escalations" />
      ) : (
        <>
          {error ? (
            <div className="mb-5">
              <Alert tone="danger" title="We could not refresh the queue">
                {error}
              </Alert>
            </div>
          ) : null}
          {rows.length === 0 ? (
            <EmptyState
              title="No escalations in this view"
              description="When a therapist raises a safeguarding concern it lands here within seconds, ranked by priority."
            />
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/portal/clinical_advisor/safety/${row.id}`}
                    className="card card-interactive flex flex-wrap items-center gap-3 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {row.reference}
                        </p>
                        <Badge tone={priorityTone(row.priority)} dot>
                          {PRIORITY_LABEL[row.priority] ?? row.priority}
                        </Badge>
                        <Badge tone={statusTone(row.status)}>
                          {escalationStatusLabel(row.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {row.riskType} risk · {row.clientAlias ?? "client unrecorded"}
                        {row.therapistName ? ` · raised by ${row.therapistName}` : ""} ·{" "}
                        <time dateTime={row.escalatedAt}>{formatDateTime(row.escalatedAt)}</time>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {row.eventCount} event{row.eventCount === 1 ? "" : "s"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{row.source}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AdvisorPage>
  );
}
