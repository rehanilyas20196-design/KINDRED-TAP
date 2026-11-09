"use client";

import Link from "next/link";

import { useCallback, useEffect, useState } from "react";
import { ClinicPage } from "@/components/clinic/shell";
import {
  Badge,
  DataRow,
  DataTable,
  EmptyState,
  ErrorPanel,
  Field,
  FilterBar,
  LoadingBlock,
  Notice,
  PageHeader,
  Panel,
  SegmentedControl,
  StatusPill,
  inputClass,
  secondaryActionClass,
  textareaClass,
  type Column,
} from "@/components/clinic/ui";
import { messageFor } from "@/lib/api";
import {
  fetchAppointments,
  fetchNotifications,
  fetchOrganization,
  fetchReports,
  fetchSettings,
  fetchThread,
  fetchThreads,
  formatDateTime,
  formatDay,
  generateReport,
  markAllNotificationsRead,
  markNotificationRead,
  sendMessage,
  setAppointmentStatus,
  titleCase,
  type AppointmentRow,
  type ClinicNotification,
  type GeneratedReport,
  type ReportCatalogItem,
  type ThreadRow,
} from "@/lib/clinic";

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

export function AppointmentsClient() {
  const [rows, setRows] = useState<AppointmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [upcoming, setUpcoming] = useState<"all" | "true">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchAppointments({
        status: status === "all" ? undefined : status,
        upcoming: upcoming === "all" ? undefined : upcoming,
      });
      setRows(data.appointments);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [status, upcoming]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function change(id: string, next: string) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await setAppointmentStatus(id, next);
      await load();
      setNotice("Appointment updated.");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<AppointmentRow>[] = [
    { key: "client", header: "Client ID", render: (row) => row.clientReference },
    { key: "service", header: "Service", render: (row) => row.serviceName },
    { key: "professional", header: "Professional", render: (row) => row.professionalName ?? "-" },
    { key: "date", header: "Date", render: (row) => formatDateTime(row.scheduledAt) },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <label className="inline-flex items-center gap-2">
          <span className="sr-only">Change status for {row.clientReference}</span>
          <select
            value={row.status}
            onChange={(event) => change(row.id, event.target.value)}
            disabled={busy === row.id}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            {[
              "scheduled",
              "confirmed",
              "completed",
              "cancelled",
              "no_show",
              "rescheduled",
            ].map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </select>
        </label>
      ),
    },
    {
      key: "referral",
      header: "Referral ID",
      render: (row) => (
        <a
          href={`/portal/collaborative-clinic/referrals/${row.referralId}`}
          className="text-teal-700 hover:underline dark:text-teal-300"
        >
          {row.referralReference}
        </a>
      ),
    },
  ];

  return (
    <ClinicPage>
      <PageHeader
        title="Appointments"
        description="Appointments connected to your referrals. You can confirm, complete or cancel; session content is not shared."
      />

      <Panel>
        <FilterBar>
          <SegmentedControl
            ariaLabel="Filter by schedule"
            value={upcoming}
            onChange={setUpcoming}
            options={[
              { value: "all", label: "All" },
              { value: "true", label: "Upcoming" },
            ]}
          />
          <SegmentedControl
            ariaLabel="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "Any status" },
              { value: "scheduled", label: "Scheduled" },
              { value: "confirmed", label: "Confirmed" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
              { value: "no_show", label: "No show" },
            ]}
          />
        </FilterBar>

        {error ? <ErrorPanel message={error} onRetry={load} /> : null}
        {notice ? <Notice>{notice}</Notice> : null}
        {!error && !rows ? <LoadingBlock label="Loading appointments..." /> : null}

        {rows ? (
          <DataTable
            caption={`Referral appointments: ${rows.length}`}
            columns={columns}
            rows={rows}
            empty={
              <EmptyState
                title="No appointments"
                body="Appointments appear here once one is scheduled against a referral."
              />
            }
          />
        ) : null}
      </Panel>
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

/**
 * Partner messaging with Kindred Tap.
 *
 * Scoped to the organization, not to a person: a partnership conversation is
 * usually about a referral, an agreement or a commission rather than about one
 * practitioner. There is no route here that exposes a clinical conversation.
 */
