"use client";

import { useCallback, useEffect, useState } from "react";
import { TherapistPage } from "@/components/therapist/shell";
import { Alert, Button, EmptyState, LinkButton, LoadingState } from "@/components/ui";
import { Badge, Field, PageHeader, Panel, inputClass, textareaClass } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  fetchNotes,
  formatDateTime,
  saveNotes,
  sessionModeLabel,
  sessionStatusLabel,
  type NoteEditorPayload,
  type NoteStatus,
  type NotesResponse,
} from "@/lib/therapist";

interface FormState {
  sessionDate: string;
  sessionNumber: string;
  sessionType: string;
  presentation: string;
  discussion: string;
  interventions: string;
  clientResponse: string;
  progressNotes: string;
  homework: string;
  nextSessionPlan: string;
  privateNotes: string;
  clientSummary: string;
  sharedWithClient: boolean;
}

const TEXT_FIELDS: { key: keyof Omit<FormState, "sessionDate" | "sessionNumber" | "sharedWithClient">; label: string; hint?: string; wide?: boolean }[] = [
  { key: "presentation", label: "Presentation", hint: "Subjective - how the client arrived and presented." },
  { key: "discussion", label: "Discussion", hint: "Objective - what was covered." },
  { key: "interventions", label: "Interventions", hint: "Techniques used and why." },
  { key: "clientResponse", label: "Client response", hint: "How the client engaged." },
  { key: "progressNotes", label: "Progress & reasoning", hint: "Assessment of change and clinical reasoning.", wide: true },
  { key: "homework", label: "Homework set", hint: "Between-session task agreed.", wide: true },
  { key: "nextSessionPlan", label: "Plan for next session", wide: true },
  { key: "privateNotes", label: "Private notes (therapist only)", hint: "Never shared with the client.", wide: true },
  { key: "clientSummary", label: "Summary for the client", hint: "Plain language recap - published when sharing is on.", wide: true },
];

function emptyForm(): FormState {
  return {
    sessionDate: "",
    sessionNumber: "",
    sessionType: "",
    presentation: "",
    discussion: "",
    interventions: "",
    clientResponse: "",
    progressNotes: "",
    homework: "",
    nextSessionPlan: "",
    privateNotes: "",
    clientSummary: "",
    sharedWithClient: false,
  };
}

