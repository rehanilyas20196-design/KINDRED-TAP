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
import { DataRow, Field, inputClass, textareaClass } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import {
  completeSupervision,
  fetchSupervisionRecord,
  formatDateTime,
  formatDay,
  statusLabel,
  statusTone,
  type SupervisionRecord,
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

const CHECKLIST = [
  "Clinical approach",
  "Case complexity",
  "Documentation",
  "Communication",
  "Safety concern",
  "Professional development",
  "Ethical concern",
];

export default function SupervisorSupervisionDetailClient({ recordId }: { recordId: string }) {
  const [record, setRecord] = useState<SupervisionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSupervisionRecord(recordId);
      setRecord(result.record);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <SupervisorPage>
      <Link
        href="/portal/clinical_supervisor/supervision"
        className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Back to supervision
      </Link>

      <PageTitle
        description="Record the discussion, action items and follow-up. Supervision records describe the practitioner, not the client's clinical record."
        action={record ? <Badge tone={uiTone(statusTone(record.status))}>{statusLabel(record.status)}</Badge> : null}
      >
        {record ? `Supervision · ${record.practitionerName}` : "Supervision"}
      </PageTitle>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load this supervision record"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading supervision record" />
        ) : !record ? (
          <EmptyState title="We could not find that supervision record" description="It may have been removed or you may not have access to it." />
        ) : (
          <div className="space-y-6">
            <Card>
              <SectionTitle>Supervision session</SectionTitle>
              <dl className="mt-4 divide-y divide-slate-100">
                <DataRow label="Practitioner">{record.practitionerName} ({record.practitionerRole})</DataRow>
                <DataRow label="Supervisor">{record.supervisorName ?? "You"}</DataRow>
                <DataRow label="Date"><time dateTime={record.supervisionDate}>{formatDay(record.supervisionDate)}</time></DataRow>
                <DataRow label="Modality">{humanLabel(record.modality)}</DataRow>
                <DataRow label="Focus">{record.focus ?? "-"}</DataRow>
                <DataRow label="Follow-up">
                  {record.followUpDate ? <time dateTime={record.followUpDate}>{formatDay(record.followUpDate)}</time> : "-"}
                </DataRow>
              </dl>

              <fieldset className="mt-4">
                <legend className="text-xs font-semibold text-slate-500">Discussion areas</legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {CHECKLIST.map((item) => {
                    const checked = (record.checklist ?? []).includes(item);
                    return (
                      <span
                        key={item}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          checked ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {checked ? "✓ " : ""}{item}
                      </span>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-4 space-y-3">
                <Text label="Discussion topics" value={record.discussionTopics} />
                <Text label="Development areas" value={record.developmentAreas} />
                <Text label="Concerns" value={record.concerns} />
                <Text label="Action items" value={record.actionItems} />
              </div>
              <p className="mt-4 text-[11px] text-slate-500">
                Created <time dateTime={record.createdAt}>{formatDateTime(record.createdAt)}</time>
              </p>
            </Card>

            {record.status === "open" ? (
              <Card>
                <SectionTitle>Complete supervision</SectionTitle>
                <div className="mt-4">
                  <CompleteForm record={record} onDone={() => void load()} />
                </div>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </SupervisorPage>
  );
}

function Text({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{value}</p>
    </div>
  );
}

function CompleteForm({ record, onDone }: { record: SupervisionRecord; onDone: () => void }) {
  const [checklist, setChecklist] = useState<string[]>(record.checklist ?? []);
  const [discussionTopics, setDiscussionTopics] = useState(record.discussionTopics ?? "");
  const [developmentAreas, setDevelopmentAreas] = useState(record.developmentAreas ?? "");
  const [actionItems, setActionItems] = useState(record.actionItems ?? "");
  const [followUpDate, setFollowUpDate] = useState(record.followUpDate ?? "");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await completeSupervision(record.id, {
        checklist,
        discussionTopics: discussionTopics || null,
        developmentAreas: developmentAreas || null,
        actionItems: actionItems || null,
        followUpDate: followUpDate || null,
        summary: summary || null,
      });
      onDone();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-slate-600">Discussion areas covered</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CHECKLIST.map((item) => {
            const checked = checklist.includes(item);
            return (
              <button
                key={item}
                type="button"
                aria-pressed={checked}
                onClick={() => setChecklist((prev) => (checked ? prev.filter((v) => v !== item) : [...prev, item]))}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  checked ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Discussion topics">
          <textarea className={textareaClass} value={discussionTopics} onChange={(e) => setDiscussionTopics(e.target.value)} />
        </Field>
        <Field label="Development areas">
          <textarea className={textareaClass} value={developmentAreas} onChange={(e) => setDevelopmentAreas(e.target.value)} />
        </Field>
        <Field label="Action items">
          <textarea className={textareaClass} value={actionItems} onChange={(e) => setActionItems(e.target.value)} />
        </Field>
        <Field label="Supervisor notes (summary)">
          <textarea className={textareaClass} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <Field label="Follow-up date">
          <input type="date" className={inputClass} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" className="mt-4" loading={busy}>
        Mark supervision completed
      </Button>
    </form>
  );
}
