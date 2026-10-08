"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import {
  Badge,
  EmptyState,
  ErrorPanel,
  Field,
  LoadingBlock,
  PageHeader,
  Panel,
  SearchField,
  SegmentedControl,
  StatTile,
  inputClass,
  primaryActionClass,
  secondaryActionClass,
  textareaClass,
} from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  createStandard,
  fetchStandards,
  formatDay,
  standardStatusLabel,
  type StandardRow,
} from "@/lib/advisor";

type Filter = "all" | "active" | "under_review" | "revision_requested" | "archived";

function statusTone(status: string): "teal" | "amber" | "sky" | "slate" | "rose" {
  if (status === "active") return "teal";
  if (status === "under_review") return "sky";
  if (status === "revision_requested") return "amber";
  if (status === "archived") return "slate";
  return "rose";
}

export default function StandardsClient() {
  const [rows, setRows] = useState<StandardRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [version, setVersion] = useState("1.0");
  const [nextReviewAt, setNextReviewAt] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetchStandards();
      setRows(response.standards);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const created = await createStandard({
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || "general",
        version: version.trim() || "1.0",
        nextReviewAt: nextReviewAt || null,
      });
      setNotice(`“${created.standard.title}” created.`);
      setTitle("");
      setDescription("");
      setCreating(false);
      await load();
    } catch (err) {
      setNotice(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  const all = rows ?? [];
  const visible = all.filter((row) => {
    const matchesFilter = filter === "all" || row.status === filter;
    const needle = search.trim().toLowerCase();
    const matchesSearch =
      !needle ||
      row.title.toLowerCase().includes(needle) ||
      row.category.toLowerCase().includes(needle) ||
      row.key.toLowerCase().includes(needle);
    return matchesFilter && matchesSearch;
  });
  const reviewDue = all.filter((row) => row.reviewDue).length;

  return (
    <AdvisorPage>
      <PageHeader
        title="Clinical standards"
        description="The clinic's written standards, who owns them, which version is current and when each one is next due for review. Every change writes a revision."
        action={
          <button
            type="button"
            onClick={() => setCreating((prev) => !prev)}
            className={primaryActionClass}
          >
            {creating ? "Close" : "New standard"}
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Standards" value={all.length} />
        <StatTile
          label="Reviews due"
          value={reviewDue}
          hint={reviewDue ? "Within 30 days" : "All up to date"}
        />
        <StatTile
          label="Active"
          value={all.filter((row) => row.status === "active").length}
        />
        <StatTile
          label="Archived"
          value={all.filter((row) => row.status === "archived").length}
        />
      </div>

      {creating ? (
        <div className="mb-6">
          <Panel title="Create a standard">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" className="sm:col-span-2">
                <input
                  className={inputClass}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Risk assessment procedures"
                  required
                  minLength={3}
                />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <textarea
                  className={textareaClass}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What the standard requires and why."
                />
              </Field>
              <Field label="Category">
                <input
                  className={inputClass}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="operations"
                />
              </Field>
              <Field label="Version">
                <input
                  className={inputClass}
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  placeholder="1.0"
                />
              </Field>
              <Field label="Next review date">
                <input
                  type="date"
                  className={inputClass}
                  value={nextReviewAt}
                  onChange={(event) => setNextReviewAt(event.target.value)}
                />
              </Field>
              <div className="flex items-end gap-3 sm:col-span-2">
                <button type="submit" disabled={busy} className={primaryActionClass}>
                  {busy ? "Creating..." : "Create standard"}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className={secondaryActionClass}
                >
                  Cancel
                </button>
                {notice ? (
                  <p className="text-xs font-medium text-teal-700 dark:text-teal-300">{notice}</p>
                ) : null}
              </div>
            </form>
          </Panel>
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel="Filter standards"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All (${all.length})` },
            { value: "active", label: "Active" },
            { value: "under_review", label: "Under review" },
            { value: "revision_requested", label: "Revision" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search standards"
        />
      </div>

      {error ? <ErrorPanel message={error} onRetry={load} /> : null}
      {rows === null && !error ? <LoadingBlock label="Loading standards..." /> : null}

      {rows !== null ? (
        visible.length === 0 ? (
          <EmptyState
            title="No standards match"
            body="Standards you create or that are seeded for the clinic appear here with their review clock."
            action={
              <button type="button" onClick={() => setCreating(true)} className={secondaryActionClass}>
                Create the first standard
              </button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {visible.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/portal/clinical_advisor/clinical-standards/${row.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-400/60 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {row.title}
                      </p>
                      <Badge tone={statusTone(row.status)}>
                        {standardStatusLabel(row.status)}
                      </Badge>
                      {row.reviewDue ? <Badge tone="amber">Review due</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {row.category} · v{row.version} · {row.revisionCount} revision
                      {row.revisionCount === 1 ? "" : "s"}
                      {row.ownerName ? ` · ${row.ownerName}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Next review
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDay(row.nextReviewAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </AdvisorPage>
  );
}
