"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import { Alert, Badge, Button, EmptyState, LoadingState, PageTitle, type Tone } from "@/components/ui";
import { DataRow, Panel, ProgressBar } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import {
  fetchAssessment,
  formatDateTime,
  reviewAssessment,
  type AdvisorAssessmentDetail,
} from "@/lib/advisor";

const STATUS_TONE: Record<string, Tone> = {
  completed: "success",
  in_progress: "info",
  inProgress: "info",
  abandoned: "neutral",
};

function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function AdvisorAssessmentDetailClient({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const [data, setData] = useState<AdvisorAssessmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(
    null
  );

  const load = useCallback(async () => {
    try {
      setData(await fetchAssessment(assessmentId));
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [assessmentId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function markReviewed() {
    setBusy(true);
    setNotice(null);
    try {
      await reviewAssessment(assessmentId);
      setNotice({ tone: "success", message: "Marked reviewed." });
      await load();
    } catch (err) {
      setNotice({ tone: "danger", message: messageFor(err) });
    } finally {
      setBusy(false);
    }
  }

  if (error && data === null) {
    return (
      <AdvisorPage>
        <EmptyState
          title="We could not load this assessment"
          description={error}
          action={
            <Button
              onClick={() => {
                setError(null);
                void load();
              }}
            >
              Try again
            </Button>
          }
        />
      </AdvisorPage>
    );
  }
  if (data === null) {
    return (
      <AdvisorPage>
        <LoadingState label="Loading assessment" />
      </AdvisorPage>
    );
  }

  const { assessment, answers } = data;
  const scoreEntries = Object.entries(assessment.scores ?? {});

  return (
    <AdvisorPage>
      <Link
        href="/portal/clinical_advisor/assessments"
        className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline dark:text-teal-300 dark:hover:text-teal-100"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Assessments
      </Link>

      <PageTitle
        description={
          <>
            {assessment.primaryIssue ?? assessment.type} · completed{" "}
            <time dateTime={assessment.completedAt ?? undefined}>
              {formatDateTime(assessment.completedAt)}
            </time>
          </>
        }
        action={
          assessment.reviewedAt ? (
            <Badge tone="success" dot>
              Reviewed{" "}
              <time dateTime={assessment.reviewedAt}>
                {formatDateTime(assessment.reviewedAt)}
              </time>
            </Badge>
          ) : assessment.status !== "completed" ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Only completed assessments can be marked reviewed.
            </span>
          ) : (
            <Button
              loading={busy}
              disabled={assessment.status !== "completed"}
              onClick={() => void markReviewed()}
            >
              Mark reviewed
            </Button>
          )
        }
      >
        {`Assessment · ${assessment.clientName}`}
      </PageTitle>

      {error ? (
        <div className="mb-5">
          <Alert tone="warning" title="We could not refresh this assessment">
            {error}
          </Alert>
        </div>
      ) : null}

      {notice ? (
        <div className="mb-5">
          <Alert tone={notice.tone}>{notice.message}</Alert>
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={STATUS_TONE[assessment.status] ?? "neutral"} dot>
          Status: {humanize(assessment.status)}
        </Badge>
        <Badge tone="info">Score: {assessment.percent ?? 0}%</Badge>
        {assessment.isHighRisk ? (
          <Badge tone="danger" dot>
            High risk flag
          </Badge>
        ) : null}
        <Badge tone="neutral">
          Source: {assessment.source ? humanize(assessment.source) : "Not recorded"}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Panel title="Summary">
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {assessment.summary || "No summary recorded."}
            </p>
            {assessment.safetyMessage ? (
              <div className="mt-3">
                <Alert tone="danger">{assessment.safetyMessage}</Alert>
              </div>
            ) : null}
            <div className="mt-4">
              <DataRow label="Primary issue">{assessment.primaryIssue ?? "—"}</DataRow>
              <DataRow label="Also reported">
                {assessment.secondaryIssues.join(", ") || "—"}
              </DataRow>
              <DataRow label="Treating therapist">{assessment.therapistName ?? "—"}</DataRow>
              <DataRow label="Started">
                <time dateTime={assessment.startedAt ?? undefined}>
                  {formatDateTime(assessment.startedAt)}
                </time>
              </DataRow>
              <DataRow label="Completed">
                <time dateTime={assessment.completedAt ?? undefined}>
                  {formatDateTime(assessment.completedAt)}
                </time>
              </DataRow>
              <DataRow label="Reviewed">
                {assessment.reviewedAt ? (
                  <time dateTime={assessment.reviewedAt}>
                    {formatDateTime(assessment.reviewedAt)}
                  </time>
                ) : (
                  "Not yet reviewed"
                )}
              </DataRow>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-500">
              These are scores from a self-report questionnaire. They inform clinical judgement;
              they are not a diagnosis and must not be presented as one.
            </p>
          </Panel>

          <Panel title="Answers">
            <ul className="space-y-3">
              {answers.map((answer, index) => (
                <li
                  key={`${answer.category}-${index}`}
                  className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {answer.prompt}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {answer.answerText ??
                      (answer.answerValue !== null ? `Answered ${answer.answerValue}` : "No answer")}
                    {" · "}
                    {answer.category} · score {answer.score ?? "—"}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Panel title="Overall">
            <ProgressBar
              percent={assessment.percent ?? 0}
              tone={assessment.isHighRisk ? "rose" : "teal"}
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {assessment.scored} questions scored.
            </p>
          </Panel>

          <Panel title="Category scores">
            {scoreEntries.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No category scores.</p>
            ) : (
              <ul className="space-y-3">
                {scoreEntries.map(([label, value]) => (
                  <li key={label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {humanize(label)}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">{value}</span>
                    </div>
                    <ProgressBar
                      percent={value}
                      tone={value >= 70 ? "rose" : value >= 40 ? "amber" : "emerald"}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </AdvisorPage>
  );
}
