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
import { Field, SegmentedControl, inputClass, textareaClass } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  createSupervision,
  fetchSupervision,
  formatDay,
  statusLabel,
  statusTone,
  type SupervisionList,
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

const FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Scheduled" },
  { value: "completed", label: "Completed" },
];

function StatTile({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <div className="card p-4">
      <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function SupervisorSupervisionClient() {
  const [data, setData] = useState<SupervisionList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSupervision({ status });
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [status]);

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
      <PageTitle
        description="See supervision due, schedule and record sessions, and identify development needs."
        action={
          <Button aria-expanded={showForm} aria-controls="supervision-form" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "Schedule supervision"}
          </Button>
        }
      >
        Supervision
      </PageTitle>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load supervision"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading supervision" />
        ) : !data ? (
          <EmptyState title="No supervision yet" description="Scheduled and completed supervision will appear here." />
        ) : (
          <>
            <div id="supervision-form">
              {showForm ? (
                <ScheduleForm due={data.due} onCreated={() => { setShowForm(false); void load(); }} />
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Supervision due" value={data.overview.dueCount} />
              <StatTile label="Overdue" value={data.overview.overdue} />
              <StatTile label="Never supervised" value={data.overview.never} />
              <StatTile label="Scheduled" value={data.overview.scheduled} />
            </div>

            <div className="mt-5">
              <SegmentedControl options={FILTERS} value={status} onChange={setStatus} ariaLabel="Filter supervision" />
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <SectionTitle detail={`${data.records.length} shown`}>Records</SectionTitle>
                {data.records.length === 0 ? (
                  <div className="mt-4">
                    <EmptyState title="No supervision records" description="Scheduled and completed supervision will appear here." />
                  </div>
                ) : (
                  <ul className="mt-4 divide-y divide-slate-100">
                    {data.records.map((record) => (
                      <li key={record.id}>
                        <Link
                          href={`/portal/clinical_supervisor/supervision/${record.id}`}
                          className="flex items-center justify-between gap-3 py-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{record.practitionerName}</p>
                            <p className="text-[11px] text-slate-500">
                              <time dateTime={record.supervisionDate}>{formatDay(record.supervisionDate)}</time> ·{" "}
                              {humanLabel(record.modality)}
                              {record.focus ? ` · ${record.focus}` : ""}
                            </p>
                          </div>
                          <Badge tone={uiTone(statusTone(record.status))}>{statusLabel(record.status)}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <SectionTitle detail={`${data.due.length} shown`}>Supervision due</SectionTitle>
                {data.due.length === 0 ? (
                  <div className="mt-4">
                    <EmptyState title="Everyone is current" description="No practitioner is due or overdue for supervision." />
                  </div>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {data.due.map((member) => (
                      <li key={member.id} className="rounded-2xl border border-slate-200 px-3.5 py-2.5">
                        <p className="text-sm font-medium text-slate-700">{member.fullName}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <Badge tone={uiTone(statusTone(member.supervision.status))}>
                            {statusLabel(member.supervision.status)}
                          </Badge>
                          {member.supervision.daysOverdue
                            ? `${member.supervision.daysOverdue}d overdue`
                            : member.supervision.nextDue
                              ? formatDay(member.supervision.nextDue)
                              : "No due date"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </SupervisorPage>
  );
}

function ScheduleForm({
  due,
  onCreated,
}: {
  due: SupervisionList["due"];
  onCreated: () => void;
}) {
  const [practitionerId, setPractitionerId] = useState(due[0]?.id ?? "");
  const [supervisionDate, setSupervisionDate] = useState(new Date().toISOString().slice(0, 10));
  const [modality, setModality] = useState("individual");
  const [focus, setFocus] = useState("");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [discussionTopics, setDiscussionTopics] = useState("");
  const [actionItems, setActionItems] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!practitionerId) {
      setError("Choose a practitioner to supervise.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createSupervision({
        practitionerId,
        supervisionDate,
        modality,
        focus: focus || null,
        checklist,
        discussionTopics: discussionTopics || null,
        actionItems: actionItems || null,
        followUpDate: followUpDate || null,
      });
      onCreated();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Schedule supervision</SectionTitle>
      <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Practitioner">
            <select className={inputClass} value={practitionerId} onChange={(e) => setPractitionerId(e.target.value)}>
              <option value="">Choose...</option>
              {due.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName} ({member.role})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" className={inputClass} value={supervisionDate} onChange={(e) => setSupervisionDate(e.target.value)} />
          </Field>
          <Field label="Modality">
            <select className={inputClass} value={modality} onChange={(e) => setModality(e.target.value)}>
              <option value="individual">Individual</option>
              <option value="group">Group</option>
              <option value="peer">Peer</option>
              <option value="case_review">Case review</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Focus (optional)">
            <input className={inputClass} value={focus} onChange={(e) => setFocus(e.target.value)} />
          </Field>
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-slate-600">Discussion areas</legend>
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
          <Field label="Discussion topics (optional)">
            <textarea className={textareaClass} value={discussionTopics} onChange={(e) => setDiscussionTopics(e.target.value)} />
          </Field>
          <Field label="Action items (optional)">
            <textarea className={textareaClass} value={actionItems} onChange={(e) => setActionItems(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Follow-up date (optional)">
            <input type="date" className={inputClass} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" className="mt-4" loading={busy}>
          Schedule supervision
        </Button>
      </form>
    </Card>
  );
}
