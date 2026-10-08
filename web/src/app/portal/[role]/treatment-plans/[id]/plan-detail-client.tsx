"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TherapistPage } from "@/components/therapist/shell";
import { Icon } from "@/components/icons";
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
  createHomework,
  deletePlan,
  fetchPlan,
  savePlanStructure,
  setGoalProgress,
  updatePlan,
  type GoalStatus,
  type TreatmentPlan,
} from "@/lib/therapist";

const GOAL_STATUSES: GoalStatus[] = ["not_started", "in_progress", "completed", "dropped"];
const PLAN_STATUSES: TreatmentPlan["status"][] = ["draft", "active", "completed", "archived"];

const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  dropped: "Dropped",
};

const PLAN_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

const PLAN_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  active: "accent",
  completed: "success",
  archived: "warning",
};

interface EditableObjective {
  title: string;
  interventions: string;
  status: GoalStatus;
  targetDate: string;
}

interface EditableGoal {
  title: string;
  notes: string;
  status: GoalStatus;
  targetDate: string;
  progressPercent: number;
  objectives: EditableObjective[];
}

function toEditable(plan: TreatmentPlan): EditableGoal[] {
  return plan.goals.map((goal) => ({
    title: goal.title,
    notes: goal.notes ?? "",
    status: goal.status,
    targetDate: goal.targetDate ?? "",
    progressPercent: goal.progressPercent,
    objectives: goal.objectives.map((objective) => ({
      title: objective.title,
      interventions: (objective.interventions ?? []).join(", "),
      status: objective.status,
      targetDate: objective.targetDate ?? "",
    })),
  }));
}

function emptyGoal(): EditableGoal {
  return {
    title: "",
    notes: "",
    status: "not_started",
    targetDate: "",
    progressPercent: 0,
    objectives: [],
  };
}

const selectClass = `${inputClass} text-xs`;
const smallInputClass = `${inputClass} text-xs py-2`;

