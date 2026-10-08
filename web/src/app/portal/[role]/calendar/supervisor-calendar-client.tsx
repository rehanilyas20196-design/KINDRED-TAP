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
import { Field, inputClass, textareaClass } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendar,
  formatDay,
  statusLabel,
  statusTone,
  type CalendarData,
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

function humanLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/(^|\s)\S/g, (chunk) => chunk.toUpperCase());
}

const EVENT_TYPES = ["meeting", "supervision", "case_review", "follow_up", "intervention", "training", "appointment"];

const DERIVED_LINK: Record<string, (id: string) => string> = {
  supervision: (id) => `/portal/clinical_supervisor/supervision/${id}`,
  case_review: (id) => `/portal/clinical_supervisor/case-reviews/${id}`,
  intervention: (id) => `/portal/clinical_supervisor/interventions/${id}`,
  safety_concern: (id) => `/portal/clinical_supervisor/safety/${id}`,
};

export default function SupervisorCalendarClient() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCalendar();
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function remove(eventId: string) {
    try {
      await deleteCalendarEvent(eventId);
      setNotice(null);
    } catch (err) {
      setNotice(messageFor(err));
    }
    await load();
  }

  return (
    <SupervisorPage>
      <PageTitle
        description="Supervision, case reviews, follow-ups, therapist meetings, interventions and training."
        action={
          <Button aria-expanded={showForm} aria-controls="calendar-event-form" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "Add event"}
          </Button>
        }
      >
        Calendar
      </PageTitle>

      <div id="calendar-event-form">
        {showForm ? <EventForm onCreated={() => { setShowForm(false); void load(); }} /> : null}
      </div>

      <div className="mt-5">
        {notice ? (
          <div className="mb-4">
            <Alert tone="danger">{notice}</Alert>
          </div>
        ) : null}

        {error ? (
          <EmptyState
            title="We could not load the calendar"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading calendar" />
        ) : !data ? (
          <EmptyState title="No calendar yet" description="Calendar events you add will appear here." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle detail={`${data.events.length} total`}>Created events</SectionTitle>
              {data.events.length === 0 ? (
                <div className="mt-4">
                  <EmptyState title="No events yet" description="Events you create will appear here." />
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {data.events.map((event) => (
                    <li key={event.id} className="flex items-start justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{event.title}</p>
                        <p className="text-[11px] text-slate-500">
                          <time dateTime={event.startsAt}>{formatDay(event.startsAt)}</time> · {humanLabel(event.type)}
                        </p>
                        {event.notes ? <p className="mt-1 text-xs text-slate-500">{event.notes}</p> : null}
                      </div>
                      <button
                        type="button"
                        className="text-[11px] text-rose-600 hover:underline"
                        onClick={() => void remove(event.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <SectionTitle detail={`${data.derived.length} total`}>Due &amp; follow-ups</SectionTitle>
              {data.derived.length === 0 ? (
                <div className="mt-4">
                  <EmptyState title="Nothing due" description="Supervision, review follow-ups and intervention due dates will appear here." />
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {data.derived.map((item) => {
                    const href = DERIVED_LINK[item.kind]?.(item.id);
                    return (
                      <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-3">
                        <div>
                          {href ? (
                            <Link href={href} className="text-sm font-medium text-teal-700">{item.title}</Link>
                          ) : (
                            <p className="text-sm font-medium text-slate-700">{item.title}</p>
                          )}
                          <p className="text-[11px] text-slate-500">
                            <time dateTime={item.day}>{formatDay(item.day)}</time>
                          </p>
                        </div>
                        <Badge tone={uiTone(statusTone(item.status))}>{statusLabel(item.status)}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </SupervisorPage>
  );
}

function EventForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState("meeting");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(`${new Date().toISOString().slice(0, 10)}T09:00`);
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await createCalendarEvent({
        type,
        title,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        notes: notes || null,
      });
      onCreated();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5">
      <SectionTitle>Add calendar event</SectionTitle>
      <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Type">
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
              {EVENT_TYPES.map((value) => (
                <option key={value} value={value}>{humanLabel(value)}</option>
              ))}
            </select>
          </Field>
          <Field label="Starts">
            <input type="datetime-local" className={inputClass} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends (optional)">
            <input type="datetime-local" className={inputClass} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Title">
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Notes (optional)">
            <textarea className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" className="mt-4" loading={busy} disabled={title.trim().length < 3}>
          Add event
        </Button>
      </form>
    </Card>
  );
}
