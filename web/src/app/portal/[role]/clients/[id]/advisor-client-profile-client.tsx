"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LinkButton,
  LoadingState,
  PageTitle,
  type Tone,
} from "@/components/ui";
import { DataRow, Panel, ProgressBar, StatTile } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import {
  escalationStatusLabel,
  fetchClient,
  formatDay,
  formatDateTime,
  type AdvisorClientDetail,
} from "@/lib/advisor";

const SESSION_TONE: Record<string, Tone> = {
  completed: "success",
  scheduled: "accent",
  confirmed: "accent",
  cancelled: "danger",
  no_show: "warning",
};

const PLAN_TONE: Record<string, Tone> = {
  active: "accent",
  completed: "success",
  paused: "warning",
  cancelled: "neutral",
};

const PRIORITY_TONE: Record<string, Tone> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function AdvisorClientProfileClient({ clientId }: { clientId: string }) {
  const [data, setData] = useState<AdvisorClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchClient(clientId));
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [clientId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (error && data === null) {
    return (
      <AdvisorPage>
        <EmptyState
          title="We could not load this client"
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
        <LoadingState label="Loading client" />
      </AdvisorPage>
    );
  }

  const { client, therapist, stats, sessions, assessments, plans, escalations } = data;

  return (
    <AdvisorPage>
      <Link
        href="/portal/clinical_advisor/clients"
        className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline dark:text-teal-300 dark:hover:text-teal-100"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Clients
      </Link>

      <PageTitle
        description={
          <>
            Joined{" "}
            <time dateTime={client.joinedAt}>{formatDay(client.joinedAt)}</time>
            {" · "}
            {humanize(client.accountStatus)}
          </>
        }
        action={
          therapist ? (
            <LinkButton
              href={`/portal/clinical_advisor/therapists/${therapist.id}`}
              variant="secondary"
              size="sm"
            >
              Treating therapist
            </LinkButton>
          ) : undefined
        }
      >
        {client.fullName}
      </PageTitle>

      {error ? (
        <div className="mb-5">
          <Alert tone="warning" title="We could not refresh this client">
            {error}
          </Alert>
        </div>
      ) : null}

      <div className="mb-6">
        <Alert tone="info">
          This is an oversight view. Session notes, formulations and anything written about this
          client&apos;s treatment stay with their therapist and are never sent to this portal.
        </Alert>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.totalSessions > 0 ? (
          <StatTile
            label="Sessions"
            value={stats.totalSessions}
            hint={`${stats.completedSessions} completed`}
          />
        ) : null}
        {stats.cancelledSessions > 0 ? (
          <StatTile label="Cancelled" value={stats.cancelledSessions} />
        ) : null}
        <StatTile label="Next session" value={formatDay(stats.nextSessionAt)} />
        {(stats.progressPercent ?? 0) > 0 ? (
          <StatTile label="Progress" value={`${stats.progressPercent ?? 0}%`} />
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Panel title="Treatment progress">
            <ProgressBar percent={stats.progressPercent ?? 0} tone="teal" />
            <div className="mt-4">
              <DataRow label="Assigned therapist">
                {therapist ? (
                  <Link
                    href={`/portal/clinical_advisor/therapists/${therapist.id}`}
                    className="font-semibold text-teal-700 hover:underline dark:text-teal-300"
                  >
                    {therapist.fullName}
                  </Link>
                ) : (
                  "Not assigned"
                )}
              </DataRow>
              <DataRow label="Last session">
                {stats.lastSessionAt ? (
                  <time dateTime={stats.lastSessionAt}>{formatDay(stats.lastSessionAt)}</time>
                ) : (
                  "—"
                )}
              </DataRow>
              <DataRow label="Preferred language">{client.preferredLanguage ?? "—"}</DataRow>
              <DataRow label="City">{client.city ?? "—"}</DataRow>
            </div>
          </Panel>

          <Panel title="Sessions">
            {sessions.length === 0 ? (
              <EmptyState
                title="No sessions yet"
                description="Booked sessions appear here as soon as the clinic schedules them."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        <time dateTime={session.scheduledAt}>
                          {formatDateTime(session.scheduledAt)}
                        </time>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {session.therapistName} · {session.durationMinutes} min · {session.mode}
                      </p>
                    </div>
                    <Badge tone={SESSION_TONE[session.status] ?? "neutral"} dot>
                      {humanize(session.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Assessments">
            {assessments.length === 0 ? (
              <EmptyState
                title="No assessments yet"
                description="Completed assessments are scored, never diagnosed."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {assessments.map((assessment) => (
                  <li
                    key={assessment.id}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/portal/clinical_advisor/assessments/${assessment.id}`}
                        className="text-sm font-semibold text-slate-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-300"
                      >
                        {assessment.primaryIssue ?? assessment.type} · {assessment.percent ?? 0}%
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {assessment.completedAt ? (
                          <>
                            completed{" "}
                            <time dateTime={assessment.completedAt}>
                              {formatDay(assessment.completedAt)}
                            </time>
                          </>
                        ) : (
                          "not completed yet"
                        )}
                        {assessment.reviewedAt ? (
                          <>
                            {" · reviewed "}
                            <time dateTime={assessment.reviewedAt}>
                              {formatDay(assessment.reviewedAt)}
                            </time>
                          </>
                        ) : (
                          " · awaiting review"
                        )}
                      </p>
                    </div>
                    {assessment.isHighRisk ? (
                      <Badge tone="danger" dot>
                        High risk
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Panel title="Treatment plans">
            {plans.length === 0 ? (
              <EmptyState
                title="No plans yet"
                description="Active treatment plans show goal progress here."
              />
            ) : (
              <ul className="space-y-3">
                {plans.map((plan) => (
                  <li
                    key={plan.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {plan.title}
                      </p>
                      <Badge tone={PLAN_TONE[plan.status] ?? "neutral"}>
                        {humanize(plan.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {plan.goalCount} goals · {plan.progressPercent ?? 0}%
                      {plan.therapistName ? ` · ${plan.therapistName}` : ""}
                    </p>
                    <div className="mt-2">
                      <ProgressBar percent={plan.progressPercent ?? 0} tone="teal" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Escalations">
            {escalations.length === 0 ? (
              <EmptyState
                title="No open escalations"
                description="Safeguarding escalations about this client appear here."
              />
            ) : (
              <ul className="space-y-2">
                {escalations.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/portal/clinical_advisor/safety/${row.id}`}
                      className="card card-interactive flex flex-wrap items-center gap-2 p-4"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {row.reference}
                      </span>
                      <Badge tone={PRIORITY_TONE[row.priority] ?? "neutral"} dot>
                        {humanize(row.priority)}
                      </Badge>
                      <Badge tone="neutral">{escalationStatusLabel(row.status)}</Badge>
                    </Link>
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
