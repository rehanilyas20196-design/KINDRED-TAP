"use client";

import { useCallback, useEffect, useState } from "react";
import { TherapistPage } from "@/components/therapist/shell";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { DataRow, Panel } from "@/components/therapist/ui";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LinkButton,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import {
  fetchAssessment,
  formatDay,
  formatDateTime,
  reviewAssessment,
  scoreBand,
  type AssessmentDetailResponse,
} from "@/lib/therapist";

export default function AssessmentDetailClient({ assessmentId }: { assessmentId: string }) {
  const [data, setData] = useState<AssessmentDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetchAssessment(assessmentId);
      setData(response);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [assessmentId]);

  const reload = useCallback(() => {
    setData(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function markReviewed() {
    setBusy(true);
    setActionError(null);
    try {
      const response = await reviewAssessment(assessmentId);
      setData((prev) =>
        prev ? { ...prev, assessment: { ...prev.assessment, reviewedAt: response.reviewedAt } } : prev
      );
    } catch (err) {
      setActionError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <TherapistPage>
        <EmptyState
          title="We could not load this assessment"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      </TherapistPage>
    );
  }
  if (!data) {
    return (
      <TherapistPage>
        <LoadingState label="Loading assessment" />
      </TherapistPage>
    );
  }

  const { assessment, answers, previous } = data;
  const delta =
    previous && previous.percent !== null && assessment.percent !== null
      ? assessment.percent - previous.percent
      : null;

  const grouped = answers.reduce<Record<number, typeof answers>>((acc, answer) => {
    (acc[answer.testNumber] ??= []).push(answer);
    return acc;
  }, {});

  return (
    <TherapistPage>
      <Link
        href="/portal/therapist/assessments"
        className="mb-2.5 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline dark:text-teal-300 dark:hover:text-teal-100"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Assessments
      </Link>

      <PageTitle
        description={
          assessment.completedAt ? (
            <>
              Completed{" "}
              <time dateTime={assessment.completedAt}>
                {formatDateTime(assessment.completedAt)}
              </time>
            </>
          ) : (
            "Assessment still in progress"
          )
        }
        action={
          <>
            <LinkButton
              href={`/portal/therapist/clients/${assessment.clientId}`}
              variant="secondary"
              size="sm"
            >
              Client profile
            </LinkButton>
            {!assessment.reviewedAt ? (
              <Button size="sm" loading={busy} onClick={() => void markReviewed()}>
                {busy ? "Saving..." : "Mark reviewed"}
              </Button>
            ) : (
              <Badge tone="success">
                Reviewed{" "}
                <time dateTime={assessment.reviewedAt ?? undefined}>
                  {formatDay(assessment.reviewedAt ?? "")}
                </time>
              </Badge>
            )}
          </>
        }
      >
        {assessment.clientName} · {assessment.type}
      </PageTitle>

      {actionError ? (
        <div className="mb-5">
          <Alert tone="danger" title="We could not mark that reviewed">
            {actionError}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Result">
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  {assessment.percent === null ? "—" : `${assessment.percent}%`}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {scoreBand(assessment.percent) ?? "No band yet"}
                </p>
              </div>
              <dl className="flex-1 divide-y divide-slate-100 dark:divide-slate-800">
                <DataRow label="Scored items">
                  {assessment.scored} of {assessment.totalScore ? Math.round(assessment.totalScore) : 0} points
                </DataRow>
                <DataRow label="Primary issue">{assessment.primaryIssueKey ?? "—"}</DataRow>
                <DataRow label="Secondary">
                  {assessment.secondaryIssues?.length ? assessment.secondaryIssues.join(", ") : "—"}
                </DataRow>
                <DataRow label="Source">{assessment.source ?? "—"}</DataRow>
              </dl>
            </div>

            <p className="mt-4 text-[11px] leading-5 text-slate-500 dark:text-slate-500">
              The percentage is the share of answered questions, each worth up to 5 points. It is
              shown as a band only - not a diagnosis, and not a substitute for your clinical
              formulation.
            </p>
          </Panel>

          {assessment.safetyMessage ? (
            <div className="mb-5">
              <Alert
                tone="danger"
                title={assessment.isHighRisk ? "High risk reported" : "Safety flag"}
              >
                <p>{assessment.safetyMessage}</p>
                <p className="mt-2 text-[11px] text-red-700/80">
                  Handle under your safeguarding protocol and document any escalation.
                </p>
              </Alert>
            </div>
          ) : null}

          {assessment.summary ? (
            <Panel title="Client summary">
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{assessment.summary}</p>
            </Panel>
          ) : null}

          <Panel title={`Answers (${answers.length})`}>
            {answers.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No answers recorded for this sitting.
              </p>
            ) : (
              <div className="space-y-6">
                {Object.entries(grouped).map(([testNumber, items]) => (
                  <div key={testNumber}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                      Test {testNumber}
                    </p>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {items.map((answer) => (
                        <li key={answer.questionId} className="flex items-start gap-3 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-slate-700 dark:text-slate-200">
                              {answer.prompt}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-500">
                              {answer.category} · {answer.questionType}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {answer.answerText ??
                                (answer.answerValue !== null ? answer.answerValue : "—")}
                            </span>
                            {answer.score !== null ? (
                              <span className="text-[11px] text-slate-500 dark:text-slate-500">
                                score {answer.score}/5
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Compared with last time">
            {!previous ? (
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                This is the first completed assessment on file for this client, so there is nothing to
                compare against yet.
              </p>
            ) : (
              <>
                <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                  <DataRow label="Previous">
                    {previous.percent === null ? "—" : `${previous.percent}%`}
                  </DataRow>
                  <DataRow label="When">
                    {previous.completedAt ? (
                      <time dateTime={previous.completedAt}>{formatDay(previous.completedAt)}</time>
                    ) : (
                      "—"
                    )}
                  </DataRow>
                  <DataRow label="Band">{scoreBand(previous.percent) ?? "—"}</DataRow>
                  <DataRow label="Change">
                    {delta === null ? (
                      "—"
                    ) : (
                      <span
                        className={
                          delta > 0
                            ? "font-semibold text-amber-600 dark:text-amber-400"
                            : delta < 0
                              ? "font-semibold text-emerald-600 dark:text-emerald-400"
                              : "text-slate-500 dark:text-slate-400"
                        }
                      >
                        {delta > 0 ? "+" : ""}
                        {delta} points
                      </span>
                    )}
                  </DataRow>
                </dl>
                <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-500">
                  Direction of travel only. Read the item-level answers before deciding anything about
                  the formulation.
                </p>
              </>
            )}
          </Panel>

          <Panel title="Next steps">
            <div className="space-y-2">
              <LinkButton
                href="/portal/therapist/sessions?status=scheduled"
                variant="secondary"
                size="sm"
                className="w-full justify-start"
              >
                Upcoming sessions
              </LinkButton>
              <LinkButton
                href={`/portal/therapist/treatment-plans?clientId=${assessment.clientId}`}
                variant="secondary"
                size="sm"
                className="w-full justify-start"
              >
                Treatment plan
              </LinkButton>
            </div>
          </Panel>
        </div>
      </div>
    </TherapistPage>
  );
}
