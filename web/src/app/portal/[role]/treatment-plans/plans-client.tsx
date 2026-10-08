"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TherapistPage } from "@/components/therapist/shell";
import { Field, Panel, ProgressBar, inputClass } from "@/components/therapist/ui";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LinkButton,
  LoadingState,
  PageTitle,
  type Tone,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import {
  createPlan,
  fetchClients,
  fetchPlans,
  formatDay,
  type CaseloadClient,
  type TreatmentPlan,
} from "@/lib/therapist";

const STATUS_TONE: Record<string, Tone> = {
  active: "accent",
  draft: "neutral",
  completed: "success",
  archived: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  completed: "Completed",
  archived: "Archived",
};

export default function PlansClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId");

  const [plans, setPlans] = useState<TreatmentPlan[] | null>(null);
  const [clients, setClients] = useState<CaseloadClient[]>([]);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(Boolean(clientId));
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ clientId: clientId ?? "", title: "", summary: "" });

  const load = useCallback(async () => {
    try {
      const response = await fetchPlans(clientId ?? undefined);
      setPlans(response.plans);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [clientId]);

  const reload = useCallback(() => {
    setPlans(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const loadClients = useCallback(async () => {
    try {
      const response = await fetchClients({ sort: "name" });
      setClients(response.clients);
      setClientsError(null);
    } catch (err) {
      setClientsError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    if (!showForm) return;
    void (async () => {
      await loadClients();
    })();
  }, [showForm, loadClients]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.clientId || !form.title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const response = await createPlan({
        clientId: form.clientId,
        title: form.title.trim(),
        summary: form.summary.trim() || undefined,
        status: "draft",
        goals: [],
      });
      router.push(`/portal/therapist/treatment-plans/${response.plan.id}`);
    } catch (err) {
      setFormError(messageFor(err));
      setSaving(false);
    }
  }

  return (
    <TherapistPage>
      <PageTitle
        description="Goals, objectives and measurable progress for each client. Plans stay private to you and the client they belong to."
        action={
          <Button onClick={() => setShowForm((prev) => !prev)}>
            {showForm ? "Close" : "New plan"}
          </Button>
        }
      >
        Treatment plans
      </PageTitle>

      {showForm ? (
        <Panel title="New plan" className="mb-6">
          {formError ? (
            <div className="mb-4">
              <Alert tone="danger" title="We could not create the plan">
                {formError}
              </Alert>
            </div>
          ) : null}
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Client">
              <select
                value={form.clientId}
                onChange={(event) => setForm({ ...form, clientId: event.target.value })}
                className={inputClass}
                required
              >
                <option value="">Choose a client...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.fullName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Plan title">
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Anxiety management - 12 week plan"
                className={inputClass}
                required
              />
            </Field>
            <Field label="Summary" className="sm:col-span-2" hint="What the work is aiming at, in plain language.">
              <textarea
                value={form.summary}
                onChange={(event) => setForm({ ...form, summary: event.target.value })}
                className={`${inputClass} min-h-24 resize-y`}
              />
            </Field>
            {clientsError ? (
              <div className="sm:col-span-2">
                <Alert
                  tone="danger"
                  title="We could not load your clients"
                  action={
                    <Button size="sm" variant="secondary" onClick={() => void loadClients()}>
                      Try again
                    </Button>
                  }
                />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Button
                type="submit"
                loading={saving}
                disabled={!form.clientId || !form.title.trim()}
              >
                {saving ? "Creating..." : "Create plan"}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {plans === null && error ? (
        <EmptyState
          title="We could not load your treatment plans"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : plans === null ? (
        <LoadingState label="Loading treatment plans" />
      ) : plans.length === 0 ? (
        <EmptyState
          title="No treatment plans yet"
          description="Create a plan with goals and objectives so progress has something to be measured against."
          action={<Button onClick={() => setShowForm(true)}>Create the first plan</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link
                href={`/portal/therapist/treatment-plans/${plan.id}`}
                className="card card-interactive block p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {plan.title}
                      </p>
                      <Badge tone={STATUS_TONE[plan.status] ?? "neutral"} dot>
                        {STATUS_LABEL[plan.status] ?? plan.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {plan.clientName}
                      {plan.goalCount > 0 ? ` · ${plan.goalCount} goals` : ""}
                      {" · Updated "}
                      <time dateTime={plan.updatedAt}>{formatDay(plan.updatedAt)}</time>
                      {plan.startDate ? (
                        <>
                          {" · Starts "}
                          <time dateTime={plan.startDate}>{formatDay(plan.startDate)}</time>
                        </>
                      ) : null}
                      {plan.targetDate ? (
                        <>
                          {" · Target "}
                          <time dateTime={plan.targetDate}>{formatDay(plan.targetDate)}</time>
                        </>
                      ) : null}
                    </p>
                    {plan.summary ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {plan.summary}
                      </p>
                    ) : null}
                  </div>
                  <div className="w-full sm:w-40">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <span>{plan.progressPercent ?? 0}%</span>
                      {plan.goalCount > 0 ? (
                        <span>
                          {plan.goalsCompleted}/{plan.goalCount} goals
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5">
                      <ProgressBar percent={plan.progressPercent ?? 0} />
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <LinkButton href="/portal/therapist/clients" variant="secondary" size="sm">
          Caseload
        </LinkButton>
        <LinkButton href="/portal/therapist/assessments" variant="secondary" size="sm">
          Assessments
        </LinkButton>
      </div>
    </TherapistPage>
  );
}
