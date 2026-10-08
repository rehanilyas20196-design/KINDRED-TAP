"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TherapistPage } from "@/components/therapist/shell";
import { Button, EmptyState, LinkButton, LoadingState } from "@/components/ui";
import { Badge, PageHeader, Panel } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  fetchSessions,
  formatDateTime,
  formatTime,
  sessionModeLabel,
  sessionStatusLabel,
  type TherapistSession,
} from "@/lib/therapist";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Monday-first grid of the 42 days covering `cursor`'s month. */
function gridFor(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default function CalendarClient() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [sessions, setSessions] = useState<TherapistSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Date>(() => new Date());

  const days = useMemo(() => gridFor(cursor), [cursor]);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const from = days[0];
    const to = new Date(days[days.length - 1]);
    to.setDate(to.getDate() + 1);

    try {
      const response = await fetchSessions({ from: from.toISOString(), to: to.toISOString() });
      if (requestId !== requestRef.current) return;
      setSessions(response.sessions);
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setSessions(null);
      setError(messageFor(err));
    }
  }, [days]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, TherapistSession[]>();
    (sessions ?? []).forEach((session) => {
      const key = dayKey(new Date(session.scheduledAt));
      const list = map.get(key);
      if (list) list.push(session);
      else map.set(key, [session]);
    });
    return map;
  }, [sessions]);

  const daySessions = byDay.get(dayKey(selected)) ?? [];
  const today = new Date();

  function shiftMonth(delta: number) {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  return (
    <TherapistPage>
      <PageHeader
        title="Calendar"
        description="Month view of your diary. Select a day to confirm bookings, open notes or jump to a client."
        action={
          <LinkButton href="/portal/therapist/sessions" variant="secondary">
            List view
          </LinkButton>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <span aria-hidden="true">
              ←
            </span>
          </Button>
          <h2 className="w-full min-w-0 text-center text-sm font-semibold text-slate-900 dark:text-white sm:w-44">
            {monthLabel(cursor)}
          </h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <span aria-hidden="true">
              →
            </span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-teal-600" aria-hidden="true" /> Scheduled
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /> Completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" /> Cancelled
          </span>
        </div>
      </div>

      {error ? (
        <EmptyState
          title="We could not load your calendar"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      ) : sessions === null ? (
        <LoadingState label="Loading calendar" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {days.map((date) => {
                  const key = dayKey(date);
                  const inMonth = date.getMonth() === cursor.getMonth();
                  const isToday = isSameDay(date, today);
                  const isSelected = isSameDay(date, selected);
                  const items = byDay.get(key) ?? [];

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelected(date)}
                      aria-label={`${monthLabel(date)} ${date.getDate()}`}
                      aria-pressed={isSelected}
                      className={`min-h-20 border-b border-r border-slate-100 p-1.5 text-left transition last:border-r-0 dark:border-slate-800 ${
                        isSelected
                          ? "bg-teal-50 dark:bg-teal-500/10"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      } ${inMonth ? "" : "opacity-40"}`}
                    >
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                          isToday
                            ? "bg-teal-700 text-white dark:bg-teal-600"
                            : isSelected
                              ? "text-teal-700 dark:text-teal-300"
                              : "text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      <span className="mt-1 block space-y-1">
                        {items.slice(0, 3).map((session) => (
                          <span
                            key={session.id}
                            className={`block truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                              session.status === "completed"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                                : session.status === "cancelled"
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                                  : session.confirmedAt
                                    ? "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                            }`}
                          >
                            <time dateTime={session.scheduledAt}>
                              {formatTime(session.scheduledAt)}
                            </time>{" "}
                            {session.clientName ?? ""}
                          </span>
                        ))}
                        {items.length > 3 ? (
                          <span className="block text-[10px] text-slate-500 dark:text-slate-500">
                            +{items.length - 3} more
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <Panel
              title={selected.toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              action={
                daySessions.length > 0 ? (
                  <span className="text-xs text-slate-500 dark:text-slate-500">
                    {daySessions.length} session{daySessions.length === 1 ? "" : "s"}
                  </span>
                ) : null
              }
            >
              {daySessions.length === 0 ? (
                <EmptyState
                  title="Nothing booked"
                  description="No sessions on this day. Pick another day or check the list view."
                />
              ) : (
                <ul className="space-y-3">
                  {daySessions.map((session) => (
                    <li
                      key={session.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {session.clientName ?? "Client"}
                        </p>
                        <Badge
                          tone={
                            session.status === "completed"
                              ? "emerald"
                              : session.status === "cancelled"
                                ? "rose"
                                : session.confirmedAt
                                  ? "teal"
                                  : "amber"
                          }
                        >
                          {sessionStatusLabel(session.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        <time dateTime={session.scheduledAt}>
                          {formatDateTime(session.scheduledAt)}
                        </time>{" "}
                        · {session.durationMinutes} min · {sessionModeLabel(session.mode)}
                      </p>
                      {!session.confirmedAt && session.status === "scheduled" ? (
                        <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          Booking awaiting confirmation
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <LinkButton
                          href={`/portal/therapist/clients/${session.clientId}`}
                          variant="secondary"
                          size="sm"
                        >
                          Client
                        </LinkButton>
                        <LinkButton
                          href={
                            session.status === "completed" || session.noteId
                              ? `/portal/therapist/sessions/${session.id}/notes`
                              : "/portal/therapist/sessions"
                          }
                          variant="primary"
                          size="sm"
                        >
                          {session.noteId ? "Open note" : session.status === "completed" ? "Write note" : "Sessions"}
                        </LinkButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </TherapistPage>
  );
}
