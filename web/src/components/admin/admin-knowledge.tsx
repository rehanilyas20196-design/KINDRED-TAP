"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Alert, Badge, Button, Card, Dialog, EmptyState, LoadingState } from "@/components/ui";
import {
  adminFetch,
  formatDateTime,
  isAuthFailure,
  type AdminKbDocument,
  type AdminKbIndexResult,
  type AdminKbStats,
} from "@/lib/admin";
import { messageFor, toFieldErrors } from "@/lib/api";

const KINDS = [
  { value: "doc", label: "Article" },
  { value: "faq", label: "FAQ" },
  { value: "policy", label: "Policy" },
];

const SOURCE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/;

interface Draft {
  source: string;
  title: string;
  kind: string;
  content: string;
}

const EMPTY_DRAFT: Draft = { source: "", title: "", kind: "doc", content: "" };

type Busy = null | "sync" | "add" | "remove";

/**
 * The Ask Cube knowledge base: what the assistant is allowed to know, and where
 * each answer came from. The corpus is only writable through /api/admin/kb/*,
 * which is the whole reason a user's private records can never be retrieved.
 */
export function AdminKnowledge({ onSessionLost }: { onSessionLost: () => void }) {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<AdminKbDocument[]>([]);
  const [stats, setStats] = useState<AdminKbStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Sources the last reindex could not build - without these a skipped
   *  dataset looks exactly like a successful one. */
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>(null);

  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftFields, setDraftFields] = useState<Record<string, string>>({});
  const [pendingRemoval, setPendingRemoval] = useState<AdminKbDocument | null>(null);

  const applyList = useCallback((next: { documents: AdminKbDocument[]; stats: AdminKbStats }) => {
    setDocuments(next.documents);
    setStats(next.stats);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const next = await adminFetch<{ documents: AdminKbDocument[]; stats: AdminKbStats }>(
          "/api/admin/kb/documents"
        );
        if (!cancelled) applyList(next);
      } catch (err) {
        if (cancelled) return;
        if (isAuthFailure(err)) {
          onSessionLost();
          return;
        }
        setError(messageFor(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, [applyList, onSessionLost]);

  const load = useCallback(async () => {
    applyList(await adminFetch("/api/admin/kb/documents"));
  }, [applyList]);

  /**
   * Runs one write and reports what went wrong in the caller's own words. An
   * expired admin session is the one failure this component recovers from by
   * handing control back to the panel.
   */
  async function attempt<T>(what: Exclude<Busy, null>, action: () => Promise<T>): Promise<T | null> {
    setBusy(what);
    setError(null);
    try {
      return await action();
    } catch (err) {
      if (isAuthFailure(err)) {
        onSessionLost();
        return null;
      }
      setError(messageFor(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    try {
      await load();
    } catch (err) {
      setError(messageFor(err));
    }
  }

  async function reindex() {
    setNotice(null);
    setSyncWarnings([]);
    const result = await attempt("sync", () =>
      adminFetch<AdminKbIndexResult>("/api/admin/kb/index", { method: "POST", body: {} })
    );
    if (!result) return;
    setNotice(
      result.sync
        ? `Reindexed ${result.sync.indexed} of ${result.sync.documents} documents` +
            `${result.sync.removed ? `, retired ${result.sync.removed}` : ""}.`
        : `Indexed ${result.results.length} document${result.results.length === 1 ? "" : "s"}.`
    );
    setSyncWarnings(result.sync?.warnings ?? []);
    await refresh();
  }

  async function submitDraft() {
    setDraftError(null);
    setDraftFields({});

    const source = draft.source.trim();
    const title = draft.title.trim();
    const content = draft.content.trim();

    if (!SOURCE_PATTERN.test(source)) {
      setDraftError(
        "A source looks like handbook:refunds - letters, numbers, colon, dot, dash or underscore."
      );
      return;
    }
    if (title.length < 2) {
      setDraftError("Give the document a title.");
      return;
    }
    if (content.length < 20) {
      setDraftError("A document needs at least a few words before it is worth citing.");
      return;
    }

    setBusy("add");
    setError(null);
    try {
      const result = await adminFetch<AdminKbIndexResult>("/api/admin/kb/index", {
        method: "POST",
        body: { source, title, kind: draft.kind, content },
      });
      setDraftOpen(false);
      setDraft(EMPTY_DRAFT);
      setNotice(`"${result.results[0]?.title ?? title}" is in the knowledge base.`);
      await load();
    } catch (err) {
      if (isAuthFailure(err)) {
        onSessionLost();
        return;
      }
      // Field-level issues belong under the field; anything else heads the card.
      const fields = toFieldErrors(err);
      setDraftFields(fields);
      setError(Object.keys(fields).length ? null : messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  async function confirmRemoval() {
    const target = pendingRemoval;
    if (!target) return;
    setPendingRemoval(null);

    const result = await attempt("remove", () =>
      adminFetch<{ removed: boolean }>(
        `/api/admin/kb/documents/${encodeURIComponent(target.source)}`,
        { method: "DELETE" }
      )
    );
    if (result?.removed) setNotice(`Removed "${target.title}".`);
    await refresh();
  }

  function onDraftSubmit(event: FormEvent) {
    event.preventDefault();
    void submitDraft();
  }

  if (loading) return <LoadingState label="Loading the knowledge base" />;

  const lastSync = stats?.lastSync ?? null;
  const syncFailed = Boolean(lastSync && lastSync.status !== "ok");

  return (
    <Card aria-labelledby="admin-kb-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="admin-kb-heading"
            className="text-[0.9375rem] font-semibold tracking-tight text-slate-900 dark:text-white"
          >
            Ask Cube knowledge base
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Everything Ask Cube cites comes from this corpus: the website copy, the approved
            datasets, and anything added here by hand. It never reads conversations or private
            records.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDraftOpen(true)}>
            Add document
          </Button>
          <Button
            size="sm"
            loading={busy === "sync"}
            disabled={!stats?.configured}
            onClick={() => void reindex()}
          >
            Reindex
          </Button>
        </div>
      </div>

      {stats && !stats.configured ? (
        <Alert tone="warning" title="Ask Cube is not configured">
          Set GEMINI_API_KEY in the API environment so documents can be embedded.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger" title="That did not work">
          {error}
        </Alert>
      ) : null}

      {notice ? (
        <Alert tone="success" title="Done">
          {notice}
        </Alert>
      ) : null}

      {syncWarnings.length > 0 ? (
        <Alert tone="warning" title="Some sources were not indexed">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {syncWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{stats?.documents ?? 0} documents</Badge>
        <Badge tone="neutral">{stats?.chunks ?? 0} passages</Badge>
        {typeof stats?.minScore === "number" ? (
          <Badge tone="info">cited above {stats.minScore.toFixed(2)} similarity</Badge>
        ) : null}
        {typeof stats?.keywordMin === "number" ? (
          <Badge tone="info">or {Math.round(stats.keywordMin * 100)}% of the words</Badge>
        ) : null}
        <Badge tone={syncFailed ? "danger" : "success"}>
          last sync {lastSync ? lastSync.status : "not run yet"}
        </Badge>
      </div>

      {lastSync ? (
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          {formatDateTime(lastSync.finishedAt ?? lastSync.startedAt)} · {lastSync.documentsIndexed}{" "}
          of {lastSync.documentsSeen} documents indexed
          {lastSync.documentsRemoved ? ` · ${lastSync.documentsRemoved} retired` : ""}
          {lastSync.error ? ` · ${lastSync.error}` : ""}
        </p>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Reindex to load the website copy and the approved datasets."
          action={
            <Button loading={busy === "sync"} onClick={() => void reindex()}>
              Reindex
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                  {doc.title}
                </span>
                <span className="block truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {doc.source}
                </span>
              </span>

              <Badge tone={doc.kind === "policy" ? "warning" : doc.kind === "faq" ? "info" : "neutral"}>
                {doc.kind}
              </Badge>

              <Badge tone={doc.managed ? "accent" : "neutral"}>
                {doc.managed ? "shipped" : "added by hand"}
              </Badge>

              <span className="w-24 text-right text-xs text-slate-500 dark:text-slate-400">
                {doc.embeddedChunks}/{doc.chunkCount} embedded
              </span>

              <span className="w-32 text-right text-xs text-slate-500 dark:text-slate-400">
                {formatDateTime(doc.indexedAt ?? doc.updatedAt)}
              </span>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingRemoval(doc)}
                aria-label={`Remove ${doc.title}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
        title="Add a document"
        subtitle="Added by hand: a reindex will not retire it, because only synced sources are managed."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraftOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy === "add"} onClick={() => void submitDraft()}>
              Add to knowledge base
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={onDraftSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Title</span>
            <input
              type="text"
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Refunds and cancellations"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            {draftFields.title ? (
              <span className="mt-1 block text-xs text-red-600">{draftFields.title}</span>
            ) : null}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Source</span>
            <input
              type="text"
              value={draft.source}
              onChange={(event) => setDraft((prev) => ({ ...prev, source: event.target.value }))}
              placeholder="handbook:refunds"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              The permanent identifier Ask Cube cites: letters, numbers, colon, dot, dash or
              underscore.
            </span>
            {draftFields.source ? (
              <span className="mt-1 block text-xs text-red-600">{draftFields.source}</span>
            ) : null}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Kind</span>
            <select
              value={draft.kind}
              onChange={(event) => setDraft((prev) => ({ ...prev, kind: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Content</span>
            <textarea
              value={draft.content}
              onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
              rows={10}
              placeholder="The text Ask Cube may quote when it answers."
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              {draft.content.trim().length} characters
            </span>
            {draftFields.content ? (
              <span className="mt-1 block text-xs text-red-600">{draftFields.content}</span>
            ) : null}
          </label>

          {draftError ? (
            <Alert tone="danger" title="Check the document">
              {draftError}
            </Alert>
          ) : null}

          <button type="submit" className="sr-only">
            Add to knowledge base
          </button>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        tone="danger"
        title="Remove this document?"
        subtitle={pendingRemoval?.source}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingRemoval(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy === "remove"}
              onClick={() => void confirmRemoval()}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          &ldquo;{pendingRemoval?.title}&rdquo; stops being cited straight away. Reindexing brings
          back anything the sync manages, so this only sticks for documents added by hand.
        </p>
      </Dialog>
    </Card>
  );
}
