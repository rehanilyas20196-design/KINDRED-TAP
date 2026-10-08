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
  actOnConcern,
  concernCategoryLabel,
  fetchConcern,
  formatDateTime,
  formatDay,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  type ConcernAction,
  type Priority,
  type SafetyDetail,
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

const ACTIONS: { value: ConcernAction; label: string }[] = [
  { value: "review", label: "Review" },
  { value: "assign", label: "Assign to me" },
  { value: "note", label: "Add note" },
  { value: "request_information", label: "Request more information" },
  { value: "set_follow_up", label: "Set follow-up date" },
  { value: "escalate", label: "Escalate" },
  { value: "resolve", label: "Resolve" },
  { value: "reopen", label: "Reopen" },
];

export default function SupervisorConcernDetailClient({ concernId }: { concernId: string }) {
  const [data, setData] = useState<SafetyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchConcern(concernId);
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [concernId]);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const concern = data?.concern;

  return (
    <SupervisorPage>
      <Link
        href="/portal/clinical_supervisor/safety"
        className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Back to safety monitoring
      </Link>

      <PageTitle
        description="Recorded for human review. The system does not diagnose or automatically clear a concern."
        action={
          concern ? (
            <span className="flex gap-2">
              <Badge tone={uiTone(priorityTone(concern.priority))} dot>
                {priorityLabel(concern.priority)}
              </Badge>
              <Badge tone={uiTone(statusTone(concern.status))}>{statusLabel(concern.status)}</Badge>
            </span>
          ) : null
        }
      >
        {concern ? `${concern.reference} · ${concernCategoryLabel(concern.category)}` : "Safety concern"}
      </PageTitle>

      {error ? (
        <EmptyState
          title="We could not load this safety concern"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : loading ? (
        <LoadingState label="Loading safety concern" />
      ) : !concern ? (
        <EmptyState title="We could not find that safety concern" description="It may have been removed or you may not have access to it." />
      ) : (
        <div className="space-y-6">
          {concern.priority === "critical" ? (
            <Alert tone="danger" title="Critical safety concern">
              <p>Immediate human review required. This concern cannot be resolved without an explicit confirmation.</p>
              {data?.emergencyProcedure ? (
                <p className="mt-2 rounded-xl bg-white/70 p-3 text-xs">{data.emergencyProcedure}</p>
              ) : null}
            </Alert>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <SectionTitle>Concern details</SectionTitle>
              <dl className="mt-4 divide-y divide-slate-100">
                <DataRow label="Concern ID">{concern.reference}</DataRow>
                <DataRow label="Priority"><Badge tone={uiTone(priorityTone(concern.priority))}>{priorityLabel(concern.priority)}</Badge></DataRow>
                <DataRow label="Status"><Badge tone={uiTone(statusTone(concern.status))}>{statusLabel(concern.status)}</Badge></DataRow>
                <DataRow label="Created"><time dateTime={concern.createdAt}>{formatDateTime(concern.createdAt)}</time></DataRow>
                <DataRow label="Last updated"><time dateTime={concern.updatedAt}>{formatDateTime(concern.updatedAt)}</time></DataRow>
                <DataRow label="Assigned supervisor">{concern.assignedSupervisorName ?? "Unassigned"}</DataRow>
                <DataRow label="Therapist / supporter">{concern.subjectName ?? "-"}</DataRow>
                <DataRow label="Client">{concern.clientName ?? (concern.clientId ? "Restricted" : "-")}</DataRow>
                <DataRow label="Follow-up date">
                  {concern.followUpDate ? <time dateTime={concern.followUpDate}>{formatDay(concern.followUpDate)}</time> : "-"}
                </DataRow>
                <DataRow label="Escalation status">
                  {concern.escalationId ? (
                    <Link href={`/portal/clinical_supervisor/escalations/${concern.escalationId}`} className="font-semibold text-teal-700">
                      {concern.escalationReference ?? "Escalated"} · {statusLabel(concern.escalationStatus)}
                    </Link>
                  ) : (
                    "Not escalated"
                  )}
                </DataRow>
              </dl>
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Reason for concern</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{concern.reason}</p>
                </div>
                {concern.information ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Relevant information</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{concern.information}</p>
                  </div>
                ) : null}
                {concern.currentActions ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Current actions</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{concern.currentActions}</p>
                  </div>
                ) : null}
                {concern.resolution ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Resolution</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{concern.resolution}</p>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card>
              <SectionTitle>Previous actions</SectionTitle>
              <div className="mt-4">
                {data.activity.length === 0 ? (
                  <EmptyState title="No actions yet" description="Review, notes, assignments and follow-ups will be recorded here." />
                ) : (
                  <ol className="space-y-3">
                    {data.activity.map((event) => (
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

          <Card>
            <SectionTitle>Document action</SectionTitle>
            <div className="mt-4">
              <ConcernActions concernId={concernId} onDone={() => void load()} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Need to assign work?{" "}
              <Link href={`/portal/clinical_supervisor/interventions?related=safety_concern&relatedId=${concernId}`} className="font-semibold text-teal-700">
                Create an intervention
              </Link>{" "}
              linked to this concern.
            </p>
          </Card>
        </div>
      )}
    </SupervisorPage>
  );
}

function ConcernActions({ concernId, onDone }: { concernId: string; onDone: () => void }) {
  const [action, setAction] = useState<ConcernAction>("review");
  const [detail, setDetail] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [priority, setPriority] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await actOnConcern(concernId, {
        action,
        detail: detail || null,
        followUpDate: followUpDate || null,
        priority: (priority || undefined) as Priority | undefined,
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
          <select className={inputClass} value={action} onChange={(e) => setAction(e.target.value as ConcernAction)}>
            {ACTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority (optional)">
          <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Keep current</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
        {action === "set_follow_up" ? (
          <Field label="Follow-up date">
            <input type="date" className={inputClass} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
        ) : null}
      </div>
      <div className="mt-4">
        <Field label="Detail">
          <textarea className={textareaClass} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="What was done, decided or requested." />
        </Field>
      </div>
      {action === "resolve" ? (
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          I confirm a human has reviewed this and the concern can be resolved.
        </label>
      ) : null}
      <Button type="submit" className="mt-4" loading={busy}>
        Record action
      </Button>
    </form>
  );
}
