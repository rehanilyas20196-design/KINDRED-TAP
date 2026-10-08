"use client";

import { useParams } from "next/navigation";

import { useState } from "react";
import Link from "next/link";
import { usePortalGuard, GuardSplash, SignedOutPanel, WrongPortalPanel } from "@/components/portal-guard";
import { DashboardShell } from "@/components/dashboard";
import { portalFor } from "@/lib/portals";
import { EthicsBadge } from "@/components/ethics-badge";
import { EscalationModal } from "@/components/escalation-modal";
import { SoapNotesDrawer } from "@/components/soap-notes-drawer";
import { Icon } from "@/components/icons";
import { Badge, Button } from "@/components/ui";

export default function TherapistSessionPage() {
  const role = useParams<{ role: string }>().role;
  const guard = usePortalGuard(role);
  const portal = portalFor(role);

  const [messages, setMessages] = useState<Array<{ sender: string; body: string; time: string }>>([
    {
      sender: "Client #9042",
      body: "Hello Dr. Morgan. The panic episodes have decreased slightly since our last exercise, but mornings are still challenging.",
      time: "11:00 AM",
    },
    {
      sender: "You (Therapist)",
      body: "Welcome! That is an encouraging step. Let's review your morning triggers and ground ourselves before we dive into today's CBT module.",
      time: "11:02 AM",
    },
  ]);
  const [inputMsg, setInputMsg] = useState("");
  const [isEscalateOpen, setIsEscalateOpen] = useState(false);
  const [isSoapOpen, setIsSoapOpen] = useState(false);

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
        sender: "You (Therapist)",
        body: inputMsg.trim(),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setInputMsg("");
  }

  return (
    <DashboardShell portal={portal!} user={guard.user}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <Link
              href="/portal/therapist"
              className="inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline dark:text-teal-300 dark:hover:text-teal-100"
            >
              <Icon name="arrowLeft" className="h-3.5 w-3.5" />
              Therapist dashboard
            </Link>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Session with Client #9042
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsEscalateOpen(true)}
            >
              <Icon name="alert" className="h-4 w-4" />
              Clinical escalation
            </Button>
            <Button size="sm" onClick={() => setIsSoapOpen(true)}>
              <Icon name="notes" className="h-4 w-4" />
              SOAP notes &amp; follow-up
            </Button>
          </div>
        </div>

        <EthicsBadge roleTitle="Licensed Therapist" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Active Therapy Room */}
          <div className="card flex h-[540px] flex-col overflow-hidden lg:col-span-2">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
              <div className="min-w-0">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Clinical consultation room
                </h2>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  CBT &amp; mindfulness · Telehealth / messaging
                </p>
              </div>
              <Badge tone="success" dot className="shrink-0">
                Live
              </Badge>
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
              <label className="sr-only" htmlFor="therapist-session-input">
                Type professional therapeutic guidance
              </label>
              <input
                id="therapist-session-input"
                type="text"
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                placeholder="Type your guidance…"
                className="field flex-1 py-2.5 text-sm"
              />
              <Button
                type="submit"
                size="sm"
                className="shrink-0 self-center"
                disabled={!inputMsg.trim()}
              >
                Send
              </Button>
            </form>
          </div>

          {/* Clinical Overview Panel */}
          <div className="space-y-4">
            <div className="card p-5">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Case overview
              </h2>
              <dl className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">Client</dt>
                  <dd className="text-right font-medium text-slate-900 dark:text-white">
                    #9042 (age 31)
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-slate-500 dark:text-slate-400">Concern</dt>
                  <dd className="text-right font-medium text-slate-900 dark:text-white">
                    Generalised anxiety &amp; panic episodes
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-slate-500 dark:text-slate-400">Goals</dt>
                  <dd className="text-right font-medium text-slate-900 dark:text-white">
                    Cognitive restructuring, panic response reduction
                  </dd>
                </div>
              </dl>
            </div>

            <div className="card p-5">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Quick tools
              </h2>
              <div className="mt-3 space-y-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setIsSoapOpen(true)}
                >
                  <Icon name="notes" className="h-4 w-4 shrink-0" />
                  Open SOAP notes &amp; homework planner
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setIsEscalateOpen(true)}
                >
                  <Icon name="alert" className="h-4 w-4 shrink-0" />
                  Escalate a safeguarding concern
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* SOAP Notes Drawer */}
        <SoapNotesDrawer
          isOpen={isSoapOpen}
          onClose={() => setIsSoapOpen(false)}
          sessionId="ther-session-case-th-301"
        />

        {/* Escalation Modal */}
        <EscalationModal
          isOpen={isEscalateOpen}
          onClose={() => setIsEscalateOpen(false)}
          sessionId="ther-session-case-th-301"
          clientAlias="Client #9042"
          role="therapist"
        />
      </div>
    </DashboardShell>
  );
}