export function MessagesClient() {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    Array<{ id: string; body: string; senderId: string; senderName: string | null; createdAt: string }> | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [topic, setTopic] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchThreads();
      setThreads(data.threads);
      if (data.threads.length && !openId) {
        const firstThread = data.threads[0];
        setOpenId(firstThread.id);
        const firstMessages = await fetchThread(firstThread.id);
        setMessages(firstMessages.messages);
      }
    } catch (err) {
      setError(messageFor(err));
    }
  }, [openId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const openThread = useCallback(async (id: string) => {
    setError(null);
    setOpenId(id);
    setMessages(null);
    try {
      const data = await fetchThread(id);
      setMessages(data.messages);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  async function send() {
    if (!openId || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(openId, draft);
      setDraft("");
      const data = await fetchThread(openId);
      setMessages(data.messages);
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSending(false);
    }
  }

  async function startThread() {
    if (!topic.trim()) return;
    setSending(true);
    setError(null);
    try {
      const { openThread: create } = await import("@/lib/clinic");
      const response = await create({ topic, body: "Conversation opened from the partner portal." });
      setTopic("");
      await load();
      await openThread(response.threadId);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <ClinicPage>
      <PageHeader
        title="Messages"
        description="Private coordination with the Kindred Tap partnership team."
      />

      {error ? <Notice tone="rose">{error}</Notice> : null}

      <div className="grid items-stretch gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <section className="card flex flex-col overflow-hidden p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-medium text-slate-900">Conversations</h2>
            <p className="mt-1 text-sm text-slate-500">
              {threads
                ? `${threads.length} ${threads.length === 1 ? "thread" : "threads"}`
                : "Your partner conversations"}
            </p>
          </div>

          {!threads ? (
            <div className="p-5">
              <LoadingBlock label="Loading conversations" />
            </div>
          ) : threads.length ? (
            <ul className="flex-1 space-y-1 p-2">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => void openThread(thread.id)}
                    aria-current={openId === thread.id ? "true" : undefined}
                    className={`w-full rounded-xl px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kindred-leaf ${
                      openId === thread.id
                        ? "bg-kindred-leaf-soft"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-900">
                        {thread.topic}
                      </span>
                      <time
                        dateTime={thread.lastMessageAt}
                        className="shrink-0 text-xs tabular-nums text-slate-500"
                      >
                        {formatDay(thread.lastMessageAt)}
                      </time>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="truncate text-sm text-slate-600">
                        {thread.lastMessage ?? "No messages yet"}
                      </span>
                      {thread.unread > 0 ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-kindred-leaf" aria-label="Unread" />
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex-1 p-5">
              <EmptyState title="No conversations yet" body="Start a thread with the partnership team." />
            </div>
          )}

          <div className="border-t border-slate-200 p-4">
            <Field label="Start a conversation">
              <input
                type="text"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                maxLength={160}
                placeholder="Topic"
                className={inputClass}
              />
            </Field>
            <button
              type="button"
              onClick={startThread}
              disabled={sending || !topic.trim()}
              className="btn-green mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kindred-leaf disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Opening conversation" : "Open conversation"}
            </button>
          </div>
        </section>

        <section className="card flex h-[min(68vh,680px)] min-h-[420px] flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 className="truncate text-base font-medium text-slate-900">
                {threads?.find((thread) => thread.id === openId)?.topic ?? "Conversation"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">Kindred Tap partnership team</p>
            </div>
            {messages ? (
              <span className="shrink-0 text-xs tabular-nums text-slate-500">
                {messages.length} messages
              </span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f6f1] p-4 sm:p-6">
            {!openId ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState title="No conversation selected" body="Choose a thread or start a conversation." />
              </div>
            ) : !messages ? (
              <LoadingBlock label="Loading messages" />
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState title="No messages yet" body="Write the first message in this conversation." />
              </div>
            ) : (
              <ul className="mx-auto max-w-3xl space-y-5">
                {messages.map((message) => (
                  <li key={message.id} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-medium text-kindred-leaf ring-1 ring-slate-200">
                      {(message.senderName ?? "K").trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 max-w-[85%]">
                      <p className="mb-1.5 px-1 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">
                          {message.senderName ?? "Partnership team"}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <time dateTime={message.createdAt} className="tabular-nums">
                          {formatDateTime(message.createdAt)}
                        </time>
                      </p>
                      <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800">
                        {message.body}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {openId ? (
            <div className="border-t border-slate-200 bg-white p-4 sm:p-5">
              <Field label="Reply">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={2}
                  maxLength={4000}
                  placeholder="Write a message"
                  className={textareaClass}
                />
              </Field>
              <button
                type="button"
                onClick={send}
                disabled={sending || !draft.trim()}
                className="btn-green mt-3 inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kindred-leaf disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Sending message" : "Send message"}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export function NotificationsClient() {
  const [rows, setRows] = useState<ClinicNotification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchNotifications();
      setRows(data.notifications);
      setUnread(data.unread);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function markAll() {
    try {
      await markAllNotificationsRead();
      await load();
    } catch (err) {
      setError(messageFor(err));
    }
  }

  async function markOne(id: string) {
    try {
      await markNotificationRead(id);
      await load();
    } catch (err) {
      setError(messageFor(err));
    }
  }

  const visible = (rows ?? []).filter((row) => (filter === "all" ? true : !row.readAt));

  return (
    <ClinicPage>
      <PageHeader
        title="Notifications"
        description="Referrals, commission, payouts and partnership updates."
        action={
          unread > 0 ? (
            <button type="button" onClick={markAll} className={secondaryActionClass}>
              Mark all read
            </button>
          ) : undefined
        }
      />

      <Panel>
        <FilterBar>
          <SegmentedControl
            ariaLabel="Filter notifications"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All (${rows?.length ?? 0})` },
              { value: "unread", label: `Unread (${unread})` },
            ]}
          />
        </FilterBar>

        {error ? <ErrorPanel message={error} onRetry={load} /> : null}
        {!error && !rows ? <LoadingBlock label="Loading notifications..." /> : null}

        {rows && visible.length === 0 ? (
          <EmptyState
            title={filter === "unread" ? "Nothing unread" : "No notifications"}
            body={
              filter === "unread"
                ? "You are up to date."
                : "Referral, commission and partnership updates will appear here."
            }
          />
        ) : null}

        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {visible.map((row) => (
            <li key={row.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {row.title}
                    {!row.readAt ? (
                      <span className="ml-2 inline-block h-2 w-2 rounded-full bg-teal-600" aria-label="Unread" />
                    ) : null}
                  </p>
                  {row.body ? (
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{row.body}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                    {titleCase(row.type)} &middot; {formatDateTime(row.createdAt)}
                  </p>
                </div>
                {!row.readAt ? (
                  <button
                    type="button"
                    onClick={() => markOne(row.id)}
                    className="shrink-0 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export function ReportsClient() {
  const [catalog, setCatalog] = useState<ReportCatalogItem[] | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; reportKey: string; rowCount: number; createdAt: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedReport | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchReports();
      setCatalog(data.reports);
      setHistory(data.history);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function run(key: string) {
    setBusy(key);
    setError(null);
    try {
      setResult(await generateReport(key));
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result.key}-${result.generatedAt.slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <ClinicPage>
      <PageHeader
        title="Reports"
        description="Reports over your own organization's data. Every report respects the same permissions as the rest of the portal."
      />

      <div className="space-y-6">
        {error ? <ErrorPanel message={error} onRetry={load} /> : null}

        <Panel title="Available reports">
          {!catalog ? (
            <LoadingBlock label="Loading reports..." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {catalog.map((report) => (
                <li
                  key={report.key}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {report.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {report.columns.length} columns
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => run(report.key)}
                    disabled={busy === report.key}
                    className="shrink-0 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                  >
                    {busy === report.key ? "Generating..." : "Generate"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {result ? (
          <Panel
            title={result.title}
            action={
              <button type="button" onClick={download} className={secondaryActionClass}>
                Download CSV
              </button>
            }
          >
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              {result.rowCount} row{result.rowCount === 1 ? "" : "s"} &middot; generated{" "}
              {formatDateTime(result.generatedAt)}
            </p>
            {result.rows.length === 0 ? (
              <EmptyState title="No data" body="This report has no rows for your organization." />
            ) : (
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                  <caption className="sr-only">{result.title}</caption>
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      {result.columns.map((column) => (
                        <th
                          key={column}
                          scope="col"
                          className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {result.rows.slice(0, 50).map((row, index) => (
                      <tr key={index}>
                        {result.columns.map((column) => (
                          <td
                            key={column}
                            className="px-3 py-2.5 text-slate-700 dark:text-slate-200"
                          >
                            {row[column] === null || row[column] === undefined
                              ? "-"
                              : String(row[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.rows.length > 50 ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Showing the first 50 of {result.rows.length} rows. Download the CSV for the full
                    set.
                  </p>
                ) : null}
              </div>
            )}
          </Panel>
        ) : null}

        {history.length > 0 ? (
          <Panel title="Generated reports">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    {titleCase(entry.reportKey)}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {entry.rowCount} rows &middot; {formatDateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function SettingsClient() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchSettings>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchSettings());
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <ClinicPage>
      <PageHeader
        title="Settings"
        description="Your organization's permissions, referral destinations and partnership status."
      />

      {error ? <ErrorPanel message={error} onRetry={load} /> : null}
      {!error && !data ? <LoadingBlock label="Loading settings..." /> : null}

      {data ? (
        <div className="space-y-6">
          <Panel title="Organization">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              <DataRow label="Organization">{data.organization.name}</DataRow>
              <DataRow label="Your role">{titleCase(data.organization.memberRole)}</DataRow>
              <DataRow label="Partnership status">
                <StatusPill status={data.organization.status} />
              </DataRow>
              <DataRow label="Kindred Tap contact">
                <Link href="/portal/collaborative-clinic/messages"
                  className="text-teal-700 hover:underline dark:text-teal-300"
                >
                  Message {data.counterpart.name}
                </Link>
              </DataRow>
            </dl>
          </Panel>

          <Panel title="Your permissions">
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Permissions are set by Kindred Tap. Hiding a page is a convenience; the API checks
              every permission on every request regardless.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.permissions.map((entry) => (
                <li key={entry.permission} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-600 dark:text-slate-300">{entry.label}</span>
                  <StatusPill status={entry.held ? "held" : "not held"} tone={entry.held ? "emerald" : "slate"} />
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Referral destinations">
            {data.referralDestinations.length === 0 ? (
              <EmptyState
                title="No destinations"
                body="Organizations you can refer into will be listed here."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.referralDestinations.map((destination) => (
                  <li key={destination.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm text-slate-700 dark:text-slate-200">{destination.name}</span>
                    <StatusPill status={destination.partnershipStatus ?? destination.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Currencies">
            <div className="flex flex-wrap gap-2">
              {data.currencies.map((currency) => (
                <Badge key={currency} tone="slate">
                  {currency}
                </Badge>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Organization profile                                                */
/* ------------------------------------------------------------------ */

export function OrganizationClient() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchOrganization>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchOrganization());
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const profile = (data?.profile ?? null) as Record<string, unknown> | null;
  const list = (value: unknown) => (Array.isArray(value) ? (value as string[]) : []);

  return (
    <ClinicPage>
      <PageHeader
        title="Organization Profile"
        description="Your organization's details as recorded for the Kindred Tap partnership."
      />

      {error ? <ErrorPanel message={error} onRetry={load} /> : null}
      {!error && !data ? <LoadingBlock label="Loading organization..." /> : null}

      {data ? (
        <div className="space-y-6">
          <Panel title="Organization">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              <DataRow label="Organization Name">{data.organization.name}</DataRow>
              <DataRow label="Organization Type">
                {titleCase(data.organization.organizationType ?? "other")}
              </DataRow>
              <DataRow label="Website">
                {data.organization.website ? (
                  <a
                    href={data.organization.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-700 hover:underline dark:text-teal-300"
                  >
                    {data.organization.website}
                  </a>
                ) : (
                  "-"
                )}
              </DataRow>
              <DataRow label="Address">
                {[data.organization.city, data.organization.country].filter(Boolean).join(", ") || "-"}
              </DataRow>
              <DataRow label="Registration Number">
                {data.organization.registrationNumber ?? "-"}
              </DataRow>
              <DataRow label="Partnership Status">
                <StatusPill status={data.partnershipStatus} />
              </DataRow>
            </dl>
          </Panel>

          <Panel title="Primary Contact">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              <DataRow label="Name">{data.organization.contactName ?? "-"}</DataRow>
              <DataRow label="Email">{data.organization.contactEmail ?? "-"}</DataRow>
              <DataRow label="Phone">{data.organization.contactPhone ?? "-"}</DataRow>
            </dl>
          </Panel>

          <Panel title="About">
            <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">
              {(profile?.bio as string) ?? "No description recorded."}
            </p>
          </Panel>

          <Panel title="Services and Capabilities">
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Services offered
                </dt>
                <dd className="mt-2 flex flex-wrap gap-1.5">
                  {list(profile?.servicesOffered).length ? (
                    list(profile?.servicesOffered).map((service) => (
                      <Badge key={service} tone="teal">
                        {service}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500 dark:text-slate-400">None recorded</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Specialisms
                </dt>
                <dd className="mt-2 flex flex-wrap gap-1.5">
                  {list(profile?.clinicSpecialisms).length ? (
                    list(profile?.clinicSpecialisms).map((item) => (
                      <Badge key={item} tone="slate">
                        {item}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500 dark:text-slate-400">None recorded</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Referral types accepted
                </dt>
                <dd className="mt-2 flex flex-wrap gap-1.5">
                  {list(profile?.referralTypes).length ? (
                    list(profile?.referralTypes).map((item) => (
                      <Badge key={item} tone="slate">
                        {item}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500 dark:text-slate-400">None recorded</span>
                  )}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Team Members">
            {data.members.length === 0 ? (
              <EmptyState title="No members" body="No members are recorded for your organization." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.members.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {member.fullName ?? member.email}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {member.email}
                      </p>
                    </div>
                    <Badge tone="slate">{titleCase(member.memberRole)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Notice>
            Organization details are maintained through your Kindred Tap account contact. Changes to
            a legal entity or registration number should go through the partnership team.
          </Notice>
        </div>
      ) : null}
    </ClinicPage>
  );
}
