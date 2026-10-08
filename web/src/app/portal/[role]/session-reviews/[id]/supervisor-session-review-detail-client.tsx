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
  fetchSessionDocumentation,
  fetchSessionReview,
  formatDateTime,
  openSessionReview,
  statusLabel,
  statusTone,
  submitSessionFeedback,
  type SessionDocumentation,
  type SessionReviewDetail,
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

export default function SupervisorSessionReviewDetailClient({ reviewId }: { reviewId: string }) {
  const [data, setData] = useState<SessionReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [documentation, setDocumentation] = useState<SessionDocumentation["note"] | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSessionReview(reviewId);
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

  async function openReview() {
    if (!data) return;
    setNotice(null);
    try {
      await openSessionReview(data.review.sessionId);
      await load();
    } catch (err) {
      setNotice(messageFor(err));
    }
  }

  async function loadDocumentation() {
    if (!data?.review.reviewRowId) return;
    setDocLoading(true);
    setDocError(null);
    try {
      const result = await fetchSessionDocumentation(data.review.reviewRowId);
      setDocumentation(result.note);
    } catch (err) {
      setDocError(messageFor(err));
    } finally {
      setDocLoading(false);
    }
  }

  const review = data?.review;

  return (
    <SupervisorPage>
      <Link
        href="/portal/clinical_supervisor/session-reviews"
        className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Back to session reviews
      </Link>

      <PageTitle
        description="Review documentation quality and leave feedback. The private note is only opened on request and the read is audited."
        action={review ? <Badge tone={uiTone(statusTone(review.reviewStatus))}>{statusLabel(review.reviewStatus)}</Badge> : null}
      >
        {review ? `Session review · ${review.therapistName}` : "Session review"}
      </PageTitle>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load this session review"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading session review" />
        ) : !review ? (
          <EmptyState title="We could not find that session review" description="It may have been removed or you may not have access to it." />
        ) : (
          <div className="space-y-6">
            {notice ? <Alert tone="danger">{notice}</Alert> : null}

            <Card>
              <SectionTitle>Session</SectionTitle>
              <dl className="mt-4 divide-y divide-slate-100">
                <DataRow label="Session date"><time dateTime={review.scheduledAt}>{formatDateTime(review.scheduledAt)}</time></DataRow>
                <DataRow label="Therapist">{review.therapistName} ({review.therapistRole})</DataRow>
                <DataRow label="Client">{review.clientName ?? "Client"}</DataRow>
                <DataRow label="Documentation">
                  <Badge tone={review.documentationStatus === "final" ? "success" : "warning"}>
                    {statusLabel(review.documentationStatus)}
                  </Badge>
                </DataRow>
                <DataRow label="Review status">
                  <Badge tone={uiTone(statusTone(review.reviewStatus))}>{statusLabel(review.reviewStatus)}</Badge>
                </DataRow>
                <DataRow label="Follow-up">
                  {review.followUpRequired && review.followUpDate ? (
                    <time dateTime={review.followUpDate}>{formatDateTime(review.followUpDate)}</time>
                  ) : (
                    "Not required"
                  )}
                </DataRow>
                {review.supervisorFeedback ? <DataRow label="Feedback">{review.supervisorFeedback}</DataRow> : null}
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {!review.reviewRowId || review.reviewStatus === "awaiting_review" ? (
                  <Button onClick={() => void openReview()}>Open review</Button>
                ) : null}
                <Button variant="secondary" onClick={() => void loadDocumentation()} loading={docLoading}>
                  View session documentation
                </Button>
                <span className="text-[11px] text-slate-500">This fetch is recorded in the audit log.</span>
              </div>

              {docError ? <div className="mt-3"><Alert tone="danger">{docError}</Alert></div> : null}
              {documentation ? (
                <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-500">
                    Documentation status: {statusLabel(documentation.status)}
                  </p>
                  <DocField label="Presentation" value={documentation.presentation} />
                  <DocField label="Discussion" value={documentation.discussion} />
                  <DocField label="Interventions" value={documentation.interventions} />
                  <DocField label="Client response" value={documentation.clientResponse} />
                  <DocField label="Progress notes" value={documentation.progressNotes} />
                  <DocField label="Next session plan" value={documentation.nextSessionPlan} />
                  <DocField label="Private notes" value={documentation.privateNotes} />
                </div>
              ) : null}
            </Card>

            {review.reviewRowId ? (
              <Card>
                <SectionTitle>Supervisor feedback</SectionTitle>
                <div className="mt-4">
                  <FeedbackForm reviewId={review.reviewRowId} onDone={() => void load()} />
                </div>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </SupervisorPage>
  );
}

function DocField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{value}</p>
    </div>
  );
}

function FeedbackForm({ reviewId, onDone }: { reviewId: string; onDone: () => void }) {
  const [feedback, setFeedback] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await submitSessionFeedback(reviewId, {
        feedback: feedback || null,
        followUpRequired,
        followUpDate: followUpDate || null,
        complete,
      });
      setFeedback("");
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
      <div className="mt-4">
        <Field label="Feedback">
          <textarea className={textareaClass} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={followUpRequired} onChange={(e) => setFollowUpRequired(e.target.checked)} />
          Follow-up required
        </label>
        {followUpRequired ? (
          <input
            type="date"
            aria-label="Follow-up date"
            className={`${inputClass} max-w-44`}
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        ) : null}
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />
          Mark review complete
        </label>
      </div>
      <Button type="submit" className="mt-4" loading={busy}>
        Save feedback
      </Button>
    </form>
  );
}
