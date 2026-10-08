"use client";

import { useState } from "react";
import { ETHICS_VERSION } from "@/lib/portals";
import { Badge, Button, Dialog } from "@/components/ui";

const CLAUSES = [
  {
    title: "Confidentiality & privacy",
    body: "All discussions, records and client communications must be strictly safeguarded under privacy standards.",
  },
  {
    title: "Scope & boundaries",
    body: "Maintain professional and peer boundaries at all times and avoid conflicts of interest.",
  },
  {
    title: "Duty of care & safeguarding escalation",
    body: "Immediate obligation to escalate severe safety concerns, self-harm or risk to life to Clinical Supervisors.",
  },
];

export function EthicsBadge({ roleTitle }: { roleTitle: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
          </span>
          <div>
            <p className="text-xs font-semibold text-emerald-900">
              Ethical agreement & code of conduct active
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-700">
              Signed version {ETHICS_VERSION} · {roleTitle} compliance verified
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          View guidelines
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Ethical agreement & code of practice"
        subtitle={`Version ${ETHICS_VERSION}`}
        footer={<Button onClick={() => setOpen(false)}>Close</Button>}
      >
        <div className="space-y-3">
          {CLAUSES.map((clause, index) => (
            <div key={clause.title} className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-100">
              <p className="text-sm font-semibold text-slate-900">
                {index + 1}. {clause.title}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{clause.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Badge tone="success" dot>
            Acknowledged on this account
          </Badge>
        </div>
      </Dialog>
    </>
  );
}
