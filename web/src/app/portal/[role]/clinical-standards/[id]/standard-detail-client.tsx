"use client";

import { useCallback, useEffect, useState } from "react";
import { AdvisorPage } from "@/components/advisor/shell";
import {
  Badge,
  DataRow,
  EmptyState,
  ErrorPanel,
  Field,
  LoadingBlock,
  PageHeader,
  Panel,
  primaryActionClass,
  secondaryActionClass,
  inputClass,
  textareaClass,
} from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  archiveStandard,
  fetchStandard,
  formatDay,
  formatDateTime,
  reviewStandard,
  standardStatusLabel,
  updateStandard,
  type StandardDetail,
} from "@/lib/advisor";

function statusTone(status: string): "teal" | "amber" | "sky" | "slate" | "rose" {
  if (status === "active") return "teal";
  if (status === "under_review") return "sky";
  if (status === "revision_requested") return "amber";
  if (status === "archived") return "slate";
  return "rose";
}

export default function StandardDetailClient({ standardId }: { standardId: string }) {
  const [data, setData] = useState<StandardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dueSoon, setDueSoon] = useState(false);

  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState("");
  const [nextReviewAt, setNextReviewAt] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetchStandard(standardId);
      setData(response);
      setError(null);
      setDescription(response.standard.description ?? "");
      setVersion(response.standard.version);
      setStatus(response.standard.status);
      setNextReviewAt(
        response.standard.nextReviewAt ? response.standard.nextReviewAt.slice(0, 10) : ""
      );
      // Evaluated once per load so render stays pure.
      setDueSoon(
        Boolean(
          response.standard.nextReviewAt &&
            new Date(response.standard.nextReviewAt).getTime() <=
              Date.now() + 30 * 24 * 3600 * 1000
        )
      );
    } catch (err) {
      setError(messageFor(err));
    }
  }, [standardId]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      await load();
    } catch (err) {
      setNotice(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <AdvisorPage><ErrorPanel message={error} onRetry={load} /></AdvisorPage>;
  if (!data) {
    return (
      <AdvisorPage>
        <LoadingBlock label="Loading standard..." />
      </AdvisorPage>
    );
  }

  const { standard, revisions } = data;

  return (
    <AdvisorPage>
      <PageHeader
        title={standard.title}
        description={`${standard.category} · version ${standard.version}`}
        back={{ href: "/portal/clinical_advisor/clinical-standards", label: "Clinical standards" }}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing((prev) => !prev)}
              className={secondaryActionClass}
            >
              {editing ? "Close" : "Edit"}
            </button>
            <button
              type="button"
              disabled={busy || standard.status === "archived"}
              onClick={() =>
                run(
                  () => reviewStandard(standard.id, { action: "reviewed", notes: reviewNotes || undefined }),
                  "Marked reviewed; the next review date has been pushed forward."
                )
              }
              className={primaryActionClass}
            >
              Mark reviewed
            </button>
          </div>
        }
      />

      {notice ? (
        <div className="mb-5 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800 dark:border-teal-700/60 dark:bg-teal-500/10 dark:text-teal-200">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Panel
            title="Record"
            action={<Badge tone={statusTone(standard.status)}>{standardStatusLabel(standard.status)}</Badge>}
          >
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {standard.description || "No description recorded."}
            </p>
            <div className="mt-4">
              <DataRow label="Key">{standard.key}</DataRow>
              <DataRow label="Category">{standard.category}</DataRow>
              <DataRow label="Owner">{standard.ownerName ?? "Unassigned"}</DataRow>
              <DataRow label="Last reviewed">{formatDay(standard.lastReviewedAt)}</DataRow>
              <DataRow label="Next review">
                <span className={data.standard.nextReviewAt ? "" : ""}>{formatDay(standard.nextReviewAt)}</span>
              </DataRow>
              <DataRow label="Created">{formatDateTime(standard.createdAt)}</DataRow>
              <DataRow label="Updated">{formatDateTime(standard.updatedAt)}</DataRow>
            </div>
          </Panel>

          {editing ? (
            <Panel title="Edit this standard">
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await updateStandard(standard.id, {
                      description,
                      version,
                      status: status as typeof standard.status,
                      nextReviewAt: nextReviewAt || null,
                    });
                    setEditing(false);
                  }, "Saved; a new revision was recorded.");
                }}
              >
                <Field label="Description" className="sm:col-span-2">
                  <textarea
                    className={textareaClass}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
                <Field label="Version">
                  <input
                    className={inputClass}
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className={inputClass}
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="under_review">Under review</option>
                    <option value="revision_requested">Revision requested</option>
                    <option value="archived">Archived</option>
                  </select>
                </Field>
                <Field label="Next review date">
                  <input
                    type="date"
                    className={inputClass}
                    value={nextReviewAt}
                    onChange={(event) => setNextReviewAt(event.target.value)}
                  />
                </Field>
                <div className="flex items-end gap-3">
                  <button type="submit" disabled={busy} className={primaryActionClass}>
                    {busy ? "Saving..." : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className={secondaryActionClass}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </Panel>
          ) : null}

          <Panel title="Revision history">
            {revisions.length === 0 ? (
              <EmptyState
                title="No revisions yet"
                body="Every create, edit, review and archive writes an immutable revision row here."
              />
            ) : (
              <ol className="space-y-4">
                {revisions.map((revision) => (
                  <li key={revision.id} className="border-l-2 border-teal-200 pl-4 dark:border-teal-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {revision.action} · v{revision.version}
                      </p>
                      <span className="text-[11px] text-slate-500 dark:text-slate-500">
                        {formatDateTime(revision.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {revision.changeSummary || "No summary recorded."}
                      {revision.changedByName ? ` · ${revision.changedByName}` : ""}
                    </p>
                    {revision.snapshot ? (
                      <p className="mt-1 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                        Snapshot: {revision.snapshot.title} (v{revision.snapshot.version})
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Panel title="Review workflow">
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Reviewing confirms the standard is current and schedules the next review using the
              clinic&apos;s review interval. Requesting a revision keeps the wording but flags the
              record.
            </p>
            <Field label="Review notes (optional)">
              <textarea
                className={textareaClass}
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                placeholder="What was checked?"
              />
            </Field>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                disabled={busy || standard.status === "archived"}
                onClick={() =>
                  run(
                    () =>
                      reviewStandard(standard.id, {
                        action: "revision_requested",
                        notes: reviewNotes || undefined,
                      }),
                    "Revision requested."
                  )
                }
                className={secondaryActionClass}
              >
                Request revision
              </button>
              <button
                type="button"
                disabled={busy || standard.status === "archived"}
                onClick={() => {
                  if (window.confirm("Archive this standard? It stays readable with its history.")) {
                    void run(() => archiveStandard(standard.id), "Standard archived.");
                  }
                }}
                className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:border-rose-400 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300"
              >
                Archive standard
              </button>
            </div>
          </Panel>

          <Panel title="At a glance">
            <DataRow label="Revisions">{String(revisions.length)}</DataRow>
            <DataRow label="Current version">v{standard.version}</DataRow>
            <DataRow label="Review due">
              {standard.nextReviewAt && dueSoon ? "Yes" : "No"}
            </DataRow>
          </Panel>
        </div>
      </div>
    </AdvisorPage>
  );
}
