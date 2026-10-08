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
  ProgressBar,
  SectionTitle,
  type Tone,
} from "@/components/ui";
import { DataRow, Field, inputClass, textareaClass } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import {
  actOnIntervention,
  fetchIntervention,
  formatDateTime,
  formatDay,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  updateIntervention,
  type ConcernActivity,
  type InterventionAction,
  type InterventionRow,
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

const ACTIONS: { value: InterventionAction; label: string }[] = [
  { value: "start", label: "Start intervention" },
  { value: "add_follow_up", label: "Add follow-up" },
  { value: "complete", label: "Complete" },
  { value: "reopen", label: "Reopen" },
];

export default function SupervisorInterventionDetailClient({ interventionId }: { interventionId: string }) {
  const [intervention, setIntervention] = useState<InterventionRow | null>(null);
  const [activity, setActivity] = useState<ConcernActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIntervention(interventionId);
      setIntervention(result.intervention);
      setActivity(result.activity);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [interventionId]);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function toggleStep(stepId: string) {
    if (!intervention) return;
    const next = intervention.steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step));
    setIntervention({ ...intervention, steps: next });
    try {
      await updateIntervention(intervention.id, { steps: next });
      setNotice(null);
      await load();
    } catch (err) {
      setNotice(messageFor(err));
    }
  }

  return (
    <SupervisorPage>
      <Link
        href="/portal/clinical_supervisor/interventions"
        className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Back to interventions
      </Link>

      <PageTitle
        description="Track progress, follow-up and completion. Interventions support improvement; they are not a disciplinary decision."
        action={
          intervention ? (
            <span className="flex gap-2">
              <Badge tone={uiTone(priorityTone(intervention.priority))} dot>
                {priorityLabel(intervention.priority)}
              </Badge>
              <Badge tone={uiTone(statusTone(intervention.status))}>{statusLabel(intervention.status)}</Badge>
            </span>
          ) : null
        }
      >
        {intervention ? intervention.title : "Intervention"}
      </PageTitle>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load this intervention"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading intervention" />
        ) : !intervention ? (
          <EmptyState title="We could not find that intervention" description="It may have been removed or you may not have access to it." />
        ) : (
          <div className="space-y-6">
            {notice ? <Alert tone="danger">{notice}</Alert> : null}

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <SectionTitle>Intervention</SectionTitle>
                <dl className="mt-4 divide-y divide-slate-100">
                  <DataRow label="Reference">{intervention.reference}</DataRow>
                  <DataRow label="Category">{humanLabel(intervention.category)}</DataRow>
                  <DataRow label="Assigned to">{intervention.assigneeName ?? "Unassigned"}</DataRow>
                  <DataRow label="Priority"><Badge tone={uiTone(priorityTone(intervention.priority))}>{priorityLabel(intervention.priority)}</Badge></DataRow>
                  <DataRow label="Status"><Badge tone={uiTone(statusTone(intervention.status))}>{statusLabel(intervention.status)}</Badge></DataRow>
                  <DataRow label="Due date">{intervention.dueDate ? <time dateTime={intervention.dueDate}>{formatDay(intervention.dueDate)}</time> : "-"}</DataRow>
                  <DataRow label="Follow-up">{intervention.followUpDate ? <time dateTime={intervention.followUpDate}>{formatDay(intervention.followUpDate)}</time> : "-"}</DataRow>
                  <DataRow label="Created by">{intervention.createdByName ?? "-"}</DataRow>
                </dl>
                <div className="mt-4 space-y-3">
                  <Text label="Reason" value={intervention.reason} />
                  <Text label="Instructions" value={intervention.instructions} />
                  <Text label="Follow-up note" value={intervention.followUpNote} />
                </div>
              </Card>

              <Card>
                <SectionTitle detail={`${intervention.progress.done}/${intervention.progress.total}`}>Progress</SectionTitle>
                <div className="mt-4">
                  <ProgressBar
                    value={intervention.progress.done}
                    total={intervention.progress.total}
                    label={`${intervention.title} progress`}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {intervention.progress.done}/{intervention.progress.total} steps complete
                  {intervention.overdue ? " · Overdue" : ""}
                </p>
                {intervention.steps.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">No checklist steps were added.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {intervention.steps.map((step) => (
                      <li key={step.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={step.done}
                          disabled={intervention.status === "completed"}
                          onChange={() => void toggleStep(step.id)}
                          aria-label={step.text}
                        />
                        <span className={step.done ? "text-slate-500 line-through" : "text-slate-700"}>{step.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <SectionTitle>Document action</SectionTitle>
                <div className="mt-4">
                  <ActionForm interventionId={interventionId} onDone={() => void load()} />
                </div>
              </Card>
              <Card>
                <SectionTitle>Activity</SectionTitle>
                <div className="mt-4">
                  {activity.length === 0 ? (
                    <p className="text-xs text-slate-500">No activity recorded yet.</p>
                  ) : (
                    <ol className="space-y-3">
                      {activity.map((event) => (
                        <li key={event.id} className="text-xs">
                          <p className="font-semibold text-slate-700">{humanLabel(event.action)}</p>
                          {event.detail ? <p className="mt-0.5 text-slate-500">{event.detail}</p> : null}
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {event.actorName ?? "System"} ·{" "}
                            <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </Card>
            </div>
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

function ActionForm({ interventionId, onDone }: { interventionId: string; onDone: () => void }) {
  const [action, setAction] = useState<InterventionAction>("complete");
  const [detail, setDetail] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await actOnIntervention(interventionId, {
        action,
        detail: detail || null,
        followUpDate: followUpDate || null,
        confirm: confirm || undefined,
      });
      setDetail("");
      setFollowUpDate("");
      setConfirm(false);
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
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Action">
          <select className={inputClass} value={action} onChange={(e) => setAction(e.target.value as InterventionAction)}>
            {ACTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        {action === "add_follow_up" ? (
          <Field label="Follow-up date">
            <input type="date" className={inputClass} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
        ) : null}
      </div>
      <div className="mt-4">
        <Field label="Detail">
          <textarea className={textareaClass} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </Field>
      </div>
      {action === "complete" ? (
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          Confirm completion even if some checklist steps are still open.
        </label>
      ) : null}
      <Button type="submit" className="mt-4" loading={busy}>
        Record action
      </Button>
    </form>
  );
}
