"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SupervisorPage } from "@/components/supervisor/shell";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageTitle,
  SectionTitle,
  type Tone,
} from "@/components/ui";
import { Field, SegmentedControl, inputClass, textareaClass } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import {
  caseReasonLabel,
  createCaseReview,
  fetchCaseReviews,
  formatDay,
  priorityLabel,
  priorityTone,
  type CaseReviewList,
  type Priority,
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

const CLINICAL_REASONS = [
  "complex_case", "limited_progress", "practitioner_request", "safety_concern",
  "treatment_plan_concern", "documentation_concern", "client_concern",
  "missed_sessions", "escalation",
];

const ETHICS_REASONS = [
  "ethical_concern", "confidentiality_concern", "communication_concern",
  "boundary_concern", "consent_concern", "unauthorized_access",
  "disclosure_concern", "conflict_of_interest", "conduct_concern",
];

const FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_review", label: "In review" },
  { value: "awaiting_information", label: "Awaiting info" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
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

export default function SupervisorCaseReviewsClient() {
  const [data, setData] = useState<CaseReviewList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [domain, setDomain] = useState("");
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCaseReviews({ status, domain, q });
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [status, domain, q]);

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
      <PageTitle
        description="Review complex cases, treatment-plan and documentation concerns, and ethical matters."
        action={
          <Button aria-expanded={showForm} aria-controls="case-review-form" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "Open case review"}
          </Button>
        }
      >
        Case Reviews
      </PageTitle>

      <div id="case-review-form">
        {showForm ? (
          <CreateForm
            onCreated={() => {
              setShowForm(false);
              void load();
            }}
          />
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Pending" value={counts.pending ?? 0} />
        <StatTile label="Escalated" value={counts.escalated ?? 0} />
        <StatTile label="Open ethics" value={counts.openEthics ?? 0} />
        <StatTile label="Overdue follow-ups" value={counts.overdueFollowUps ?? 0} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SegmentedControl options={FILTERS} value={status} onChange={setStatus} ariaLabel="Filter case reviews" />
        <SegmentedControl
          options={[{ value: "", label: "All domains" }, { value: "clinical", label: "Clinical" }, { value: "ethics", label: "Ethics" }]}
          value={domain}
          onChange={setDomain}
          ariaLabel="Filter by domain"
        />
        <div className="relative w-full sm:min-w-56 sm:flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            aria-label="Search case reviews"
            placeholder="Search reference, summary or practitioner"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load case reviews"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading case reviews" />
        ) : !data || data.reviews.length === 0 ? (
          <EmptyState
            title="No case reviews in this view"
            description="There are currently no case reviews matching this view. New reviews will appear here."
          />
        ) : (
          <Card>
            <SectionTitle detail={`${data.total} total`}>Case reviews</SectionTitle>
            <ul className="mt-4 divide-y divide-slate-100">
              {data.reviews.map((review) => (
                <li key={review.id}>
                  <Link href={`/portal/clinical_supervisor/case-reviews/${review.id}`} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                        <Badge tone={uiTone(priorityTone(review.priority))} dot>
                          {priorityLabel(review.priority)}
                        </Badge>
                        <Badge tone={review.domain === "ethics" ? "info" : "neutral"}>{humanLabel(review.domain)}</Badge>
                        <span className="truncate">{caseReasonLabel(review.reason)}</span>
                      </p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">{review.summary}</p>
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      <p className="font-medium">{review.reference}</p>
                      <p>{review.therapistName ?? "No practitioner"}</p>
                      <p>
                        Follow-up{" "}
                        {review.followUpDate ? (
                          <time dateTime={review.followUpDate}>{formatDay(review.followUpDate)}</time>
                        ) : (
                          "not set"
                        )}
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

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [domain, setDomain] = useState<"clinical" | "ethics">("clinical");
  const [reason, setReason] = useState("complex_case");
  const [priority, setPriority] = useState<Priority>("medium");
  const [summary, setSummary] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasons = domain === "ethics" ? ETHICS_REASONS : CLINICAL_REASONS;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await createCaseReview({ domain, reason, priority, summary, followUpDate: followUpDate || null });
      onCreated();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5">
      <SectionTitle>Open a case review</SectionTitle>
      <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Domain">
            <select
              className={inputClass}
              value={domain}
              onChange={(e) => {
                const next = e.target.value as "clinical" | "ethics";
                setDomain(next);
                setReason(next === "ethics" ? ETHICS_REASONS[0] : CLINICAL_REASONS[0]);
              }}
            >
              <option value="clinical">Clinical</option>
              <option value="ethics">Ethical</option>
            </select>
          </Field>
          <Field label="Reason">
            <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
              {reasons.map((value) => (
                <option key={value} value={value}>{caseReasonLabel(value)}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Summary" hint="Why does this case need review?">
            <textarea className={textareaClass} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 max-w-xs">
          <Field label="Follow-up date (optional)">
            <input type="date" className={inputClass} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" className="mt-4" loading={busy} disabled={summary.trim().length < 10}>
          Open review
        </Button>
      </form>
    </Card>
  );
}
