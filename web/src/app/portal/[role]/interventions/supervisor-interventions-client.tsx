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
import { Field, SegmentedControl, inputClass, textareaClass } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import {
  createIntervention,
  fetchInterventions,
  fetchTeam,
  formatDay,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  type InterventionList,
  type InterventionStep,
  type Priority,
  type TeamMember,
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

const CATEGORIES = ["clinical", "documentation", "supervision", "safety", "conduct", "workload", "other"];

const FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
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

export default function SupervisorInterventionsClient() {
  const [data, setData] = useState<InterventionList | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [related, setRelated] = useState<{ type: string | null; id: string | null }>({ type: null, id: null });

  useEffect(() => {
    // Read the link-back params from the URL without useSearchParams so the
    // page does not need a Suspense boundary. Deferred so no state is set
    // synchronously inside the effect body.
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const type = params.get("related");
      const id = params.get("relatedId");
      if (type && id) {
        setRelated({ type, id });
        setShowForm(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchInterventions({ status, q });
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    fetchTeam().then((r) => setTeam(r.team)).catch(() => setTeam([]));
  }, []);

  const counts = data?.counts ?? {};

  return (
    <SupervisorPage>
      <PageTitle
        description="Support, improvement and safety actions for a practitioner or case. Not a disciplinary system."
        action={
          <Button aria-expanded={showForm} aria-controls="intervention-form" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "Create intervention"}
          </Button>
        }
      >
        Interventions
      </PageTitle>

      <div id="intervention-form">
        {showForm ? (
          <CreateForm
            team={team}
            related={related}
            onCreated={() => {
              setShowForm(false);
              setRelated({ type: null, id: null });
              void load();
            }}
          />
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Pending" value={counts.pending ?? 0} />
        <StatTile label="In progress" value={counts.inProgress ?? 0} />
        <StatTile label="Overdue" value={counts.overdue ?? 0} />
        <StatTile label="Completed" value={counts.completed ?? 0} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SegmentedControl options={FILTERS} value={status} onChange={setStatus} ariaLabel="Filter interventions" />
        <div className="relative w-full sm:min-w-56 sm:flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            aria-label="Search interventions"
            placeholder="Search reference, title or assignee"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load interventions"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading interventions" />
        ) : !data || data.interventions.length === 0 ? (
          <EmptyState
            title="No interventions yet"
            description="Create an intervention when a practitioner, case or workflow requires action."
            action={<Button onClick={() => setShowForm(true)}>Create intervention</Button>}
          />
        ) : (
          <Card>
            <SectionTitle detail={`${data.total} total`}>Interventions</SectionTitle>
            <ul className="mt-4 divide-y divide-slate-100">
              {data.interventions.map((intervention) => (
                <li key={intervention.id}>
                  <Link href={`/portal/clinical_supervisor/interventions/${intervention.id}`} className="block py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                        <Badge tone={uiTone(priorityTone(intervention.priority))} dot>
                          {priorityLabel(intervention.priority)}
                        </Badge>
                        <Badge tone={uiTone(statusTone(intervention.status))}>{statusLabel(intervention.status)}</Badge>
                        <span className="truncate">{intervention.title}</span>
                      </p>
                      <div className="text-right text-[11px] text-slate-500">
                        <p className="font-medium">{intervention.reference}</p>
                        <p>{intervention.assigneeName ?? "Unassigned"}</p>
                        <p className={intervention.overdue ? "font-semibold text-rose-600" : ""}>
                          Due{" "}
                          {intervention.dueDate ? (
                            <time dateTime={intervention.dueDate}>{formatDay(intervention.dueDate)}</time>
                          ) : (
                            "not set"
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 max-w-md">
                      <ProgressBar
                        value={intervention.progress.done}
                        total={intervention.progress.total}
                        label={`${intervention.title} progress`}
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        {intervention.progress.done}/{intervention.progress.total} steps complete
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </SupervisorPage>
  );
}

function CreateForm({
  team,
  related,
  onCreated,
}: {
  team: TeamMember[];
  related: { type: string | null; id: string | null };
  onCreated: () => void;
}) {
  const [assignedTo, setAssignedTo] = useState("");
  const [category, setCategory] = useState("clinical");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [instructions, setInstructions] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [steps, setSteps] = useState<InterventionStep[]>([]);
  const [stepText, setStepText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addStep() {
    if (!stepText.trim()) return;
    setSteps((prev) => [...prev, { id: `step-${prev.length + 1}-${Date.now()}`, text: stepText.trim(), done: false }]);
    setStepText("");
  }

  async function submit() {
    if (!assignedTo) {
      setError("Choose who the intervention is for.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createIntervention({
        assignedTo,
        category,
        title,
        reason,
        instructions: instructions || null,
        steps,
        priority,
        dueDate: dueDate || null,
        relatedType: related.type,
        relatedId: related.id,
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
      <SectionTitle>Create intervention</SectionTitle>
      <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {related.type ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Linked to {humanLabel(related.type)}.
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Assigned to">
            <select className={inputClass} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Choose...</option>
              {team.map((member) => (
                <option key={member.id} value={member.id}>{member.fullName} ({member.role})</option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>{humanLabel(value)}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Title">
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Reason">
            <textarea className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Instructions (optional)">
            <textarea className={textareaClass} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 max-w-xs">
          <Field label="Due date (optional)">
            <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-slate-600">Required actions</legend>
          <div className="mt-2 flex gap-2">
            <input
              aria-label="Add a required action step"
              className={inputClass}
              value={stepText}
              onChange={(e) => setStepText(e.target.value)}
              placeholder="Add a step"
            />
            <Button variant="secondary" onClick={addStep}>Add</Button>
          </div>
          {steps.length > 0 ? (
            <ol className="mt-3 list-inside list-decimal text-sm text-slate-600">
              {steps.map((step, index) => (
                <li key={step.id}>
                  {step.text}
                  <button
                    type="button"
                    className="ml-2 text-[11px] text-rose-600"
                    aria-label={`Remove step: ${step.text}`}
                    onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
        </fieldset>
        <Button
          type="submit"
          className="mt-4"
          loading={busy}
          disabled={title.trim().length < 4 || reason.trim().length < 10}
        >
          Create intervention
        </Button>
      </form>
    </Card>
  );
}
