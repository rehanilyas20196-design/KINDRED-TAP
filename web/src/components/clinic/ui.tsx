"use client";

/**
 * Shared furniture for the collaborative clinic pages.
 *
 * Deliberately thin: it re-exports the portal's own design-system components
 * from `@/components/therapist/ui` and adds only the three things every clinic
 * page needs and nothing else - a data table with accessible semantics, a
 * paginator, and a status pill that never relies on colour alone.
 */

import { type ReactNode } from "react";
import {
  Panel as BasePanel,
  EmptyState as BaseEmptyState,
  ErrorPanel as BaseErrorPanel,
  LoadingBlock as BaseLoadingBlock,
  SearchField as BaseSearchField,
  Field as BaseField,
  inputClass as baseInputClass,
  textareaClass as baseTextareaClass,
  SegmentedControl as BaseSegmentedControl,
  StatTile as BaseStatTile,
  DataRow as BaseDataRow,
  PageHeader as BasePageHeader,
  primaryActionClass as basePrimaryActionClass,
  secondaryActionClass as baseSecondaryActionClass,
} from "@/components/therapist/ui";
import { Badge as DesignBadge, Button, type Tone as DesignTone } from "@/components/ui";
import { statusTone, titleCase, type Tone } from "@/lib/clinic";

export type { Tone };

const DESIGN_TONE: Record<Tone, DesignTone> = {
  teal: "accent",
  slate: "neutral",
  amber: "warning",
  rose: "danger",
  emerald: "success",
  sky: "info",
};

export {
  BasePanel as Panel,
  BaseEmptyState as EmptyState,
  BaseErrorPanel as ErrorPanel,
  BaseLoadingBlock as LoadingBlock,
  BaseField as Field,
  BaseStatTile as StatTile,
  BaseDataRow as DataRow,
  BasePageHeader as PageHeader,
};

export const primaryActionClass = basePrimaryActionClass;
export const secondaryActionClass = baseSecondaryActionClass;

export const inputClass = baseInputClass;
export const textareaClass = baseTextareaClass;

export function SegmentedControl<T extends string>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return <BaseSegmentedControl {...props} />;
}

export function SearchField(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return <BaseSearchField {...props} />;
}

/**
 * A status pill.
 *
 * The word is always present, so the state never depends on distinguishing a
 * colour - which is both an accessibility requirement and a practical one when a
 * partner is scanning a table for the one row that needs action. The raw value
 * stays in the payload; only the label is humanised.
 */
export function StatusPill({ status, tone }: { status: string | null | undefined; tone?: Tone }) {
  if (!status) return <DesignBadge tone="neutral" dot>Unknown</DesignBadge>;
  return (
    <DesignBadge tone={DESIGN_TONE[tone ?? statusTone(status)]} dot>
      {titleCase(status)}
    </DesignBadge>
  );
}

export function Badge({
  tone = "slate",
  dot = false,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <DesignBadge tone={DESIGN_TONE[tone]} dot={dot}>
      {children}
    </DesignBadge>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  key: string;
  header: string;
  /** Right-aligned numeric column, and marked up as such for a screen reader. */
  numeric?: boolean;
  render: (row: T) => ReactNode;
}

/**
 * A table that reads correctly with a screen reader: a real `<caption>`, a
 * `<thead>` with `scope="col"` headers, and a row header for the identifying
 * cell so a reader can say "row 3, REF-2026-104322" rather than a bare number.
 *
 * The wrapper scrolls horizontally rather than truncating columns, because a
 * referral table that hides its status column defeats the point.
 */
export function DataTable<T extends { id: string }>({
  caption,
  columns,
  rows,
  rowHeaderIndex = 0,
  empty,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowHeaderIndex?: number;
  empty?: ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <>
        {empty ?? (
          <BaseEmptyState title="Nothing to show" body="There is nothing recorded here yet." />
        )}
      </>
    );
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${
                  column.numeric ? "text-right" : ""
                } ${index === rowHeaderIndex ? "pl-0" : ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row) => (
            <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  {...(index === rowHeaderIndex ? { scope: "row" } : {})}
                  className={`px-3 py-3 align-top text-slate-700 dark:text-slate-200 ${
                    column.numeric ? "text-right tabular-nums" : ""
                  } ${index === rowHeaderIndex ? "pl-0 font-medium" : ""}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

/**
 * Server-side pagination. The API caps a page at 100 rows and every list here
 * asks for 25, so the portal never tries to render thousands of referrals at
 * once.
 */
export function Paginator({
  total,
  limit,
  offset,
  onChange,
  noun = "records",
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
  noun?: string;
}) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  const from = offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"
    >
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Showing {from}&ndash;{to} of {total} {noun}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={offset === 0}
        >
          Previous
        </Button>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Page {page} of {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(offset + limit)}
          disabled={to >= total}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function Notice({
  tone = "teal",
  children,
}: {
  tone?: "teal" | "rose" | "amber";
  children: ReactNode;
}) {
  const classes =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        : "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200";

  // Assertive only for errors: an error the user cannot see is an error they
  // cannot act on.
  return (
    <div role={tone === "rose" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm ${classes}`}>
      {children}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">{children}</div>
  );
}

export function TableCaptionHint({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{children}</p>;
}