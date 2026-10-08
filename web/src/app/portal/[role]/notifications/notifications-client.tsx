"use client";

import { useCallback, useEffect, useState } from "react";
import { TherapistPage } from "@/components/therapist/shell";
import { AdvisorPage } from "@/components/advisor/shell";
import { SupervisorPage } from "@/components/supervisor/shell";
import { SegmentedControl } from "@/components/therapist/ui";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LinkButton,
  LoadingState,
  PageTitle,
  type Tone,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import {
  fetchNotifications as fetchTherapistNotifications,
  formatDateTime,
  markAllNotificationsRead as markAllTherapistRead,
  markNotificationRead as markTherapistRead,
  type NotificationRow,
} from "@/lib/therapist";
import {
  fetchNotifications as fetchAdvisorNotifications,
  markAllNotificationsRead as markAllAdvisorRead,
  markNotificationRead as markAdvisorRead,
  type AdvisorNotification,
} from "@/lib/advisor";
import {
  fetchNotifications as fetchSupervisorNotifications,
  markAllNotificationsRead as markAllSupervisorRead,
  markNotificationRead as markSupervisorRead,
  type SupervisorNotification,
} from "@/lib/supervisor";

const TYPE_LABEL: Record<string, string> = {
  appointment_request: "Appointment request",
  session_updated: "Session updated",
  new_message: "New message",
  assessment_completed: "Assessment completed",
  session_reminder: "Session reminder",
  treatment_plan_reminder: "Plan reminder",
  homework_completed: "Homework completed",
  safety_escalation: "Safety escalation",
  ethics_due: "Ethics acknowledgment due",
  supervision_due: "Supervision due",
  standard_review_due: "Standard review due",
  clinic_announcement: "Clinic announcement",
  matching_decision: "Matching decision",
  report_ready: "Report generated",
};

const TYPE_TONE: Record<string, Tone> = {
  appointment_request: "warning",
  session_updated: "accent",
  new_message: "neutral",
  assessment_completed: "info",
  session_reminder: "warning",
  treatment_plan_reminder: "warning",
  homework_completed: "success",
  safety_escalation: "danger",
  ethics_due: "warning",
  supervision_due: "warning",
  standard_review_due: "warning",
  clinic_announcement: "info",
  matching_decision: "accent",
  report_ready: "success",
};

type AnyNotification = NotificationRow | AdvisorNotification | SupervisorNotification;
type Filter = "all" | "unread";
type Client = "advisor" | "supervisor" | "therapist";

export default function NotificationsClient({ role }: { role: string }) {
  const client: Client =
    role === "clinical_advisor" ? "advisor" : role === "clinical_supervisor" ? "supervisor" : "therapist";
  const [rows, setRows] = useState<AnyNotification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("unread");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response =
        client === "advisor"
          ? await fetchAdvisorNotifications()
          : client === "supervisor"
            ? await fetchSupervisorNotifications()
            : await fetchTherapistNotifications();
      setRows(response.notifications);
      setUnread(response.unread);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [client]);

  const reload = useCallback(() => {
    setRows(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function markOne(id: string) {
    setBusy(id);
    setNotice(null);
    try {
      if (client === "advisor") await markAdvisorRead(id);
      else if (client === "supervisor") await markSupervisorRead(id);
      else await markTherapistRead(id);
      setRows((prev) =>
        (prev ?? []).map((row) => (row.id === id ? { ...row, readAt: new Date().toISOString() } : row))
      );
      setUnread((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setNotice(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  async function markAll() {
    setBusy("all");
    setNotice(null);
    try {
      if (client === "advisor") await markAllAdvisorRead();
      else if (client === "supervisor") await markAllSupervisorRead();
      else await markAllTherapistRead();
      const now = new Date().toISOString();
      setRows((prev) => (prev ?? []).map((row) => ({ ...row, readAt: row.readAt ?? now })));
      setUnread(0);
    } catch (err) {
      setNotice(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  const visible = (rows ?? []).filter((row) => (filter === "unread" ? !row.readAt : true));
  const Shell = client === "advisor" ? AdvisorPage : client === "supervisor" ? SupervisorPage : TherapistPage;

  return (
    <Shell>
      <PageTitle
        description="Safety escalations, supervision and review deadlines, appointment requests, new messages and completed assessments - each one links to the thing it is about."
        action={
          <Button
            variant="secondary"
            disabled={busy !== null || unread === 0}
            loading={busy === "all"}
            onClick={() => void markAll()}
          >
            {unread > 0 ? `Mark all read (${unread})` : "Mark all read"}
          </Button>
        }
      >
        Notifications
      </PageTitle>

      <div className="mb-5">
        <SegmentedControl
          ariaLabel="Filter notifications"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "unread", label: unread > 0 ? `Unread (${unread})` : "Unread" },
            { value: "all", label: (rows?.length ?? 0) > 0 ? `All (${rows?.length ?? 0})` : "All" },
          ]}
        />
      </div>

      {notice ? (
        <div className="mb-5">
          <Alert tone="danger" title="We could not update that notification">
            {notice}
          </Alert>
        </div>
      ) : null}

      {error && rows === null ? (
        <EmptyState
          title="We could not load your notifications"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : rows === null ? (
        <LoadingState label="Loading notifications" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={filter === "unread" ? "You're all caught up" : "No notifications"}
          description="Things that need your attention show up here the moment they happen."
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => {
            const isUnread = !row.readAt;
            return (
              <li key={row.id}>
                <div
                  className={`flex items-start gap-3 rounded-2xl border p-4 shadow-xs transition ${
                    isUnread
                      ? "border-teal-300/70 bg-white dark:border-teal-700/60 dark:bg-slate-900"
                      : "border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/70"
                  }`}
                >
                  <span className="mt-1.5" aria-hidden="true">
                    <span
                      className={`block h-2.5 w-2.5 rounded-full ${
                        isUnread ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`text-sm ${
                          isUnread
                            ? "font-semibold text-slate-900 dark:text-white"
                            : "font-medium text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {row.title}
                      </p>
                      <Badge tone={TYPE_TONE[row.type] ?? "neutral"}>
                        {TYPE_LABEL[row.type] ?? row.type.replace(/_/g, " ")}
                      </Badge>
                      {isUnread ? <span className="sr-only">Unread</span> : null}
                    </div>
                    {row.body ? (
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {row.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                      <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {row.link ? (
                      <LinkButton href={row.link} size="sm">
                        Open
                      </LinkButton>
                    ) : null}
                    {isUnread ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={busy === row.id}
                        disabled={busy !== null}
                        onClick={() => void markOne(row.id)}
                      >
                        {busy === row.id ? "Marking…" : "Mark read"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
