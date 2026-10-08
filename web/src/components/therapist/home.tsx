"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EthicsBadge } from "@/components/ethics-badge";
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorPanel,
  LoadingBlock,
  PageHeader,
  Panel,
  StatTile,
  secondaryActionClass,
} from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import type { PortalMeta } from "@/lib/portals";
import type { AuthUser } from "@/lib/api";
import {
  acceptIntakeCase,
  fetchDashboard,
  fetchIntakeCases,
  formatDay,
  formatTime,
  isToday,
  sessionModeLabel,
  sessionStatusLabel,
  type IntakeCase,
  type TherapistDashboard,
} from "@/lib/therapist";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function activityTone(type: string): "teal" | "slate" | "sky" | "amber" | "emerald" {
  if (type === "session") return "teal";
  if (type === "assessment") return "sky";
  if (type === "message") return "slate";
  if (type === "homework") return "emerald";
  return "amber";
}

export function TherapistHome({ user, portal }: { user: AuthUser; portal: PortalMeta }) {
  const [data, setData] = useState<TherapistDashboard | null>(null);
  const [cases, setCases] = useState<IntakeCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCase, setBusyCase] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchDashboard()
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) setError(messageFor(err));
      });

    fetchIntakeCases()
      .then((response) => {
        if (!cancelled) setCases(response.cases ?? []);
      })
      .catch(() => {
        // The intake queue is secondary - the dashboard still works without it.
        if (!cancelled) setCases([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function acceptCase(caseId: string) {
    setBusyCase(caseId);
    try {
      await acceptIntakeCase(caseId);
      setCases((prev) =>
        (prev ?? []).map((item) =>
          item.id === caseId ? { ...item, status: "accepted" } : item
        )
      );
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusyCase(null);
    }
  }

  const name = user.fullName ?? user.email;
  const pendingCases = (cases ?? []).filter((item) => item.status !== "accepted");

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${name.split(" ")[0]}`}
        description={portal.tagline}
        action={
          <Link href="/portal/therapist/clients" className={secondaryActionClass}>
            Open caseload
          </Link>
        }
      />

      <div className="mb-6">
        <EthicsBadge roleTitle="Licensed Therapist" />
      </div>

      {error && !data ? <div className="mb-6"><ErrorPanel message={error} onRetry={() => window.location.reload()} /></div> : null}

      {!data && !error ? (
        <LoadingBlock label="Loading your practice..." />
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label="Today"
              value={data.stats.todaySessions}
              hint={data.stats.pendingRequests ? `${data.stats.pendingRequests} awaiting confirmation` : "Sessions on the books"}
              href="/portal/therapist/sessions?status=scheduled"
            />
            <StatTile
              label="This week"
              value={data.stats.sessionsThisWeek}
              href="/portal/therapist/calendar"
            />
            <StatTile
              label="Active clients"
              value={data.stats.activeClients}
              href="/portal/therapist/clients"
            />
            <StatTile
              label="Assessments to review"
              value={data.stats.pendingAssessments}
              href="/portal/therapist/assessments"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
              <Panel
                title="Today & upcoming"
                action={
                  <Link
                    href="/portal/therapist/sessions"
                    className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                  >
                    All sessions
                  </Link>
                }
              >
                {data.todaySessions.length === 0 && data.upcoming.length === 0 ? (
                  <EmptyState
                    title="Nothing scheduled"
                    body="Confirmed bookings and appointment requests appear here as soon as a client books."
                    action={
                      <Link href="/portal/therapist/calendar" className={secondaryActionClass}>
                        View calendar
                      </Link>
                    }
                  />
                ) : (
                  <ul className="space-y-2">
                    {[...data.todaySessions, ...data.upcoming]
                      .slice(0, 6)
                      .map((session) => {
                        const noteMissing = session.status === "completed" && !session.noteId;
                        return (
                          <li key={session.id}>
                            <Link
                              href={
                                session.noteId || session.status === "completed"
                                  ? `/portal/therapist/sessions/${session.id}/notes`
                                  : `/portal/therapist/sessions`
                              }
                              className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-3.5 py-3 transition hover:border-teal-400/60 dark:border-slate-800 dark:bg-slate-800/40"
                            >
                              <Avatar name={session.clientName} url={session.clientAvatar} size="sm" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                  {session.clientName ?? "Client"}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                                  {isToday(session.scheduledAt) ? "Today" : formatDay(session.scheduledAt)}
                                  {" · "}
                                  {formatTime(session.scheduledAt)}
                                  {" · "}
                                  {session.durationMinutes} min · {sessionModeLabel(session.mode)}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {noteMissing ? <Badge tone="amber">Note due</Badge> : null}
                                <Badge tone={session.status === "completed" ? "emerald" : session.status === "cancelled" ? "rose" : "teal"}>
                                  {sessionStatusLabel(session.status)}
                                </Badge>
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Recent activity"
                action={
                  <Link
                    href="/portal/therapist/progress"
                    className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                  >
                    Progress
                  </Link>
                }
              >
                {data.activity.length === 0 ? (
                  <EmptyState
                    title="No activity yet"
                    body="Sessions, assessments, messages and plan updates land here as your caseload moves."
                  />
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.activity.slice(0, 7).map((event, index) => (
                      <li key={`${event.type}-${index}`}>
                        {event.link ? (
                          <Link href={event.link} className="flex items-start gap-3 py-3 hover:opacity-80">
                            <ActivityRow event={event} />
                          </Link>
                        ) : (
                          <div className="flex items-start gap-3 py-3">
                            <ActivityRow event={event} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="space-y-6 lg:col-span-2">
              <Panel
                title="Needs your review"
                action={
                  <Link
                    href="/portal/therapist/assessments"
                    className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                  >
                    Open inbox
                  </Link>
                }
              >
                {data.stats.pendingAssessments === 0 ? (
                  <EmptyState
                    title="Assessment inbox clear"
                    body="Completed client assessments queue here for review and scoring bands."
                  />
                ) : (
                  <div className="rounded-2xl bg-sky-50 px-4 py-3 dark:bg-sky-500/10">
                    <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                      {data.stats.pendingAssessments}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      completed assessments waiting to be read and marked reviewed.
                    </p>
                    <Link
                      href="/portal/therapist/assessments"
                      className="mt-3 inline-flex rounded-xl bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-sky-800"
                    >
                      Review now
                    </Link>
                  </div>
                )}
              </Panel>

              <Panel
                title="Intake queue"
                action={
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-500">
                    {pendingCases.length} pending
                  </span>
                }
              >
                {cases === null ? (
                  <LoadingBlock label="Checking matches..." />
                ) : pendingCases.length === 0 ? (
                  <EmptyState
                    title="No cases waiting"
                    body="Matched clients offered against your registration, modalities and languages appear here."
                  />
                ) : (
                  <ul className="space-y-3">
                    {pendingCases.slice(0, 3).map((item) => (
                      <li
                        key={item.id}
                        className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {item.clientAlias}, {item.age}
                          </p>
                          <Badge tone="emerald">{item.matchedScore}% match</Badge>
                        </div>
                        <p className="mt-1 text-xs font-medium text-teal-700 dark:text-teal-300">
                          {item.primaryConcern}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {item.aiRecommendationReason}
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busyCase === item.id}
                            onClick={() => acceptCase(item.id)}
                            className="rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                          >
                            {busyCase === item.id ? "Accepting..." : "Accept into caseload"}
                          </button>
                          <span className="text-[11px] text-slate-500 dark:text-slate-500">
                            {item.urgency} urgency · {item.preferredMode}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Notifications"
                action={
                  <Link
                    href="/portal/therapist/notifications"
                    className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                  >
                    See all
                  </Link>
                }
              >
                {data.notifications.length === 0 ? (
                  <EmptyState title="Nothing new" body="Appointment requests, messages and assessment completions notify you here." />
                ) : (
                  <ul className="space-y-2">
                    {data.notifications.slice(0, 4).map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-2 rounded-xl px-2 py-2 text-xs leading-5"
                      >
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            item.readAt ? "bg-slate-300 dark:bg-slate-700" : "bg-teal-600"
                          }`}
                        />
                        <span className={item.readAt ? "text-slate-500 dark:text-slate-400" : "font-medium text-slate-800 dark:text-slate-100"}>
                          {item.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                Safeguarding note: anything urgent belongs in a documented escalation rather than a
                message thread. Escalations stay visible to the clinical supervisor.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ActivityRow({ event }: { event: TherapistDashboard["activity"][number] }) {
  return (
    <>
      <span
        className={`mt-1 h-7 w-7 shrink-0 rounded-lg text-center text-[10px] font-bold leading-7 ${
          event.type === "session"
            ? "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300"
            : event.type === "assessment"
              ? "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"
              : event.type === "homework"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        }`}
      >
        {event.type === "session" ? "S" : event.type === "assessment" ? "A" : event.type === "message" ? "M" : "P"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-700 dark:text-slate-200">{event.title}</span>
        <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-500">
          {formatDay(event.at)} · {formatTime(event.at)}
          {event.clientName ? ` · ${event.clientName}` : ""}
        </span>
      </span>
      <Badge tone={activityTone(event.type)}>{event.type.replace("_", " ")}</Badge>
    </>
  );
}
