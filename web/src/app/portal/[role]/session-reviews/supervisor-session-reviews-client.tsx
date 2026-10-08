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
  fetchSessionReviews,
  formatDateTime,
  statusLabel,
  statusTone,
  type SessionReviewList,
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

const FILTERS = [
  { value: "", label: "All" },
  { value: "awaiting_review", label: "Awaiting review" },
  { value: "documentation", label: "Documentation" },
  { value: "follow_up", label: "Follow-up" },
  { value: "completed", label: "Completed" },
];

function StatTile({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <div className="card p-4">
      <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function SupervisorSessionReviewsClient() {
  const [data, setData] = useState<SessionReviewList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSessionReviews({ status, q });
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [status, q]);

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
      <PageTitle description="Authorised documentation review. Private therapist notes are only opened deliberately, and every read is audited.">
        Session Reviews
      </PageTitle>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Awaiting review" value={counts.awaiting_review ?? 0} />
        <StatTile label="In review" value={counts.in_review ?? 0} />
        <StatTile label="Documentation pending" value={counts.documentationPending ?? 0} />
        <StatTile label="Completed" value={counts.completed ?? 0} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SegmentedControl options={FILTERS} value={status} onChange={setStatus} ariaLabel="Filter session reviews" />
        <div className="relative w-full sm:min-w-56 sm:flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            aria-label="Search session reviews"
            placeholder="Search therapist or client"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load session reviews"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading session reviews" />
        ) : !data || data.sessions.length === 0 ? (
          <EmptyState
            title="No sessions to review"
            description="Completed sessions in the review window will appear here."
          />
        ) : (
          <Card>
            <SectionTitle detail={`${data.total} total`}>Session reviews</SectionTitle>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <caption className="sr-only">Sessions with documentation and review status</caption>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th scope="col" className="py-2 pr-3">Session</th>
                    <th scope="col" className="py-2 pr-3">Therapist</th>
                    <th scope="col" className="py-2 pr-3">Client</th>
                    <th scope="col" className="py-2 pr-3">Documentation</th>
                    <th scope="col" className="py-2 pr-3">Review</th>
                    <th scope="col" className="py-2 pr-3">Follow-up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.sessions.map((session) => (
                    <tr key={session.id} className="align-top">
                      <td className="py-3 pr-3">
                        <Link
                          href={`/portal/clinical_supervisor/session-reviews/${session.reviewRowId ?? session.id}`}
                          className="font-semibold text-teal-700"
                        >
                          <time dateTime={session.scheduledAt}>{formatDateTime(session.scheduledAt)}</time>
                        </Link>
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{session.therapistName}</td>
                      <td className="py-3 pr-3 text-slate-600">{session.clientName ?? "Client"}</td>
                      <td className="py-3 pr-3">
                        <Badge tone={session.documentationStatus === "final" ? "success" : "warning"}>
                          {statusLabel(session.documentationStatus)}
                        </Badge>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={uiTone(statusTone(session.reviewStatus))}>{statusLabel(session.reviewStatus)}</Badge>
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{session.followUpRequired ? "Required" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </SupervisorPage>
  );
}
