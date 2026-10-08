"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, messageFor } from "@/lib/api";
import { titleCaseList } from "@/lib/support";
import type { MatchedTherapist } from "@/lib/clinical";
import {
  awaitingFeedback,
  bookSession,
  cancelSession,
  completeSession,
  rescheduleSession,
  sessionDateTime,
  sessionDay,
  sessionModeLabel,
  sessionStatusLabel,
  sessionTime,
  splitSessions,
  submitSessionFeedback,
  type SessionMode,
  type TherapySession,
} from "@/lib/sessions";
import {
  EmptyRow,
  LoadingRow,
  NoteTone,
  Pill,
  SupportSection,
  initialsFor,
  inputClass,
  labelClass,
} from "./parts";
import { Button, LinkButton } from "@/components/ui";
import { Icon } from "@/components/icons";

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDate(offsetDays = 1): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return isoDate(date);
}

/** `2026-10-05` + `18:00` as an absolute instant in the viewer's own time zone. */
function toInstant(date: string, time: string): string | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function upcomingLabel(sessions: TherapySession[]): string {
  return sessions.length > 1 ? `${sessions.length} sessions ahead` : "Upcoming session";
}

/**
 * The diary half of the support page: what is booked, how to book the next
 * one, and the star rating left behind afterwards.
 */
