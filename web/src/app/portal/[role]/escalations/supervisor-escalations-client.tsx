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
import { SegmentedControl, inputClass } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import {
  fetchEscalations,
  formatDateTime,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  type EscalationList,
} from "@/lib/supervisor";

const UI_TONE: Record<string, Tone> = {
  teal: "accent",
  slate: "neutral",
  amber: "warning",
  rose: "danger",
  emerald: "success",
  sky: "info",
};

function uiTone(tone: string): Tone {
  return tone in UI_TONE ? UI_TONE[tone] : "neutral";
}

function humanLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/(^|\s)\S/g, (chunk) => chunk.toUpperCase());
}

const FILTERS = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "under_review", label: "Under review" },
  { value: "awaiting_action", label: "Awaiting action" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

function StatTile({ label, value, href }: { label: string; value: number; href?: string }) {
  if (value <= 0) return null;
  const body = (
    <>
      <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </>
  );
  return href ? (
    <Link href={href} className="card card-interactive p-4">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

export default function SupervisorEscalationsClient() {
  const [data, setData] = useState<EscalationList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchEscalations({ status, priority, q });
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [status, priority, q]);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const counts = data?.counts ?? {};

  return (
    <SupervisorPage>
      <PageTitle description="Review escalations, decide the required action and follow them through to resolution. Serious items can be escalated to the Clinical Advisor.">
        Escalations
      </PageTitle>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Awaiting action" value={counts.awaitingAction ?? 0} href="/portal/clinical_supervisor/escalations?status=awaiting_action" />
        <StatTile label="Critical open" value={counts.criticalOpen ?? 0} />
        <StatTile label="High open" value={counts.highOpen ?? 0} />
        <StatTile label="Escalated to advisor" value={counts.escalated ?? 0} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SegmentedControl options={FILTERS} value={status} onChange={setStatus} ariaLabel="Filter escalations by status" />
        <select
          aria-label="Filter by priority"
          className={`${inputClass} w-full sm:w-40`}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <div className="relative w-full sm:min-w-56 sm:flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            aria-label="Search escalations"
            placeholder="Search reference, reason or practitioner"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load escalations"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading escalations" />
        ) : !data || data.escalations.length === 0 ? (
          <EmptyState
            title="No escalations in this view"
            description="There are currently no escalations requiring your attention."
          />
        ) : (
          <Card>
            <SectionTitle detail={`${data.total} total`}>Escalations</SectionTitle>
            <ul className="mt-4 divide-y divide-slate-100">
              {data.escalations.map((escalation) => (
                <li key={escalation.id}>
                  <Link
                    href={`/portal/clinical_supervisor/escalations/${escalation.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                        <Badge tone={uiTone(priorityTone(escalation.priority))} dot>
                          {priorityLabel(escalation.priority)}
                        </Badge>
                        <Badge tone={uiTone(statusTone(escalation.status))}>{statusLabel(escalation.status)}</Badge>
                        <span className="truncate">{escalation.riskType ? humanLabel(escalation.riskType) : "Escalation"}</span>
                      </p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                        {escalation.reason ?? `${humanLabel(escalation.source)} escalation`}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      <p className="font-medium">{escalation.reference}</p>
                      <p>{escalation.therapistName ?? humanLabel(escalation.source)}</p>
                      <p>
                        <time dateTime={escalation.escalatedAt}>{formatDateTime(escalation.escalatedAt)}</time>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </SupervisorPage>
  );
}
