import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui";

/** Shared shell and controls for every section of the user support page. */

export const primaryActionClass = "btn btn-primary";

export const secondaryActionClass = "btn btn-secondary";

export const quietActionClass = "btn btn-secondary btn-sm";

export const inputClass = "field";

export const labelClass = "field-label";

export function SupportSection({
  id,
  icon,
  title,
  intro,
  action,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  intro: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${id}-title`;

  return (
    <section id={id} aria-labelledby={headingId} className="card scroll-mt-24 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            {...{ focusable: "false" }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100"
          >
            {icon}
          </span>
          <div>
            <h2 id={headingId} className="text-[0.9375rem] font-semibold tracking-tight text-slate-900">
              {title}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{intro}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const PILL_TONES: Record<string, string> = {
  scheduled: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  open: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  in_progress: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  closed: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  urgent: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  normal: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  const toneClass = PILL_TONES[tone] ?? PILL_TONES.normal;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${toneClass}`}
    >
      {children}
    </span>
  );
}

export function NoteTone({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "danger" | "success" | "warning";
  children: ReactNode;
}) {
  const tones = {
    neutral:
      "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300",
    danger:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
    warning:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  } as const;

  return (
    <div
      role="status"
      className={`rounded-xl border px-3.5 py-2.5 text-xs leading-5 ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center text-xs leading-5 text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
      {children}
    </p>
  );
}

/** Placeholder rows shown while a section's data is still arriving. */
export function LoadingRow({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <span className="sr-only">{label}…</span>
      <div className="space-y-2.5" aria-hidden="true">
        <Skeleton className="h-3.5 w-40 rounded-full" />
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-3 w-2/3 rounded-full" />
      </div>
    </div>
  );
}

/** Honorifics are not names: "Dr Jane Okafor" initials as JO, not DJ. */
const TITLE_PATTERN = /^(dr|mr|mrs|ms|miss|prof|professor|rev)\.?$/i;

/** Initials avatar used wherever a person is shown without a photo. */
export function initialsFor(name: string | null | undefined): string {
  const parts = name
    ?.trim()
    .split(/\s+/)
    .filter((part) => part && !TITLE_PATTERN.test(part))
    .slice(0, 2);
  if (!parts?.length) return "?";
  return parts.map((part) => part[0]?.toUpperCase()).join("");
}
