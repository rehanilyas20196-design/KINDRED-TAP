"use client";

import { SupportSection } from "./parts";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

const QUESTIONS: { question: string; answer: string }[] = [
  {
    question: "Who can see my answers?",
    answer:
      "You can, always. Your matched therapist only sees them once you have messaged them and the " +
      "conversation is open. The people who run support tickets cannot read assessment answers at " +
      "all, and nothing you answer is shown publicly or used for advertising.",
  },
  {
    question: "Who can see my mood history?",
    answer:
      "Only you and the therapist you are working with. Mood and assessment history never appear " +
      "in the therapist directory, in search results, or to the supporters matched with other people.",
  },
  {
    question: "How does therapist matching work?",
    answer:
      "Your assessment and what you write are read for the concerns you are dealing with. The " +
      "platform then shows therapists who hold that specialty, are registered, and have " +
      "availability - best first, with the reason for each match shown on the card. The matching " +
      "suggests; you choose, and nothing is sent to a therapist until you write first.",
  },
  {
    question: "Can I change my therapist?",
    answer:
      "Yes. Nothing is locked in. Message someone else from the directory at any time, or send a " +
      "support request marked as a therapist problem and the team will help you switch.",
  },
  {
    question: "How do I delete my account?",
    answer:
      "Send a support request with the category Privacy concern and say you want your account " +
      "deleted. That removes your profile, assessments, messages and sessions, and the team " +
      "confirms it here once it is done.",
  },
  {
    question: "How is my information protected?",
    answer:
      "Every account action requires a live session token, and every read and write is scoped to " +
      "your own records - an id in a link cannot be used to open somebody else's data. Contact " +
      "details held for therapists (phone, address, date of birth) are never part of any list the " +
      "app returns, and traffic is encrypted in transit.",
  },
];

/**
 * Privacy answers written for the person rather than the lawyer: what is
 * visible, to whom, and how to make it stop.
 */
export function PrivacySection({ onReportConcern }: { onReportConcern: () => void }) {
  return (
    <SupportSection
      id="privacy"
      icon={<Icon name="lock" className="h-5 w-5" />}
      title="Privacy & safety"
      intro="Who can see your answers, how matching works, and how to take your data back."
      action={
        <Button variant="secondary" size="sm" onClick={onReportConcern}>
          Report a concern
        </Button>
      }
    >
      <div className="space-y-2">
        {QUESTIONS.map((item) => (
          <details
            key={item.question}
            className="group rounded-2xl border border-slate-200 px-4 py-3 open:border-teal-500/50 dark:border-slate-800"
          >
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-800 marker:hidden dark:text-slate-100">
              <span className="flex items-center justify-between gap-3">
                {item.question}
                <span
                  aria-hidden="true"
                  {...{ focusable: "false" }}
                  className="text-slate-500 transition group-open:rotate-45 dark:text-slate-500"
                >
                  +
                </span>
              </span>
            </summary>
            <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
              {item.answer}
            </p>
          </details>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Report a concern
          </p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Harassment, something that felt inappropriate, or anything about how your information
            was handled. Reports are read by the support team, not by the person reported.
          </p>
        </div>
        <Button variant="secondary" onClick={onReportConcern}>
          Report a concern
        </Button>
      </div>

      <p className="mt-4 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
        Questions about your data that are not answered here?{" "}
        <Button variant="ghost" size="sm" onClick={onReportConcern}>
          Send a privacy request
        </Button>
        .
      </p>
    </SupportSection>
  );
}
