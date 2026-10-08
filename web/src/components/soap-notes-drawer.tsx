"use client";

import { useState } from "react";
import { apiPost, messageFor } from "@/lib/api";

export function SoapNotesDrawer({
  isOpen,
  onClose,
  sessionId,
}: {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}) {
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [tasks, setTasks] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  function addTask() {
    if (taskInput.trim()) {
      setTasks([...tasks, taskInput.trim()]);
      setTaskInput("");
    }
  }

  function removeTask(index: number) {
    setTasks(tasks.filter((_, i) => i !== index));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setBanner(null);

    try {
      await apiPost(`/api/therapist/session/${sessionId}/notes`, {
        subjective: subjective.trim(),
        objective: objective.trim(),
        assessment: assessment.trim(),
        plan: plan.trim(),
      });

      if (followupDate) {
        await apiPost(`/api/therapist/session/${sessionId}/followup`, {
          followupDate,
          assignedTasks: tasks,
          notes: plan.trim(),
        });
      }

      setSaved(true);
    } catch (err) {
      setBanner(messageFor(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/50 backdrop-blur-xs">
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              SOAP Clinical Notes & Follow-up Care
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Session ID: {sessionId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close clinical notes"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {saved ? (
          <div className="mt-8 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/20 text-teal-600 dark:text-teal-300 text-xl">
              ✓
            </div>
            <h4 className="text-base font-semibold text-slate-900 dark:text-white">
              Clinical Notes & Follow-up Recorded
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your SOAP documentation has been securely saved to the confidential clinical record.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 min-h-11 rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-teal-800"
            >
              Close Drawer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-5 space-y-5">
            {banner ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                {banner}
              </div>
            ) : null}

            {/* Subjective */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                S - Subjective (Client&apos;s reported feelings, symptoms & narrative)
              </label>
              <textarea
                rows={3}
                value={subjective}
                onChange={(e) => setSubjective(e.target.value)}
                placeholder="Client reports feeling persistent work-related anxiety and sleeping difficulties..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            {/* Objective */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                O - Objective (Therapist observations, affect, speech pattern, clinical metrics)
              </label>
              <textarea
                rows={3}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Affect congruent, coherent speech, calm demeanor during deep breathing exercise..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            {/* Assessment */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                A - Assessment (Clinical evaluation, progress, diagnosis/formulation updates)
              </label>
              <textarea
                rows={3}
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                placeholder="Mild reduction in panic frequency. Responding well to cognitive reframing techniques..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            {/* Plan */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                P - Plan (Treatment direction, homework, next steps)
              </label>
              <textarea
                rows={3}
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="Continue bi-weekly CBT sessions. Practice 5-4-3-2-1 grounding exercise when anxious..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            <hr className="border-slate-100 dark:border-slate-800" />

            {/* Follow-up & Homework */}
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                Follow-up & Self-Care Tasks
              </h4>

              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Target Follow-up Date
                  </label>
                  <input
                    type="date"
                    value={followupDate}
                    onChange={(e) => setFollowupDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Assigned Client Tasks / Homework
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    placeholder="e.g. Daily mood journal entry"
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={addTask}
                    className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-700"
                  >
                    Add Task
                  </button>
                </div>

                {tasks.length > 0 ? (
                  <ul className="mt-2.5 space-y-1.5">
                    {tasks.map((t, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        <span className="min-w-0 break-words">• {t}</span>
                        <button
                          type="button"
                          onClick={() => removeTask(idx)}
                          aria-label={`Remove task: ${t}`}
                          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 rounded-xl bg-teal-700 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {pending ? "Saving..." : "Save SOAP Notes & Follow-up"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
