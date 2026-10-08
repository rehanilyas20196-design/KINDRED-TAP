"use client";

import { useParams } from "next/navigation";

import { useState } from "react";
import Link from "next/link";
import { usePortalGuard, GuardSplash, SignedOutPanel, WrongPortalPanel } from "@/components/portal-guard";
import { DashboardShell } from "@/components/dashboard";
import { portalFor } from "@/lib/portals";
import { EthicsBadge } from "@/components/ethics-badge";
import { EscalationModal } from "@/components/escalation-modal";
import { Dialog, Spinner } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiPost, messageFor } from "@/lib/api";

export default function SupporterSessionPage() {
  const role = useParams<{ role: string }>().role;
  const guard = usePortalGuard(role);
  const portal = portalFor(role);

  const [messages, setMessages] = useState<Array<{ sender: string; body: string; time: string }>>([
    {
      sender: "Jordan K. (Matched Client)",
      body: "Hi! Thanks for connecting. I've been feeling extremely stressed at work lately and finding it hard to unplug.",
      time: "10:14 AM",
    },
    {
      sender: "You (Peer Supporter)",
      body: "Hello Jordan! I completely hear you. Workplace burnout and constant pressure can be really exhausting. I'm here to listen and support you through this.",
      time: "10:15 AM",
    },
  ]);
  const [inputMsg, setInputMsg] = useState("");
  const [isEscalateOpen, setIsEscalateOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [debriefNotes, setDebriefNotes] = useState("");
  const [emotionalState, setEmotionalState] = useState<"calm" | "improved" | "neutral" | "needs_followup">("improved");
  const [completing, setCompleting] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!inputMsg.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        sender: "You (Peer Supporter)",
        body: inputMsg.trim(),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setInputMsg("");
  }

  async function handleCompleteSession(e: React.FormEvent) {
    e.preventDefault();
    setCompleting(true);
    setErrorBanner(null);

    try {
      await apiPost("/api/supporter/session/session-req-sup-101/complete", {
        summaryNotes: debriefNotes.trim() || "Peer support session concluded safely.",
        clientEmotionalState: emotionalState,
        nextRecommendedStep: "Encouraged daily grounding break and optional follow-up peer check-in.",
      });
      setSessionCompleted(true);
      setIsCompleteOpen(false);
    } catch (err) {
      setErrorBanner(messageFor(err));
    } finally {
      setCompleting(false);
    }
  }

  return (
    <DashboardShell portal={portal!} user={guard.user}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <Link
              href="/portal/supporter"
              className="inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline dark:text-teal-300 dark:hover:text-teal-100"
            >
              <Icon name="arrowLeft" className="h-3.5 w-3.5" />
              Supporter dashboard
            </Link>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Peer support session with Jordan K.
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEscalateOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
            >
              <Icon name="alert" className="h-4 w-4" />
              Escalate concern
            </button>
            <button
              type="button"
              onClick={() => setIsCompleteOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <Icon name="check" className="h-4 w-4" />
              Complete session
            </button>
          </div>
        </div>

        <EthicsBadge roleTitle="Peer Supporter" />

        {sessionCompleted ? (
          <div className="card p-8 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-600 text-white">
              <Icon name="check" className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              Session completed
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
              Debrief notes recorded and client state marked as &quot;{emotionalState}&quot;. Thank
              you for providing peer support.
            </p>
            <Link
              href="/portal/supporter"
              className="btn btn-primary mt-5 inline-flex items-center gap-1.5"
            >
              Return to dashboard
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Chat Room */}
            <div className="flex h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
                <div className="min-w-0">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Live peer support chat
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    Matched topic: work stress &amp; anxiety
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  Active room
                </span>
              </div>

              <div className="flex-1 space-y-3.5 overflow-y-auto p-4">
                {messages.map((m, idx) => {
                  const isMe = m.sender.startsWith("You");
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                    >
                      <span className="mb-1 px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {m.sender} · {m.time}
                      </span>
                      <div
                        className={`max-w-md whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${
                          isMe
                            ? "bg-teal-700 text-white"
                            : "bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-100"
                        }`}
                      >
                        {m.body}
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={handleSend}
                className="flex gap-2 border-t border-slate-100 p-3 dark:border-slate-800"
              >
                <label className="sr-only" htmlFor="peer-session-input">
                  Type a supportive response
                </label>
                <input
                  id="peer-session-input"
                  type="text"
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  placeholder="Type a supportive response…"
                  className="field flex-1 py-2.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={!inputMsg.trim()}
                  className="btn btn-primary shrink-0 self-center px-4 py-2.5 text-xs"
                >
                  Send
                </button>
              </form>
            </div>

            {/* Supporter Helper Panel */}
            <div className="space-y-4">
              <div className="card p-5">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Client match context
                </h2>
                <dl className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Alias</dt>
                    <dd className="text-right font-medium text-slate-900 dark:text-white">
                      Jordan K. (22–26)
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Match score</dt>
                    <dd className="text-right font-medium text-slate-900 dark:text-white">94%</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Primary concern</dt>
                    <dd className="text-right font-medium text-slate-900 dark:text-white">
                      Workplace burnout &amp; anxiety
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
                <h2 className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-300">
                  <Icon name="notes" className="h-4 w-4" />
                  Peer support guidelines
                </h2>
                <ul className="mt-2.5 space-y-1.5 text-[13px] leading-5 text-amber-900 dark:text-amber-200">
                  <li>Validate feelings with active listening.</li>
                  <li>Share lived experiences without giving medical advice.</li>
                  <li>Escalate immediately if self-harm triggers arise.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Escalation Modal */}
        <EscalationModal
          isOpen={isEscalateOpen}
          onClose={() => setIsEscalateOpen(false)}
          sessionId="session-req-sup-101"
          clientAlias="Jordan K."
          role="supporter"
        />

        {/* Complete Session Modal */}
        <Dialog
          open={isCompleteOpen}
          onClose={() => setIsCompleteOpen(false)}
          title="Complete peer support session"
          subtitle="Add debrief notes to mark this session complete."
        >
          <form onSubmit={handleCompleteSession} className="space-y-4">
            {errorBanner ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
              >
                {errorBanner}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="post-session-state"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Client post-session emotional state
              </label>
              <select
                id="post-session-state"
                value={emotionalState}
                onChange={(e) => setEmotionalState(e.target.value as typeof emotionalState)}
                className="field"
              >
                <option value="calm">Calm &amp; grounded</option>
                <option value="improved">Improved &amp; encouraged</option>
                <option value="neutral">Neutral</option>
                <option value="needs_followup">Needs follow-up peer support</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="debrief-notes"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Debrief notes
              </label>
              <textarea
                id="debrief-notes"
                rows={3}
                value={debriefNotes}
                onChange={(e) => setDebriefNotes(e.target.value)}
                placeholder="Briefly describe the session outcome and support provided…"
                className="field min-h-24 resize-y leading-6"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsCompleteOpen(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={completing} className="btn btn-primary">
                {completing ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    Saving…
                  </>
                ) : (
                  "Confirm & close session"
                )}
              </button>
            </div>
          </form>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