export default function PlanDetailClient({ planId }: { planId: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState<TreatmentPlan | null>(null);
  const [header, setHeader] = useState({ title: "", summary: "", startDate: "", targetDate: "" });
  const [goals, setGoals] = useState<EditableGoal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [homework, setHomework] = useState({ title: "", details: "", dueDate: "" });

  const load = useCallback(async () => {
    try {
      const response = await fetchPlan(planId);
      setPlan(response.plan);
      setGoals(toEditable(response.plan));
      setHeader({
        title: response.plan.title,
        summary: response.plan.summary ?? "",
        startDate: response.plan.startDate ?? "",
        targetDate: response.plan.targetDate ?? "",
      });
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [planId]);

  const reload = useCallback(() => {
    setPlan(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function saveHeader(event: React.FormEvent) {
    event.preventDefault();
    setBusy("header");
    setNotice(null);
    setError(null);
    try {
      const response = await updatePlan(planId, {
        title: header.title.trim() || undefined,
        summary: header.summary.trim(),
        startDate: header.startDate || null,
        targetDate: header.targetDate || null,
      });
      setPlan(response.plan);
      setNotice("Plan details saved.");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  async function changePlanStatus(status: TreatmentPlan["status"]) {
    setBusy("header");
    setError(null);
    try {
      const response = await updatePlan(planId, { status });
      setPlan(response.plan);
      setNotice(`Plan marked ${PLAN_STATUS_LABEL[status] ?? status}.`);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveGoals() {
    setBusy("goals");
    setNotice(null);
    setError(null);
    try {
      const payload = goals
        .filter((goal) => goal.title.trim().length >= 2)
        .map((goal) => ({
          title: goal.title.trim(),
          notes: goal.notes.trim() || undefined,
          status: goal.status,
          targetDate: goal.targetDate || null,
          progressPercent: goal.progressPercent,
          objectives: goal.objectives
            .filter((objective) => objective.title.trim().length >= 2)
            .map((objective) => ({
              title: objective.title.trim(),
              interventions: objective.interventions
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
              status: objective.status,
              targetDate: objective.targetDate || null,
            })),
        }));

      const response = await savePlanStructure(planId, payload);
      setPlan(response.plan);
      setGoals(toEditable(response.plan));
      setNotice("Goals saved.");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  async function patchGoal(goalId: string, patch: { progressPercent?: number; status?: GoalStatus }) {
    setError(null);
    try {
      await setGoalProgress(planId, goalId, patch);
      setPlan((prev) =>
        prev
          ? {
              ...prev,
              goals: prev.goals.map((goal) =>
                goal.id === goalId
                  ? {
                      ...goal,
                      progressPercent: patch.progressPercent ?? goal.progressPercent,
                      status: patch.status ?? goal.status,
                    }
                  : goal
              ),
            }
          : prev
      );
      setNotice("Goal updated.");
    } catch (err) {
      setError(messageFor(err));
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this plan? Goals and objectives go with it.")) return;
    setBusy("delete");
    try {
      await deletePlan(planId);
      router.push("/portal/therapist/treatment-plans");
    } catch (err) {
      setError(messageFor(err));
      setBusy(null);
    }
  }

  async function assignHomework(event: React.FormEvent) {
    event.preventDefault();
    if (!plan || !homework.title.trim()) return;
    setBusy("homework");
    setError(null);
    try {
      await createHomework({
        clientId: plan.clientId,
        title: homework.title.trim(),
        details: homework.details.trim() || undefined,
        dueDate: homework.dueDate || undefined,
      });
      setHomework({ title: "", details: "", dueDate: "" });
      setNotice("Homework assigned.");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  if (error && !plan) {
    return (
      <TherapistPage>
        <EmptyState
          title="We could not load this treatment plan"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      </TherapistPage>
    );
  }
  if (!plan) {
    return (
      <TherapistPage>
        <LoadingState label="Loading treatment plan" />
      </TherapistPage>
    );
  }

  return (
    <TherapistPage>
      <Link
        href="/portal/therapist/treatment-plans"
        className="mb-2.5 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline dark:text-teal-300 dark:hover:text-teal-100"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Treatment plans
      </Link>

      <PageTitle
        description={
          <>
            {plan.clientName} · {plan.goals.length} goals · Updated{" "}
            <time dateTime={plan.updatedAt}>
              {new Date(plan.updatedAt).toLocaleDateString()}
            </time>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton
              href={`/portal/therapist/clients/${plan.clientId}`}
              variant="secondary"
              size="sm"
            >
              Client
            </LinkButton>
            <select
              value={plan.status}
              disabled={busy !== null}
              onChange={(event) => changePlanStatus(event.target.value as TreatmentPlan["status"])}
              aria-label="Plan status"
              className={`${inputClass} w-full text-xs font-semibold sm:w-auto`}
            >
              {PLAN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PLAN_STATUS_LABEL[status] ?? status}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {plan.title}
      </PageTitle>

      {error ? (
        <div className="mb-5">
          <Alert tone="danger" title="We could not save that change">
            {error}
          </Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-5">
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Plan details">
            <form onSubmit={saveHeader} className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" className="sm:col-span-2">
                <input
                  type="text"
                  value={header.title}
                  onChange={(event) => setHeader({ ...header, title: event.target.value })}
                  className={inputClass}
                  maxLength={200}
                />
              </Field>
              <Field label="Summary" className="sm:col-span-2">
                <textarea
                  value={header.summary}
                  onChange={(event) => setHeader({ ...header, summary: event.target.value })}
                  className={`${inputClass} min-h-24 resize-y`}
                  maxLength={4000}
                />
              </Field>
              <Field label="Start date">
                <input
                  type="date"
                  value={header.startDate}
                  onChange={(event) => setHeader({ ...header, startDate: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Target date">
                <input
                  type="date"
                  value={header.targetDate}
                  onChange={(event) => setHeader({ ...header, targetDate: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  loading={busy === "header"}
                  disabled={busy !== null}
                >
                  {busy === "header" ? "Saving..." : "Save details"}
                </Button>
              </div>
            </form>
          </Panel>

          <Panel
            title="Goals & objectives"
            action={
              <span className="text-xs text-slate-500 dark:text-slate-500">
                Goals and objectives save together
              </span>
            }
          >
            {goals.length === 0 ? (
              <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                No goals yet. Add the first goal, then break it into objectives.
              </p>
            ) : null}

            <div className="space-y-5">
              {goals.map((goal, goalIndex) => (
                <div
                  key={goalIndex}
                  className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={`Goal ${goalIndex + 1}`} className="sm:col-span-2">
                      <input
                        type="text"
                        value={goal.title}
                        maxLength={300}
                        placeholder="Reduce panic frequency"
                        onChange={(event) =>
                          setGoals(
                            goals.map((item, index) =>
                              index === goalIndex ? { ...item, title: event.target.value } : item
                            )
                          )
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Status">
                      <select
                        value={goal.status}
                        onChange={(event) =>
                          setGoals(
                            goals.map((item, index) =>
                              index === goalIndex
                                ? { ...item, status: event.target.value as GoalStatus }
                                : item
                            )
                          )
                        }
                        className={selectClass}
                      >
                        {GOAL_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {GOAL_STATUS_LABEL[status]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Target date">
                      <input
                        type="date"
                        value={goal.targetDate}
                        onChange={(event) =>
                          setGoals(
                            goals.map((item, index) =>
                              index === goalIndex ? { ...item, targetDate: event.target.value } : item
                            )
                          )
                        }
                        className={smallInputClass}
                      />
                    </Field>
                    <Field label="Notes" className="sm:col-span-2">
                      <textarea
                        value={goal.notes}
                        maxLength={4000}
                        onChange={(event) =>
                          setGoals(
                            goals.map((item, index) =>
                              index === goalIndex ? { ...item, notes: event.target.value } : item
                            )
                          )
                        }
                        className={`${inputClass} min-h-20 resize-y text-xs`}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                      Objectives
                    </p>
                    {goal.objectives.map((objective, objectiveIndex) => (
                      <div
                        key={objectiveIndex}
                        className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={objective.title}
                            maxLength={300}
                            placeholder="Objective"
                            aria-label={`Objective ${objectiveIndex + 1} for goal ${goalIndex + 1}`}
                            onChange={(event) =>
                              setGoals(
                                goals.map((item, index) =>
                                  index === goalIndex
                                    ? {
                                        ...item,
                                        objectives: item.objectives.map((existing, position) =>
                                          position === objectiveIndex
                                            ? { ...existing, title: event.target.value }
                                            : existing
                                        ),
                                      }
                                    : item
                                )
                              )
                            }
                            className={`${inputClass} w-full min-w-0 flex-1 text-xs sm:w-auto`}
                          />
                          <select
                            value={objective.status}
                            aria-label={`Status for objective ${objectiveIndex + 1}`}
                            onChange={(event) =>
                              setGoals(
                                goals.map((item, index) =>
                                  index === goalIndex
                                    ? {
                                        ...item,
                                        objectives: item.objectives.map((existing, position) =>
                                          position === objectiveIndex
                                            ? { ...existing, status: event.target.value as GoalStatus }
                                            : existing
                                        ),
                                      }
                                    : item
                                )
                              )
                            }
                            className={`${selectClass} w-full sm:w-32`}
                          >
                            {GOAL_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {GOAL_STATUS_LABEL[status]}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove objective ${objectiveIndex + 1}`}
                            className="shrink-0 px-2.5"
                            onClick={() =>
                              setGoals(
                                goals.map((item, index) =>
                                  index === goalIndex
                                    ? {
                                        ...item,
                                        objectives: item.objectives.filter(
                                          (_, position) => position !== objectiveIndex
                                        ),
                                      }
                                    : item
                                )
                              )
                            }
                          >
                            ✕
                          </Button>
                        </div>
                        <input
                          type="text"
                          value={objective.interventions}
                          placeholder="Interventions, comma separated"
                          aria-label={`Interventions for objective ${objectiveIndex + 1}`}
                          onChange={(event) =>
                            setGoals(
                              goals.map((item, index) =>
                                index === goalIndex
                                  ? {
                                      ...item,
                                      objectives: item.objectives.map((existing, position) =>
                                        position === objectiveIndex
                                          ? { ...existing, interventions: event.target.value }
                                          : existing
                                      ),
                                    }
                                  : item
                              )
                            )
                          }
                          className={`${inputClass} mt-2 text-xs`}
                        />
                      </div>
                    ))}

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setGoals(
                          goals.map((item, index) =>
                            index === goalIndex
                              ? {
                                  ...item,
                                  objectives: [
                                    ...item.objectives,
                                    { title: "", interventions: "", status: "not_started", targetDate: "" },
                                  ],
                                }
                              : item
                          )
                        )
                      }
                    >
                      + Add objective
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[11px] text-slate-500 dark:text-slate-500">
                      Progress below saves as you change it
                    </span>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setGoals(goals.filter((_, index) => index !== goalIndex))}
                    >
                      Remove goal
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setGoals([...goals, emptyGoal()])}>
                + Add goal
              </Button>
              <Button
                loading={busy === "goals"}
                disabled={busy !== null}
                onClick={() => void saveGoals()}
              >
                {busy === "goals" ? "Saving..." : "Save goals"}
              </Button>
            </div>
          </Panel>

          <Panel title="Live goal progress">
            {plan.goals.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Save a goal first - progress is tracked per goal.
              </p>
            ) : (
              <ul className="space-y-4">
                {plan.goals.map((goal) => (
                  <li key={goal.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {goal.title}
                      </p>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {goal.progressPercent}%
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <ProgressBar percent={goal.progressPercent} />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={goal.progressPercent}
                        onBlur={(event) => {
                          const value = Math.max(0, Math.min(100, Number(event.target.value)));
                          if (value !== goal.progressPercent) patchGoal(goal.id, { progressPercent: value });
                        }}
                        className={`${smallInputClass} w-full sm:w-20`}
                        aria-label={`Progress for ${goal.title}`}
                      />
                      <select
                        value={goal.status}
                        onChange={(event) =>
                          patchGoal(goal.id, { status: event.target.value as GoalStatus })
                        }
                        className={`${selectClass} w-full sm:w-36`}
                        aria-label={`Status for ${goal.title}`}
                      >
                        {GOAL_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {GOAL_STATUS_LABEL[status]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Assign homework">
            <form onSubmit={assignHomework} className="space-y-3">
              <Field label="Task">
                <input
                  type="text"
                  value={homework.title}
                  onChange={(event) => setHomework({ ...homework, title: event.target.value })}
                  placeholder="Thought record, 3 entries"
                  className={inputClass}
                  maxLength={200}
                  required
                />
              </Field>
              <Field label="Instructions">
                <textarea
                  value={homework.details}
                  onChange={(event) => setHomework({ ...homework, details: event.target.value })}
                  className={`${inputClass} min-h-20 resize-y text-xs`}
                  maxLength={2000}
                />
              </Field>
              <Field label="Due date">
                <input
                  type="date"
                  value={homework.dueDate}
                  onChange={(event) => setHomework({ ...homework, dueDate: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Button
                type="submit"
                className="w-full"
                loading={busy === "homework"}
                disabled={busy !== null || !homework.title.trim()}
              >
                {busy === "homework" ? "Assigning..." : "Assign to client"}
              </Button>
            </form>
          </Panel>

          <Panel title="Plan summary">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              <div className="flex justify-between py-2">
                <dt className="text-xs text-slate-500">Status</dt>
                <dd>
                  <Badge tone={PLAN_STATUS_TONE[plan.status] ?? "neutral"} dot>
                    {PLAN_STATUS_LABEL[plan.status] ?? plan.status}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-xs text-slate-500">Goals completed</dt>
                <dd className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {plan.goalsCompleted}/{plan.goalCount}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-xs text-slate-500">Overall progress</dt>
                <dd className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {plan.progressPercent ?? 0}%
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-xs text-slate-500">Start</dt>
                <dd className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {plan.startDate ? (
                    <time dateTime={plan.startDate}>
                      {new Date(plan.startDate).toLocaleDateString()}
                    </time>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-xs text-slate-500">Target</dt>
                <dd className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {plan.targetDate ? (
                    <time dateTime={plan.targetDate}>
                      {new Date(plan.targetDate).toLocaleDateString()}
                    </time>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Danger zone">
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Deleting removes the plan, its goals and objectives. Session notes and assessments are
              not affected.
            </p>
            <Button
              variant="danger"
              className="mt-3 w-full"
              loading={busy === "delete"}
              disabled={busy !== null}
              onClick={() => void handleDelete()}
            >
              {busy === "delete" ? "Deleting..." : "Delete plan"}
            </Button>
          </Panel>
        </div>
      </div>
    </TherapistPage>
  );
}
