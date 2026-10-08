"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TherapistPage } from "@/components/therapist/shell";
import { Alert, Button, EmptyState, LinkButton, LoadingState } from "@/components/ui";
import {
  Avatar,
  Badge,
  PageHeader,
  SegmentedControl,
} from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  confirmSession,
  fetchSessions,
  formatDay,
  formatTime,
  isToday,
  sessionModeLabel,
  sessionStatusLabel,
  type TherapistSession,
} from "@/lib/therapist";

type StatusFilter = "all" | "scheduled" | "completed" | "cancelled";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function SessionsClient() {
  const searchParams = useSearchParams();
  const initial = searchParams.get("status");
  const [status, setStatus] = useState<StatusFilter>(
    initial === "scheduled" || initial === "completed" || initial === "cancelled" ? initial : "all"
  );
  const [sessions, setSessions] = useState<TherapistSession[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchSessions(status === "all" ? {} : { status });
      setSessions(response.sessions);
      setCounts(response.counts ?? {});
      setError(null);
    } catch (err) {
      setSessions(null);
      setError(messageFor(err));
    }
  }, [status]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function handleConfirm(sessionId: string) {
    setConfirming(sessionId);
    try {
      await confirmSession(sessionId);
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setConfirming(null);
    }
  }

  const scheduledCount = counts.scheduled ?? 0;

  return (
    <TherapistPage>
      <PageHeader
        title="Sessions"
        description="Everything on your books: appointment requests awaiting confirmation, upcoming appointments and completed sessions with their notes."
        action={
          <LinkButton href="/portal/therapist/calendar" variant="secondary">
            Calendar
          </LinkButton>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel="Filter sessions"
          value={status}
          onChange={setStatus}
          options={FILTERS.map((filter) => {
            const count =
              filter.value === "all"
                ? Object.values(counts).reduce((sum, value) => sum + value, 0)
                : counts[filter.value] ?? 0;
            return {
              value: filter.value,
              label: count > 0 ? `${filter.label} (${count})` : filter.label,
            };
          })}
        />
        {scheduledCount > 0 && status === "scheduled" ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Confirming marks a client&apos;s request as booked.
          </span>
        ) : null}
      </div>

      {error && sessions === null ? (
        <EmptyState
          title="We could not load your sessions"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      ) : null}

      {error && sessions !== null ? (
        <div className="mb-5">
          <Alert
            tone="danger"
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            }
          >
            {error}
          </Alert>
        </div>
      ) : null}

      {sessions === null && !error ? <LoadingState label="Loading sessions" /> : null}

      {sessions !== null ? (
        sessions.length === 0 ? (
          <EmptyState
            title={
              status === "all"
                ? "No sessions yet"
                : `No ${FILTERS.find((filter) => filter.value === status)?.label.toLowerCase() ?? status} sessions`
            }
            description="Sessions appear once a client books, or when you confirm an appointment request from the messages."
            action={
              <LinkButton href="/portal/therapist/calendar" variant="primary">
                Open calendar
              </LinkButton>
            }
          />
        ) : (
          <ul className="space-y-3">
            {sessions.map((session) => {
              const awaitingConfirmation =
                session.status === "scheduled" && !session.confirmedAt;
              return (
                <li
                  key={session.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-center gap-4">
                    <Avatar name={session.clientName} url={session.clientAvatar} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {session.clientName ?? "Client"}
                        </p>
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
                        {awaitingConfirmation ? <Badge tone="amber">Needs confirmation</Badge> : null}
                        {session.noteStatus === "final" ? <Badge tone="emerald">Note final</Badge> : null}
                        {session.noteStatus === "draft" ? <Badge tone="amber">Note draft</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        <time dateTime={session.scheduledAt}>
                          {isToday(session.scheduledAt) ? "Today" : formatDay(session.scheduledAt)} ·{" "}
                          {formatTime(session.scheduledAt)}
                        </time>{" "}
                        · {session.durationMinutes} min · {sessionModeLabel(session.mode)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500">
                        {session.status === "completed"
                          ? session.noteId
                            ? "Session completed - note on file"
                            : "Session completed - note not written yet"
                          : awaitingConfirmation
                            ? "Client booking awaiting your confirmation"
                            : "Confirmed"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <LinkButton
                        href={`/portal/therapist/clients/${session.clientId}`}
                        variant="secondary"
                        size="sm"
                      >
                        Client
                      </LinkButton>
                      {awaitingConfirmation ? (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={confirming === session.id}
                          onClick={() => handleConfirm(session.id)}
                        >
                          Confirm booking
                        </Button>
                      ) : null}
                      {session.status === "completed" || session.noteId ? (
                        <LinkButton
                          href={`/portal/therapist/sessions/${session.id}/notes`}
                          variant="secondary"
                          size="sm"
                        >
                          {session.noteId ? "Open note" : "Write note"}
                        </LinkButton>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </TherapistPage>
  );
}