export function SessionsSection({
  sessions,
  therapist,
  loading,
  error,
  onChanged,
}: {
  sessions: TherapySession[];
  therapist: MatchedTherapist | null;
  loading: boolean;
  error: string | null;
  onChanged: (sessions: TherapySession[]) => void;
}) {
  const router = useRouter();

  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState("18:00");
  const [duration, setDuration] = useState(50);
  const [mode, setMode] = useState<SessionMode>("online");
  const [formError, setFormError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [move, setMove] = useState({ date: defaultDate(), time: "18:00" });
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [activeFeedbackId, setActiveFeedbackId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ rating: 0, comment: "" });
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [sendingFeedback, setSendingFeedback] = useState(false);

  const { upcoming, past } = splitSessions(sessions);
  const awaiting = awaitingFeedback(sessions);
  const activeFeedback =
    awaiting.find((session) => session.id === activeFeedbackId) ?? awaiting[0] ?? null;

  // Pointing the rating widget at a different session clears what was typed
  // for the previous one, before that session is drawn. Both sides are plain
  // ids so an empty diary settles instead of re-rendering forever.
  const draftTargetId = activeFeedback?.id ?? null;
  const [draftFor, setDraftFor] = useState<string | null>(null);
  if (draftTargetId !== draftFor) {
    setDraftFor(draftTargetId);
    setDraft({ rating: 0, comment: "" });
    setFeedbackError(null);
  }

  function replace(updated: TherapySession) {
    onChanged(sessions.map((session) => (session.id === updated.id ? updated : session)));
  }

  async function run(action: () => Promise<{ session: TherapySession }>, id: string) {
    setPendingId(id);
    setActionError(null);
    try {
      const { session } = await action();
      replace(session);
    } catch (err) {
      setActionError(messageFor(err));
    } finally {
      setPendingId(null);
      setConfirmCancelId(null);
      setReschedulingId(null);
    }
  }

  async function book(event: React.FormEvent) {
    event.preventDefault();
    if (!therapist) return;

    const instant = toInstant(date, time);
    if (!instant) {
      setFormError("Choose a date and a time");
      return;
    }
    if (Date.parse(instant) <= Date.now()) {
      setFormError("Choose a time in the future");
      return;
    }

    setBooking(true);
    setFormError(null);
    try {
      const created = await bookSession({
        therapistId: therapist.id,
        scheduledAt: instant,
        durationMinutes: duration,
        mode,
      });
      onChanged([...sessions, created.session]);
      setActionError(null);
    } catch (err) {
      setFormError(messageFor(err));
    } finally {
      setBooking(false);
    }
  }

  /** The live channel in this product is the shared thread, so that is where joining lands. */
  async function join(session: TherapySession) {
    setPendingId(session.id);
    setActionError(null);
    try {
      const created = await apiFetch<{ conversationId: string }>("/api/support/conversations", {
        method: "POST",
        body: { therapistId: session.therapistId },
      });
      router.push(`/portal/user/messages/${created.conversationId}`);
    } catch (err) {
      setActionError(messageFor(err));
      setPendingId(null);
    }
  }

  async function rate(event: React.FormEvent) {
    event.preventDefault();
    if (!activeFeedback) return;
    if (draft.rating < 1) {
      setFeedbackError("Choose a rating from 1 to 5");
      return;
    }

    setFeedbackError(null);
    setSendingFeedback(true);
    try {
      const saved = await submitSessionFeedback(activeFeedback.id, {
        rating: draft.rating,
        comment: draft.comment,
      });
      replace({ ...activeFeedback, feedback: saved.feedback });
    } catch (err) {
      setFeedbackError(messageFor(err));
    } finally {
      setSendingFeedback(false);
    }
  }

  const next = upcoming[0] ?? null;
  const busy = (id: string) => pendingId === id;

  return (
    <SupportSection
      id="sessions"
      icon={<Icon name="calendar" className="h-5 w-5" />}
      title="Sessions & appointments"
      intro="Your next session, the diary behind it, and the rating you leave afterwards."
      action={
        <a href="#book-session" className="btn btn-ghost btn-sm">
          Book a session
        </a>
      }
    >
      <div className="space-y-5">
        {error ? <NoteTone tone="danger">{error}</NoteTone> : null}
        {actionError ? <NoteTone tone="danger">{actionError}</NoteTone> : null}

        {loading ? <LoadingRow label="Loading your sessions" /> : null}

        {!loading && awaiting.length > 0 && activeFeedback ? (
          <section
            id="feedback-prompt"
            className="rounded-2xl border border-teal-200 bg-teal-50/70 p-5 dark:border-teal-900 dark:bg-teal-500/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  How was your session?
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {activeFeedback.therapistName ?? "Your therapist"} ·{" "}
                  {sessionDateTime(activeFeedback.scheduledAt)}
                </p>
              </div>
              {awaiting.length > 1 ? (
                <label
                  htmlFor="feedback-session"
                  className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                >
                  Session
                  <select
                    id="feedback-session"
                    value={activeFeedback.id}
                    onChange={(event) => setActiveFeedbackId(event.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {awaiting.map((session) => (
                      <option key={session.id} value={session.id}>
                        {sessionDay(session.scheduledAt)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <form onSubmit={rate} className="mt-4 space-y-3">
              <div
                className="flex items-center gap-1.5"
                role="group"
                aria-label="Rate your session out of 5"
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, rating: star }))}
                    aria-label={`Rate ${star} out of 5`}
                    className={`text-2xl leading-none transition ${
                      star <= draft.rating
                        ? "text-amber-400"
                        : "text-slate-500 hover:text-amber-300 dark:text-slate-600"
                    }`}
                  >
                    <span aria-hidden="true">
                      ★
                    </span>
                  </button>
                ))}
                <span
                  className="ml-2 text-xs text-slate-500 dark:text-slate-400"
                  aria-live="polite"
                >
                  {draft.rating ? `${draft.rating} of 5` : "Tap a star"}
                </span>
              </div>

              <textarea
                rows={3}
                value={draft.comment}
                maxLength={2000}
                onChange={(event) => setDraft((current) => ({ ...current, comment: event.target.value }))}
                placeholder="Tell us about your experience. This stays separate from anything your therapist records."
                aria-label="Your comments about the session, optional"
                className={inputClass}
              />

              {feedbackError ? <NoteTone tone="danger">{feedbackError}</NoteTone> : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={sendingFeedback}>
                  Send feedback
                </Button>
                <p className="max-w-md text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                  Optional, and kept apart from the clinical assessment.
                </p>
              </div>
            </form>
          </section>
        ) : null}

        {!loading && next ? (
          <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-sm font-semibold text-teal-800 dark:bg-teal-500/15 dark:text-teal-300"
                >
                  {initialsFor(next.therapistName)}
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                    {upcomingLabel(upcoming)}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {next.therapistName ?? "Your therapist"}
                  </p>
                </div>
              </div>
              <Pill tone="scheduled">{sessionModeLabel(next.mode)}</Pill>
            </div>

            <p className="mt-4 text-sm text-slate-700 dark:text-slate-200">
              {sessionDateTime(next.scheduledAt)}
              <span className="text-slate-500 dark:text-slate-500">
                {" "}
                · {next.durationMinutes} minutes
              </span>
            </p>

            {reschedulingId === next.id ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="reschedule-date" className={labelClass}>
                      New date
                    </label>
                    <input
                      id="reschedule-date"
                      type="date"
                      value={move.date}
                      onChange={(event) => setMove((current) => ({ ...current, date: event.target.value }))}
                      className={`${inputClass} w-auto`}
                    />
                  </div>
                  <div>
                    <label htmlFor="reschedule-time" className={labelClass}>
                      New time
                    </label>
                    <input
                      id="reschedule-time"
                      type="time"
                      value={move.time}
                      onChange={(event) => setMove((current) => ({ ...current, time: event.target.value }))}
                      className={`${inputClass} w-auto`}
                    />
                  </div>
                  <Button
                    loading={busy(next.id)}
                    onClick={() => {
                      const instant = toInstant(move.date, move.time);
                      if (!instant) {
                        setActionError("Choose a date and a time");
                        return;
                      }
                      void run(
                        () => rescheduleSession(next.id, { scheduledAt: instant }),
                        next.id
                      );
                    }}
                  >
                    {busy(next.id) ? "Saving..." : "Save new time"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setReschedulingId(null)}>
                    Keep as it is
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button loading={busy(next.id)} onClick={() => join(next)}>
                  {busy(next.id) ? "Opening..." : "Join session"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setActionError(null);
                    setReschedulingId(next.id);
                    setMove({
                      date: isoDate(new Date(next.scheduledAt)),
                      time: new Date(next.scheduledAt).toTimeString().slice(0, 5),
                    });
                  }}
                >
                  Reschedule
                </Button>
                {confirmCancelId === next.id ? (
                  <span className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      loading={busy(next.id)}
                      onClick={() => void run(() => cancelSession(next.id, "Cancelled by the person booked"), next.id)}
                    >
                      {busy(next.id) ? "Cancelling..." : "Yes, cancel it"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setConfirmCancelId(null)}>
                      No, keep it
                    </Button>
                  </span>
                ) : (
                  <Button variant="secondary" onClick={() => setConfirmCancelId(next.id)}>
                    Cancel
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void run(() => completeSession(next.id), next.id)}
                >
                  Session finished?
                </Button>
              </div>
            )}

            <p className="mt-3 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              Joining opens your shared room with {next.therapistName ?? "your therapist"} -
              video rooms open at the scheduled time.
            </p>

            {upcoming.length > 1 ? (
              <ul className="mt-4 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                {upcoming.slice(1).map((session) => (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300"
                  >
                    <span>
                      {sessionDay(session.scheduledAt)} · {sessionTime(session.scheduledAt)} ·{" "}
                      {sessionModeLabel(session.mode)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmCancelId(session.id)}>
                      Cancel
                    </Button>
                    {confirmCancelId === session.id ? (
                      <span className="flex items-center gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          loading={busy(session.id)}
                          onClick={() =>
                            void run(() => cancelSession(session.id, "Cancelled by the person booked"), session.id)
                          }
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirmCancelId(null)}
                        >
                          Keep
                        </Button>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ) : null}

        {!loading && !error && !next ? (
          <EmptyRow>
            No upcoming session. Book one below and it appears here with a Join button when the
            time comes.
          </EmptyRow>
        ) : null}

        <section id="book-session" className="scroll-mt-6 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Book a session</h3>

          {!therapist ? (
            <div className="mt-3 space-y-3">
              <EmptyRow>
                Sessions are booked with your matched therapist, so finish the assessment first.
              </EmptyRow>
              <LinkButton href="/portal/user/assessment">Start the assessment</LinkButton>
            </div>
          ) : (
            <form onSubmit={book} className="mt-3 space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-[11px] font-semibold text-teal-800 dark:bg-teal-500/15 dark:text-teal-300"
                >
                  {initialsFor(therapist.fullName)}
                </span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {therapist.fullName}
                  </span>{" "}
                  · {therapist.discipline} · {titleCaseList(therapist.sessionModes) || "Online"}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label htmlFor="book-date" className={labelClass}>
                    Date
                  </label>
                  <input
                    id="book-date"
                    type="date"
                    value={date}
                    min={defaultDate()}
                    onChange={(event) => setDate(event.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="book-time" className={labelClass}>
                    Time
                  </label>
                  <input
                    id="book-time"
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="book-duration" className={labelClass}>
                    Length
                  </label>
                  <select
                    id="book-duration"
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value))}
                    className={inputClass}
                  >
                    <option value={30}>30 minutes</option>
                    <option value={50}>50 minutes</option>
                    <option value={90}>90 minutes</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="book-mode" className={labelClass}>
                    Mode
                  </label>
                  <select
                    id="book-mode"
                    value={mode}
                    onChange={(event) => setMode(event.target.value as SessionMode)}
                    className={inputClass}
                  >
                    <option value="online">Online</option>
                    <option value="phone">Phone</option>
                    <option value="in_person">In person</option>
                  </select>
                </div>
              </div>

              {formError ? <NoteTone tone="danger">{formError}</NoteTone> : null}

              <Button type="submit" loading={booking}>
                {booking ? "Booking..." : "Book session"}
              </Button>
            </form>
          )}
        </section>

        {!loading && past.length > 0 ? (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
              Past sessions
            </h3>
            <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {past.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {session.therapistName ?? "Your therapist"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {sessionDateTime(session.scheduledAt)} · {sessionModeLabel(session.mode)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {session.status === "scheduled" ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void run(() => completeSession(session.id), session.id)}
                        >
                          Mark complete
                        </Button>
                        <Pill tone="scheduled">{sessionStatusLabel(session.status)}</Pill>
                      </>
                    ) : session.status === "cancelled" ? (
                      <Pill tone="cancelled">{sessionStatusLabel(session.status)}</Pill>
                    ) : session.feedback ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="text-amber-400" aria-hidden="true">
                          {"★".repeat(session.feedback.rating)}
                          <span className="text-slate-500 dark:text-slate-600">
                            {"★".repeat(5 - session.feedback.rating)}
                          </span>
                        </span>{" "}
                        you rated {session.feedback.rating}/5
                      </span>
                    ) : awaiting.some((item) => item.id === session.id) ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setActiveFeedbackId(session.id);
                          document
                            .getElementById("feedback-prompt")
                            ?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                      >
                        Rate this session
                      </Button>
                    ) : (
                      <Pill tone="completed">{sessionStatusLabel(session.status)}</Pill>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </SupportSection>
  );
}