export default function NotesClient({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<NotesResponse | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<NoteStatus | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchNotes(sessionId);
      setData(response);
      const note = response.note;
      setForm({
        sessionDate:
          note?.sessionDate ?? new Date(response.session.scheduledAt).toISOString().slice(0, 10),
        sessionNumber: String(note?.sessionNumber ?? response.suggestedSessionNumber ?? ""),
        sessionType: note?.sessionType ?? "",
        presentation: note?.presentation ?? "",
        discussion: note?.discussion ?? "",
        interventions: note?.interventions ?? "",
        clientResponse: note?.clientResponse ?? "",
        progressNotes: note?.progressNotes ?? "",
        homework: note?.homework ?? "",
        nextSessionPlan: note?.nextSessionPlan ?? "",
        privateNotes: note?.privateNotes ?? "",
        clientSummary: note?.clientSummary ?? "",
        sharedWithClient: note?.sharedWithClient ?? false,
      });
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [sessionId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function save(status: NoteStatus) {
    setSaving(status);
    setError(null);
    setSaved(null);

    const payload: NoteEditorPayload = {
      status,
      sessionDate: /^\d{4}-\d{2}-\d{2}$/.test(form.sessionDate) ? form.sessionDate : undefined,
      sessionNumber: form.sessionNumber === "" ? null : Number(form.sessionNumber),
      sharedWithClient: form.sharedWithClient,
      sessionType: form.sessionType,
      presentation: form.presentation,
      discussion: form.discussion,
      interventions: form.interventions,
      clientResponse: form.clientResponse,
      progressNotes: form.progressNotes,
      homework: form.homework,
      nextSessionPlan: form.nextSessionPlan,
      privateNotes: form.privateNotes,
      clientSummary: form.clientSummary,
    };

    try {
      const response = await saveNotes(sessionId, payload);
      setData((prev) =>
        prev ? { ...prev, note: response.note, session: { ...prev.session, noteId: response.note.id } } : prev
      );
      setSaved(
        status === "final"
          ? "Note finalised. It stays editable only by reopening as a draft."
          : "Draft saved."
      );
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSaving(null);
    }
  }

  if (error && !data) {
    return (
      <TherapistPage>
        <PageHeader title="Session note" description="This session note could not be opened." />
        <EmptyState
          title="We could not load this session note"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      </TherapistPage>
    );
  }
  if (!data) {
    return (
      <TherapistPage>
        <PageHeader title="Session note" />
        <LoadingState label="Loading session note" />
      </TherapistPage>
    );
  }

  const { session, note } = data;
  const isFinal = note?.status === "final";

  return (
    <TherapistPage>
      <PageHeader
        back={{ href: "/portal/therapist/sessions", label: "Sessions" }}
        title="Session note"
        description={`${session.clientName ?? "Client"} · ${formatDateTime(session.scheduledAt)} · ${sessionModeLabel(session.mode)}`}
        action={
          <>
            <LinkButton
              href={`/portal/therapist/clients/${session.clientId}`}
              variant="secondary"
            >
              Client profile
            </LinkButton>
            <Badge tone={isFinal ? "emerald" : note ? "amber" : "slate"}>
              {note ? (isFinal ? "Final" : "Draft") : "Not started"}
            </Badge>
          </>
        }
      />

      {error ? (
        <div className="mb-5">
          <Alert tone="danger" action={<Button size="sm" onClick={() => void load()}>Try again</Button>}>
            {error}
          </Alert>
        </div>
      ) : null}
      {saved ? (
        <div className="mb-5">
          <Alert tone="success">{saved}</Alert>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Status</p>
          <p className="mt-1 font-semibold">{sessionStatusLabel(session.status)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">When</p>
          <p className="mt-1 font-semibold">
            <time dateTime={session.scheduledAt}>{formatDateTime(session.scheduledAt)}</time>
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Duration</p>
          <p className="mt-1 font-semibold">{session.durationMinutes} minutes</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">With</p>
          <p className="mt-1 font-semibold">{session.therapistName ?? "You"}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Structure">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Session date" hint="YYYY-MM-DD">
                <input
                  type="date"
                  aria-label="Session date"
                  value={form.sessionDate}
                  onChange={(event) => setForm({ ...form, sessionDate: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Session number" hint="Auto-suggested from your history">
                <input
                  type="number"
                  aria-label="Session number"
                  min={1}
                  max={9999}
                  value={form.sessionNumber}
                  onChange={(event) => setForm({ ...form, sessionNumber: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Session type">
                <input
                  type="text"
                  aria-label="Session type"
                  value={form.sessionType}
                  placeholder="Individual, review, first session..."
                  onChange={(event) => setForm({ ...form, sessionType: event.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Write-up">
            <div className="grid gap-4 sm:grid-cols-2">
              {TEXT_FIELDS.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  className={field.wide ? "sm:col-span-2" : ""}
                >
                  <textarea
                    aria-label={field.label}
                    value={form[field.key]}
                    onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                    className={textareaClass}
                  />
                </Field>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Sharing & saving">
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
              <input
                type="checkbox"
                aria-label="Share the client summary"
                checked={form.sharedWithClient}
                onChange={(event) => setForm({ ...form, sharedWithClient: event.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-teal-700"
              />
              <span className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                <span className="block font-semibold text-slate-800 dark:text-slate-100">
                  Share the client summary
                </span>
                Publishes only the summary field to the client&apos;s portal. Discussion, reasoning and
                private notes stay with you.
              </span>
            </label>

            <div className="mt-4 space-y-2">
              <Button
                loading={saving === "draft"}
                disabled={saving !== null}
                onClick={() => save("draft")}
                className="w-full"
              >
                {note ? "Save draft" : "Create draft"}
              </Button>
              <Button
                variant="secondary"
                loading={saving === "final"}
                disabled={saving !== null}
                onClick={() => save("final")}
                className="w-full"
              >
                Mark final
              </Button>
            </div>

            <p className="mt-4 text-[11px] leading-5 text-slate-500 dark:text-slate-500">
              Your notes stay private to you and only cover clients on your caseload. Once a note is
              final you can still reopen it as a draft, and every note shows when it was last
              updated.
            </p>

            {note ? (
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-500">
                Last updated <time dateTime={note.updatedAt}>{formatDateTime(note.updatedAt)}</time>
              </p>
            ) : null}
          </Panel>

          <Panel title="Also available">
            <div className="space-y-2">
              <LinkButton
                href={`/portal/therapist/treatment-plans?clientId=${session.clientId}`}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                Treatment plan for this client
              </LinkButton>
              <LinkButton
                href={`/portal/therapist/assessments?clientId=${session.clientId}`}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                Assessments for this client
              </LinkButton>
            </div>
          </Panel>
        </div>
      </div>
    </TherapistPage>
  );
}
