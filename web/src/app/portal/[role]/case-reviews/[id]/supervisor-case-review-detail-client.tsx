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
import { DataRow, Field, inputClass, textareaClass } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import {
  actOnCaseReview,
  caseReasonLabel,
  fetchCaseReview,
  formatDateTime,
  formatDay,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  type CaseReviewAction,
  type CaseReviewDetail,
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

const ACTIONS: { value: CaseReviewAction; label: string }[] = [
  { value: "start_review", label: "Start review" },
  { value: "note", label: "Add supervisor note" },
  { value: "request_information", label: "Request information" },
  { value: "create_action", label: "Record required action" },
  { value: "schedule_follow_up", label: "Schedule follow-up" },
  { value: "escalate_to_advisor", label: "Escalate to Clinical Advisor" },
  { value: "resolve", label: "Resolve review" },
  { value: "reopen", label: "Reopen" },
];

export default function SupervisorCaseReviewDetailClient({ reviewId }: { reviewId: string }) {
  const [data, setData] = useState<CaseReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCaseReview(reviewId);
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const review = data?.review;

  return (
    <SupervisorPage>
      <Link
        href="/portal/clinical_supervisor/case-reviews"
        className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Back to case reviews
      </Link>

      <PageTitle
        description="Review the case, decide the required action and record the outcome. Serious matters can be escalated to the Clinical Advisor."
        action={
          review ? (
            <span className="flex gap-2">
              <Badge tone={uiTone(priorityTone(review.priority))} dot>
                {priorityLabel(review.priority)}
              </Badge>
              <Badge tone={uiTone(statusTone(review.status))}>{statusLabel(review.status)}</Badge>
            </span>
          ) : null
        }
      >
        {review ? `${review.reference} · ${caseReasonLabel(review.reason)}` : "Case review"}
      </PageTitle>

      {error ? (
        <EmptyState
          title="We could not load this case review"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : loading ? (
        <LoadingState label="Loading case review" />
      ) : !review ? (
        <EmptyState title="We could not find that case review" description="It may have been removed or you may not have access to it." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <SectionTitle>Review</SectionTitle>
              <dl className="mt-4 divide-y divide-slate-100">
                <DataRow label="Reference">{review.reference}</DataRow>
                <DataRow label="Domain"><Badge tone={review.domain === "ethics" ? "info" : "neutral"}>{humanLabel(review.domain)}</Badge></DataRow>
                <DataRow label="Reason">{caseReasonLabel(review.reason)}</DataRow>
                <DataRow label="Priority"><Badge tone={uiTone(priorityTone(review.priority))}>{priorityLabel(review.priority)}</Badge></DataRow>
                <DataRow label="Status"><Badge tone={uiTone(statusTone(review.status))}>{statusLabel(review.status)}</Badge></DataRow>
                <DataRow label="Practitioner">{review.therapistName ?? "-"}</DataRow>
                <DataRow label="Client">{review.clientName ?? (review.clientId ? "Restricted" : "-")}</DataRow>
                <DataRow label="Assigned supervisor">{review.assignedSupervisorName ?? "Unassigned"}</DataRow>
                <DataRow label="Follow-up">
                  {review.followUpDate ? <time dateTime={review.followUpDate}>{formatDay(review.followUpDate)}</time> : "-"}
                </DataRow>
                <DataRow label="Escalated to advisor">
                  {review.advisorEscalatedAt ? (
                    <time dateTime={review.advisorEscalatedAt}>{formatDateTime(review.advisorEscalatedAt)}</time>
                  ) : (
                    "Not escalated"
                  )}
                </DataRow>
              </dl>
              <div className="mt-4 space-y-3">
                <Text label="Summary" value={review.summary} />
                <Text label="Supervisor notes" value={review.supervisorNotes} />
                <Text label="Resolution" value={review.resolution} />
              </div>
            </Card>

            <div className="space-y-6">
              <Card>
                <SectionTitle>Activity</SectionTitle>
                <div className="mt-4">
                  {data.activity.length === 0 ? (
                    <EmptyState title="No activity" description="Review steps will be recorded here." />
                  ) : (
                    <ol className="space-y-3">
                      {data.activity.map((event) => (
                        <li key={event.id} className="text-xs">
                          <p className="font-semibold text-slate-700">{humanLabel(event.action)}</p>
                          {event.detail ? <p className="mt-0.5 text-slate-500">{event.detail}</p> : null}
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {event.actorName ?? "System"} ·{" "}
                            <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </Card>

              <Card>
                <SectionTitle>Linked interventions</SectionTitle>
                <div className="mt-4">
                  {data.interventions.length === 0 ? (
                    <p className="text-xs text-slate-500">No intervention has been linked to this review yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {data.interventions.map((intervention) => (
                        <li key={intervention.id}>
                          <Link href={`/portal/clinical_supervisor/interventions/${intervention.id}`} className="text-xs font-semibold text-teal-700">
                            {intervention.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href={`/portal/clinical_supervisor/interventions?related=case_review&relatedId=${review.id}`}
                    className="mt-3 inline-block text-xs font-semibold text-teal-700"
                  >
                    Create intervention
                  </Link>
                </div>
              </Card>
            </div>
          </div>

          <Card>
            <SectionTitle>Document action</SectionTitle>
            <div className="mt-4">
              <ReviewActions reviewId={reviewId} onDone={() => void load()} />
            </div>
          </Card>
        </div>
      )}
    </SupervisorPage>
  );
}

function Text({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{value}</p>
    </div>
  );
}

function ReviewActions({ reviewId, onDone }: { reviewId: string; onDone: () => void }) {
  const [action, setAction] = useState<CaseReviewAction>("start_review");
  const [detail, setDetail] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [priority, setPriority] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await actOnCaseReview(reviewId, {
        action,
        detail: detail || null,
        followUpDate: followUpDate || null,
        priority: (priority || undefined) as Priority | undefined,
        confirm: confirm || undefined,
      });
      setDetail("");
      setFollowUpDate("");
      setConfirm(false);
      onDone();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Action">
          <select className={inputClass} value={action} onChange={(e) => setAction(e.target.value as CaseReviewAction)}>
            {ACTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority (optional)">
          <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Keep current</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
        {action === "schedule_follow_up" ? (
          <Field label="Follow-up date">
            <input type="date" className={inputClass} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
        ) : null}
      </div>
      <div className="mt-4">
        <Field label="Detail">
          <textarea className={textareaClass} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </Field>
      </div>
      {action === "resolve" ? (
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          I confirm a human has reviewed this and the review can be resolved.
        </label>
      ) : null}
      <Button type="submit" className="mt-4" loading={busy}>
        Record action
      </Button>
    </form>
  );
}
