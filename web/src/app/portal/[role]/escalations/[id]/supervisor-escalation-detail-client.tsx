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
  actOnEscalation,
  fetchEscalation,
  formatDateTime,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  type EscalationAction,
  type EscalationDetail,
  type Priority,
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

const WORKFLOW: { value: EscalationAction; label: string; note: string }[] = [
  { value: "acknowledge", label: "Acknowledge / begin review", note: "Moves the escalation into supervisor review." },
  { value: "assign_reviewer", label: "Assign reviewer", note: "Records who owns the next action." },
  { value: "request_information", label: "Request more information", note: "Marks it as awaiting action." },
  { value: "add_action", label: "Add follow-up action", note: "Appends to the actions taken." },
  { value: "escalate", label: "Raise priority", note: "Increases urgency; never lowers it." },
  { value: "escalate_to_advisor", label: "Escalate to Clinical Advisor", note: "Requests higher-level clinical oversight." },
  { value: "resolve", label: "Resolve", note: "Records the outcome. Serious escalations need confirmation." },
  { value: "close", label: "Close", note: "Final state. Serious escalations need confirmation." },
];

const STAGES = ["Created", "Supervisor review", "Required action", "Intervention / follow-up", "Monitor", "Resolved"];

function stageIndex(status: string): number {
  if (status === "new") return 1;
  if (status === "under_review") return 2;
  if (status === "action_required") return 3;
  if (status === "resolved") return 5;
  if (status === "closed") return 6;
  return 0;
}

export default function SupervisorEscalationDetailClient({ escalationId }: { escalationId: string }) {
  const [data, setData] = useState<EscalationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchEscalation(escalationId);
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [escalationId]);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const escalation = data?.escalation;
  const stage = escalation ? stageIndex(escalation.status) : 0;

  return (
    <SupervisorPage>
      <Link
        href="/portal/clinical_supervisor/escalations"
        className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Back to escalations
      </Link>

      <PageTitle
        description="Created → Supervisor review → Required action → Intervention / follow-up → Monitor → Resolved."
        action={
          escalation ? (
            <span className="flex gap-2">
              <Badge tone={uiTone(priorityTone(escalation.priority))} dot>
                {priorityLabel(escalation.priority)}
              </Badge>
              <Badge tone={uiTone(statusTone(escalation.status))}>{statusLabel(escalation.status)}</Badge>
            </span>
          ) : null
        }
      >
        {escalation ? `${escalation.reference} · Escalation` : "Escalation"}
      </PageTitle>

      {error ? (
        <EmptyState
          title="We could not load this escalation"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : loading ? (
        <LoadingState label="Loading escalation" />
      ) : !escalation ? (
        <EmptyState title="We could not find that escalation" description="It may have been removed or you may not have access to it." />
      ) : (
        <div className="space-y-6">
          {escalation.priority === "critical" ? (
            <Alert tone="danger" title="Critical escalation">
              <p>Human review required. This escalation cannot be resolved or closed without an explicit confirmation.</p>
              {data?.emergencyProcedure ? (
                <p className="mt-2 rounded-xl bg-white/70 p-3 text-xs">{data.emergencyProcedure}</p>
              ) : null}
            </Alert>
          ) : null}

          <Card>
            <SectionTitle>Workflow</SectionTitle>
            <ol className="mt-4 flex flex-wrap gap-2">
              {STAGES.map((label, index) => (
                <li key={label}>
                  <Badge tone={index <= stage ? "accent" : "neutral"}>{label}</Badge>
                </li>
              ))}
            </ol>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <SectionTitle>Escalation</SectionTitle>
              <dl className="mt-4 divide-y divide-slate-100">
                <DataRow label="Escalation ID">{escalation.reference}</DataRow>
                <DataRow label="Type">{escalation.riskType ? humanLabel(escalation.riskType) : humanLabel(escalation.source)}</DataRow>
                <DataRow label="Priority"><Badge tone={uiTone(priorityTone(escalation.priority))}>{priorityLabel(escalation.priority)}</Badge></DataRow>
                <DataRow label="Status"><Badge tone={uiTone(statusTone(escalation.status))}>{statusLabel(escalation.status)}</Badge></DataRow>
                <DataRow label="Created by">{escalation.createdByName ?? humanLabel(escalation.source)}</DataRow>
                <DataRow label="Therapist / supporter">{escalation.therapistName ?? "-"}</DataRow>
                <DataRow label="Client">{escalation.clientName ?? escalation.clientAlias ?? (escalation.clientId ? "Restricted" : "-")}</DataRow>
                <DataRow label="Created"><time dateTime={escalation.escalatedAt}>{formatDateTime(escalation.escalatedAt)}</time></DataRow>
                <DataRow label="Assigned to">{escalation.assignedReviewerName ?? "Unassigned"}</DataRow>
              </dl>
              <div className="mt-4 space-y-3">
                <Description label="Description" value={escalation.reason} />
                <Description label="Observations" value={escalation.observations} />
                <Description label="Required action" value={escalation.recommendedAction} />
                <Description label="Actions taken" value={escalation.actionsTaken} />
                <Description label="Follow-up actions" value={escalation.followUpActions} />
                <Description label="Resolution" value={escalation.resolution} />
              </div>
            </Card>

            <Card>
              <SectionTitle>History</SectionTitle>
              <div className="mt-4">
                {data.events.length === 0 ? (
                  <EmptyState title="No actions yet" description="Review steps and decisions will be recorded here." />
                ) : (
                  <ol className="space-y-3">
                    {data.events.map((event) => (
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
              <EscalationActions escalationId={escalationId} onDone={() => void load()} />
            </div>
          </Card>
        </div>
      )}
    </SupervisorPage>
  );
}

function Description({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{value}</p>
    </div>
  );
}

function EscalationActions({ escalationId, onDone }: { escalationId: string; onDone: () => void }) {
  const [action, setAction] = useState<EscalationAction>("acknowledge");
  const [detail, setDetail] = useState("");
  const [resolution, setResolution] = useState("");
  const [priority, setPriority] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await actOnEscalation(escalationId, {
        action,
        detail: detail || null,
        resolution: resolution || null,
        priority: (priority || undefined) as Priority | undefined,
        confirm: confirm || undefined,
      });
      setDetail("");
      setResolution("");
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
        <Field label="Workflow step">
          <select className={inputClass} value={action} onChange={(e) => setAction(e.target.value as EscalationAction)}>
            {WORKFLOW.map((option) => (
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
        <p className="self-end text-[11px] text-slate-500">
          {WORKFLOW.find((option) => option.value === action)?.note}
        </p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Detail">
          <textarea className={textareaClass} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </Field>
        {["resolve", "close"].includes(action) ? (
          <Field label="Resolution / outcome">
            <textarea className={textareaClass} value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </Field>
        ) : null}
      </div>
      {["resolve", "close"].includes(action) ? (
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          I confirm a human has reviewed this escalation; serious cases are not closed automatically.
        </label>
      ) : null}
      <Button type="submit" className="mt-4" loading={busy}>
        Record action
      </Button>
    </form>
  );
}
