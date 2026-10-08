"use client";

import { useState } from "react";
import { Button, LinkButton } from "@/components/ui";
import { NoteTone, SupportSection } from "./parts";

type Panel = "emergency" | "trusted" | "crisis" | null;

/** Numbers that are stable and country-wide; nothing here is guesswork. */
const EMERGENCY_NUMBERS = [
  { label: "United Kingdom", number: "999", note: "Police, ambulance, fire" },
  { label: "Europe", number: "112", note: "Any emergency service" },
  { label: "United States & Canada", number: "911", note: "Police, ambulance, fire" },
];

/**
 * The urgent help block.
 *
 * Kept deliberately separate from therapist contact: a therapist may not answer
 * for hours, and this section has to say so rather than imply otherwise.
 */
export function EmergencySection({
  contactName,
  contactPhone,
  contactRelation,
}: {
  contactName: string | null;
  contactPhone: string | null;
  contactRelation: string | null;
}) {
  const [panel, setPanel] = useState<Panel>(null);

  function toggle(next: Exclude<Panel, null>) {
    setPanel((current) => (current === next ? null : next));
  }

  return (
    <SupportSection
      id="urgent"
      icon="🆘"
      title="Need urgent help?"
      intro="If you feel that you or someone else may be in immediate danger, contact your local emergency service or a trusted person immediately. Your therapist may not respond straight away."
      action={
        <span className="rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
          Not the same as therapist support
        </span>
      }
    >
      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          onClick={() => toggle("emergency")}
          aria-expanded={panel === "emergency"}
          aria-controls="urgent-emergency"
        >
          Emergency help
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => toggle("trusted")}
          aria-expanded={panel === "trusted"}
          aria-controls="urgent-trusted"
        >
          Contact a trusted person
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => toggle("crisis")}
          aria-expanded={panel === "crisis"}
          aria-controls="urgent-crisis"
        >
          Crisis resources
        </Button>
      </div>

      <div
        id="urgent-emergency"
        role="region"
        aria-labelledby="urgent-emergency-heading"
        hidden={panel !== "emergency"}
        className="mt-4 space-y-3"
      >
        <h3
          id="urgent-emergency-heading"
          className="text-sm font-semibold text-slate-900 dark:text-white"
        >
          Emergency numbers
        </h3>
        <ul className="grid gap-2 sm:grid-cols-3">
          {EMERGENCY_NUMBERS.map((item) => (
            <li
              key={item.number}
              className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900 dark:bg-rose-950/40"
            >
              <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{item.label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {item.number}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.note}</p>
              <a href={`tel:${item.number}`} className="btn btn-primary btn-lg mt-3 w-full">
                Call {item.number}
              </a>
            </li>
          ))}
        </ul>
        <NoteTone tone="danger">
          Somewhere else? Dial your local emergency number - it is the same service everywhere,
          just a different digit. If you can, stay with someone and do not stay alone with it.
        </NoteTone>
      </div>

      <div
        id="urgent-trusted"
        hidden={panel !== "trusted"}
        className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50"
      >
        {contactName ? (
          <>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {contactName}
              {contactRelation ? (
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  {" "}
                  · {contactRelation}
                </span>
              ) : null}
            </p>
            {contactPhone ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a href={`tel:${contactPhone}`} className="btn btn-primary btn-lg">
                  Call {contactPhone}
                </a>
                <a href={`sms:${contactPhone}`} className="btn btn-secondary btn-lg">
                  Text them
                </a>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                No number saved for this contact yet.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You have not saved an emergency contact yet. Add someone you would actually call at
              2am - a friend, a neighbour, a family member.
            </p>
            <LinkButton href="/portal/user/profile" size="lg" className="mt-3">
              Add a trusted contact
            </LinkButton>
          </>
        )}
      </div>

      <div id="urgent-crisis" hidden={panel !== "crisis"} className="mt-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Crisis resources</h3>
        <ul className="space-y-2 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <li className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
            <span>
              <span className="font-semibold">Samaritans</span> — free, 24/7, any age, any
              problem
            </span>
            <a href="tel:116123" className="btn btn-primary btn-lg">
              Call 116 123
            </a>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
            <span>
              <span className="font-semibold">Emergency services</span> — if someone is in
              immediate danger
            </span>
            <a href="tel:999" className="btn btn-primary btn-lg">
              Call 999
            </a>
          </li>
        </ul>
        <NoteTone>
          Outside the UK, search &ldquo;crisis helpline&rdquo; plus your country, or ask any
          local service to connect you. A text line is often faster than a call when talking out
          loud feels like too much.
        </NoteTone>
      </div>
    </SupportSection>
  );
}
