"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TherapistPage } from "@/components/therapist/shell";
import { Alert, Button, EmptyState, LinkButton, LoadingState } from "@/components/ui";
import {
  Avatar,
  Badge,
  DataRow,
  Field,
  PageHeader,
  Panel,
  ProgressBar,
  StatTile,
  inputClass,
} from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  fetchClient,
  formatDateTime,
  patchClientStatus,
  scoreBand,
  sessionModeLabel,
  sessionStatusLabel,
  type CaseStatus,
  type ClientDetail,
} from "@/lib/therapist";

const STATUS_OPTIONS: { value: CaseStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

function statusLabel(status: CaseStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function simpleLabel(value: string): string {
  const label = value.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function ClientProfileClient({ clientId }: { clientId: string }) {
  const [data, setData] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchClient(clientId);
      setData(response);
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

  async function changeStatus(value: CaseStatus) {
    if (!data || value === data.client.therapyStatus) return;
    setBusy(true);
    setStatusError(null);
    try {
      await patchClientStatus(clientId, value);
      await load();
    } catch (err) {
      setStatusError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <TherapistPage>
        <PageHeader title="Client profile" description="This client's record could not be opened." />
        <EmptyState
          title="We could not load this client"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      </TherapistPage>
    );
  }
  if (!data) {
    return (
      <TherapistPage>
        <PageHeader title="Client profile" />
        <LoadingState label="Loading client" />
      </TherapistPage>
    );
  }

  const { client, stats, initialAssessment, latestAssessment, plan, sessions, activity, homework, conversationId } = data;
  const percent = latestAssessment?.percent ?? null;

  return (
    <TherapistPage>
      <PageHeader
        back={{ href: "/portal/therapist/clients", label: "Caseload" }}
        title={client.fullName}
        description={
          client.concernSummary ??
          (client.whatBroughtYouHere ? client.whatBroughtYouHere.slice(0, 140) : "No intake summary yet")
        }
        action={
          <>
            <LinkButton
              href={
                conversationId
                  ? `/portal/therapist/messages/${conversationId}`
                  : "/portal/therapist/messages"
              }
              variant="secondary"
            >
              Message
            </LinkButton>
            <LinkButton
              href={`/portal/therapist/treatment-plans?clientId=${client.id}`}
              variant="primary"
            >
              Treatment plan
            </LinkButton>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Avatar name={client.fullName} url={client.avatarUrl} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{client.fullName}</p>
            <Badge tone="teal">{statusLabel(client.therapyStatus)}</Badge>
            {client.isHighRisk ? <Badge tone="rose">High risk flagged</Badge> : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {client.email} · Joined <time dateTime={client.joinedAt}>{new Date(client.joinedAt).toLocaleDateString()}</time>
            {client.preferredLanguage ? ` · ${client.preferredLanguage}` : ""}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Field label="Case status" className="w-full sm:w-40">
            <select
              value={client.therapyStatus}
              disabled={busy}
              aria-label="Case status"
              onChange={(event) => changeStatus(event.target.value as CaseStatus)}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {statusError ? (
          <div className="w-full">
            <Alert tone="danger">{statusError}</Alert>
          </div>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Sessions"
          value={`${stats.completedSessions}/${stats.totalSessions}`}
          hint="completed"
        />
        <StatTile
          label="Notes written"
          value={`${stats.notesFinal}/${stats.notesTotal}`}
          hint="finalised"
        />
        <StatTile label="Assessments" value={stats.assessmentsInProgress} hint="in progress" />
        <StatTile
          label="Homework"
          value={`${stats.homeworkCompleted}/${stats.homeworkTotal}`}
          hint="completed"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Panel title="Intake & formulation">
            {client.whatBroughtYouHere || client.concernDescription ? (
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                {client.concernDescription ?? client.whatBroughtYouHere}
              </p>
            ) : (
              <EmptyState
                title="No written intake"
                description="The client's assessment summary and free-text intake appear here once they complete onboarding."
              />
            )}
            <dl className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              <DataRow label="Primary concern">{client.concernKey ?? "—"}</DataRow>
              <DataRow label="Secondary">
                {client.concernSecondary?.length ? client.concernSecondary.join(", ") : "—"}
              </DataRow>
              <DataRow label="Support status">{client.supportStatus ?? "—"}</DataRow>
              <DataRow label="Data sharing consent">
                {client.consentedToDataSharing === null
                  ? "—"
                  : client.consentedToDataSharing
                    ? "Consented"
                    : "Not consented"}
              </DataRow>
              <DataRow label="Recorded">
                {client.concernAt ? (
                  <time dateTime={client.concernAt}>{formatDateTime(client.concernAt)}</time>
                ) : (
                  "—"
                )}
              </DataRow>
            </dl>
          </Panel>

          <Panel
            title="Sessions"
            action={
              <Link
                href="/portal/therapist/sessions"
                className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
              >
                All sessions
              </Link>
            }
          >
            {sessions.length === 0 ? (
              <EmptyState
                title="No sessions yet"
                description="Booked, confirmed and completed sessions for this client show up here."
                action={
                  <LinkButton href="/portal/therapist/calendar" variant="secondary">
                    Open calendar
                  </LinkButton>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.slice(0, 8).map((session) => {
                  const noteMissing = session.status === "completed" && !session.noteId;
                  return (
                    <li key={session.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          <time dateTime={session.scheduledAt}>{formatDateTime(session.scheduledAt)}</time>
                          <span className="text-slate-500 dark:text-slate-500">
                            {" · "}
                            {session.durationMinutes} min · {sessionModeLabel(session.mode)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {session.noteStatus ? (
                            <>
                              {simpleLabel(session.noteStatus)} note
                              {session.noteSessionDate ? (
                                <>
                                  {" · "}
                                  <time dateTime={session.noteSessionDate}>
                                    {session.noteSessionDate}
                                  </time>
                                </>
                              ) : null}
                            </>
                          ) : noteMissing ? (
                            "Note not written yet"
                          ) : (
                            "No note"
                          )}
                        </p>
                      </div>
                      <Badge
                        tone={
                          session.status === "completed"
                            ? "emerald"
                            : session.status === "cancelled"
                              ? "rose"
                              : "teal"
                        }
                      >
                        {sessionStatusLabel(session.status)}
                      </Badge>
                      {session.status === "completed" || session.noteId ? (
                        <LinkButton
                          href={`/portal/therapist/sessions/${session.id}/notes`}
                          variant="secondary"
                          size="sm"
                        >
                          {session.noteId ? "Open note" : "Write note"}
                        </LinkButton>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Activity">
            {activity.length === 0 ? (
              <EmptyState
                title="Nothing recorded yet"
                description="Sessions, assessments, notes and plan updates appear here chronologically."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {activity.slice(0, 8).map((event, index) => {
                  const row = (
                    <>
                      <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
                        {event.title}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-500">
                        <time dateTime={event.at}>{formatDateTime(event.at)}</time>
                      </span>
                    </>
                  );
                  return (
                    <li key={`${event.type}-${index}`}>
                      {event.link ? (
                        <Link href={event.link} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 py-2.5">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Panel
            title="Latest assessment"
            action={
              <Link
                href="/portal/therapist/assessments"
                className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
              >
                Inbox
              </Link>
            }
          >
            {!latestAssessment ? (
              <EmptyState
                title="Nothing completed yet"
                description="Completed intake and follow-up assessments appear here with their score band."
              />
            ) : (
              <>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                      {percent === null ? "—" : `${percent}%`}
                    </p>
                    <Badge tone={latestAssessment.reviewedAt ? "emerald" : "amber"}>
                      {latestAssessment.reviewedAt ? "Reviewed" : "Awaiting review"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {scoreBand(percent) ?? "No score band yet"} · {simpleLabel(latestAssessment.type)}
                    {latestAssessment.completedAt ? (
                      <>
                        {" · "}
                        <time dateTime={latestAssessment.completedAt}>
                          {formatDateTime(latestAssessment.completedAt)}
                        </time>
                      </>
                    ) : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                    Score band only - this is not a diagnosis.
                  </p>
                </div>
                {initialAssessment && initialAssessment.id !== latestAssessment.id ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Initial: {initialAssessment.percent === null ? "—" : `${initialAssessment.percent}%`} on{" "}
                    {initialAssessment.completedAt ? (
                      <time dateTime={initialAssessment.completedAt}>
                        {formatDateTime(initialAssessment.completedAt)}
                      </time>
                    ) : (
                      "—"
                    )}
                  </p>
                ) : null}
                <dl className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  <DataRow label="Primary issue">{latestAssessment.primaryIssueKey ?? "—"}</DataRow>
                  <DataRow label="High risk">
                    {latestAssessment.isHighRisk ? "Flagged" : "Not flagged"}
                  </DataRow>
                  <DataRow label="Source">{latestAssessment.source ?? "—"}</DataRow>
                </dl>
              </>
            )}
          </Panel>

          <Panel
            title="Treatment plan"
            action={
              <Link
                href="/portal/therapist/treatment-plans"
                className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
              >
                Plans
              </Link>
            }
          >
            {!plan ? (
              <EmptyState
                title="No plan yet"
                description="Write a goals and objectives plan so progress has something to be measured against."
                action={
                  <LinkButton
                    href={`/portal/therapist/treatment-plans?clientId=${client.id}`}
                    variant="primary"
                  >
                    Create plan
                  </LinkButton>
                }
              />
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{plan.title}</p>
                {plan.summary ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{plan.summary}</p>
                ) : null}
                <div className="mt-3 flex items-center gap-3">
                  <ProgressBar percent={plan.progressPercent ?? 0} />
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {plan.progressPercent ?? 0}%
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {plan.goalsCompleted} of {plan.goalCount} goals completed
                </p>
                <LinkButton
                  href={`/portal/therapist/treatment-plans/${plan.id}`}
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                >
                  Open plan
                </LinkButton>
              </>
            )}
          </Panel>

          <Panel title="Homework">
            {homework.length === 0 ? (
              <EmptyState
                title="No homework assigned"
                description="Assign between-session work from a session or the treatment plan."
              />
            ) : (
              <ul className="space-y-2">
                {homework.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50/70 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.title}</p>
                      <Badge
                        tone={item.status === "completed" ? "emerald" : item.status === "in_progress" ? "amber" : "slate"}
                      >
                        {simpleLabel(item.status)}
                      </Badge>
                    </div>
                    {item.details ? (
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.details}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                      {item.dueDate ? (
                        <>
                          Due <time dateTime={item.dueDate}>{new Date(item.dueDate).toLocaleDateString()}</time>
                        </>
                      ) : (
                        "No due date"
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </TherapistPage>
  );
}
