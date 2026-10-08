"use client";

import { useState } from "react";
import { apiPost, messageFor } from "@/lib/api";
import { Alert, Button, Dialog, Spinner } from "@/components/ui";

export function EscalationModal({
  isOpen,
  onClose,
  sessionId,
  clientAlias,
  role,
}: {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  clientAlias?: string;
  role: "supporter" | "therapist";
}) {
  const [riskType, setRiskType] = useState<string>("self_harm");
  const [severity, setSeverity] = useState<string>("high");
  const [details, setDetails] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (details.trim().length < 10) {
      setError("Please provide at least 10 characters describing the safety concern");
      return;
    }

    setPending(true);
    setError(null);

    try {
      if (role === "supporter") {
        await apiPost("/api/supporter/escalate", {
          sessionId,
          clientAlias: clientAlias ?? "Anonymous Peer Client",
          riskType,
          severity,
          details: details.trim(),
        });
      } else {
        await apiPost("/api/therapist/escalate", {
          sessionId,
          clientAlias: clientAlias ?? "Clinical Patient",
          riskLevel: severity === "critical" ? "imminent_danger" : severity === "high" ? "severe" : "moderate",
          clinicalObservations: details.trim(),
          recommendedAction: "Supervisor intervention & immediate check-in",
        });
      }
      setSubmitted(true);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      tone="danger"
      title={role === "supporter" ? "Safeguarding concern escalation" : "Clinical risk escalation"}
      subtitle="Direct route to the Clinical Supervisor and Safety Team"
      footer={
        submitted ? (
          <Button onClick={onClose}>Return to session</Button>
        ) : (
          <div className="flex w-full flex-wrap justify-end gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="escalation-form" variant="danger" loading={pending}>
              {pending ? "Dispatching…" : "Submit escalation"}
            </Button>
          </div>
        )
      }
    >
      {submitted ? (
        <div className="space-y-3 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
          </span>
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            Escalation sent to clinical supervisors
          </h3>
          <p className="mx-auto max-w-sm text-sm leading-6 text-slate-500">
            Your report has been dispatched with high priority. A supervisor is reviewing it now.
            Stay with standard protocols if you are in active contact.
          </p>
        </div>
      ) : (
        <form id="escalation-form" onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <div>
            <label
              htmlFor="escalation-risk"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Nature of safety risk
            </label>
            <select
              id="escalation-risk"
              value={riskType}
              onChange={(e) => setRiskType(e.target.value)}
              className="field"
            >
              <option value="self_harm">Risk of self-harm or suicidal ideation</option>
              <option value="harm_others">Risk of harm to others</option>
              <option value="severe_crisis">Severe emotional crisis / acute distress</option>
              <option value="safeguarding_violation">
                Safeguarding / abuse / exploitation concern
              </option>
            </select>
          </div>

          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-slate-700">
              Urgency level
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "medium", label: "Medium" },
                { key: "high", label: "High" },
                { key: "critical", label: "Critical" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={severity === item.key}
                  onClick={() => setSeverity(item.key)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    severity === item.key
                      ? "border-rose-600 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="escalation-details"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Observations and context
            </label>
            <textarea
              id="escalation-details"
              rows={4}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe specific statements, behaviour patterns or indicators observed…"
              className="field resize-y"
              required
            />
            <p className="mt-1.5 text-xs text-slate-500">
              At least 10 characters. This goes straight to the on-duty supervisor.
            </p>
          </div>

          {pending ? (
            <p className="flex items-center gap-2 text-xs text-slate-500" role="status">
              <Spinner className="h-3.5 w-3.5 text-rose-600" />
              Dispatching to the safety team…
            </p>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
