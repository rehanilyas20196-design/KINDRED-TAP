"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TherapistPage } from "@/components/therapist/shell";
import { Panel, SegmentedControl } from "@/components/therapist/ui";
import {
  Badge,
  Button,
  EmptyState,
  LinkButton,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import {
  fetchAssessments,
  formatDay,
  scoreBand,
  type AssessmentRow,
} from "@/lib/therapist";

type StatusFilter = "all" | "pending" | "completed";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  completed: "Completed",
  abandoned: "Abandoned",
};

export default function AssessmentsClient() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId");

  const [status, setStatus] = useState<StatusFilter>("pending");
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const [pending, setPending] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchAssessments({
        clientId: clientId ?? undefined,
        status: status === "all" ? undefined : status === "pending" ? "completed" : status,
      });
      setRows(response.assessments);
      setPending(response.pending);
      setTotal(response.total);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [status, clientId]);

  const reload = useCallback(() => {
    setRows(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const visible = (rows ?? []).filter((row) => {
    if (status === "pending") return row.status === "completed" && !row.reviewedAt;
    if (status === "completed") return row.status === "completed";
    return true;
  });

  return (
    <TherapistPage>
      <PageTitle
        description={
          clientId
            ? "Completed assessments for one client, with score bands only - never a diagnosis."
            : "Every completed assessment across your caseload. Read a result, check the band, then mark it reviewed."
        }
        action={
          <LinkButton href="/portal/therapist/clients" variant="secondary" size="sm">
            Caseload
          </LinkButton>
        }
      >
        Assessments
      </PageTitle>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel="Filter assessments"
          value={status}
          onChange={setStatus}
          options={[
            { value: "pending", label: pending > 0 ? `To review (${pending})` : "To review" },
            { value: "completed", label: "All completed" },
            { value: "all", label: total > 0 ? `Everything (${total})` : "Everything" },
          ]}
        />
        {clientId ? (
          <LinkButton href="/portal/therapist/assessments" variant="secondary" size="sm">
            Clear client filter
          </LinkButton>
        ) : null}
      </div>

      {error && rows === null ? (
        <EmptyState
          title="We could not load your assessments"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : rows === null ? (
        <LoadingState label="Loading assessments" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={status === "pending" ? "Inbox clear" : "No assessments yet"}
          description={
            status === "pending"
              ? "Every completed assessment has been read and marked reviewed."
              : "Assessments appear here as soon as a client completes one in their portal."
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <li key={row.id}>
              <Link
                href={`/portal/therapist/assessments/${row.id}`}
                className="card card-interactive block p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {row.clientName}
                      </p>
                      <Badge tone="neutral">{row.type}</Badge>
                      {row.status !== "completed" ? (
                        <Badge tone="warning" dot>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      ) : null}
                      {row.status === "completed" && !row.reviewedAt ? (
                        <Badge tone="warning" dot>
                          To review
                        </Badge>
                      ) : row.reviewedAt ? (
                        <Badge tone="success">Reviewed</Badge>
                      ) : null}
                      {row.isHighRisk ? <Badge tone="danger" dot>High risk flagged</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {row.primaryIssueKey ? `Primary issue: ${row.primaryIssueKey}` : "No primary issue recorded"}
                      {row.completedAt ? (
                        <>
                          {" · Completed "}
                          <time dateTime={row.completedAt}>{formatDay(row.completedAt)}</time>
                        </>
                      ) : null}
                    </p>
                    {row.summary ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {row.summary}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                      {row.percent === null ? "—" : `${row.percent}%`}
                    </p>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {scoreBand(row.percent) ?? "No band"}
                    </p>
                    {row.scored > 0 ? (
                      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-500">
                        {row.scored} scored items
                      </p>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Panel className="mt-6">
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          Scores are the share of answered questions, each worth up to 5 points, and are shown as a
          band only. Kindred Tap does not issue diagnoses, and a band is never a substitute for
          clinical judgement or a referral decision.
        </p>
      </Panel>
    </TherapistPage>
  );
}
