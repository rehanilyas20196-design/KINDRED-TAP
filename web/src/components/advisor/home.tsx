"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EthicsBadge } from "@/components/ethics-badge";
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
import { Field, Panel, StatTile, inputClass, textareaClass } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import type { PortalMeta } from "@/lib/portals";
import type { AuthUser } from "@/lib/api";
import {
  createAnnouncement,
  fetchAnnouncements,
  fetchDashboard,
  formatDateTime,
  formatTime,
  type AdvisorDashboard,
  type AnnouncementRow,
} from "@/lib/advisor";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const SEVERITY_TONE: Record<string, Tone> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

const APPOINTMENT_TONE: Record<string, Tone> = {
  scheduled: "accent",
  confirmed: "accent",
  completed: "success",
  cancelled: "danger",
  no_show: "warning",
};

const ANNOUNCEMENT_TONE: Record<string, Tone> = {
  published: "accent",
  draft: "neutral",
  scheduled: "info",
};

const AUDIENCE_OPTIONS = [
  { value: "therapist", label: "Therapists" },
  { value: "supporter", label: "Supporters" },
  { value: "clinical_supervisor", label: "Clinical supervisors" },
  { value: "collaborative_clinic", label: "Partner clinics" },
  { value: "all", label: "Everyone" },
];

const EMPTY_OVERVIEW = {
  activeTherapists: 0,
  activeClients: 0,
  openEscalations: 0,
  pendingSupervision: 0,
  standardsReviewsDue: 0,
  ethicsItems: 0,
};

const EMPTY_OPERATIONS = {
  todaySessions: 0,
  pendingMatching: 0,
  pendingAssessments: 0,
  activePlans: 0,
};

interface OverviewTile {
  label: string;
  value: number;
  href: string;
  hint?: string;
}

export function AdvisorHome({ user, portal }: { user: AuthUser; portal: PortalMeta }) {
  const [data, setData] = useState<AdvisorDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[] | null>(null);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<string[]>(["therapist"]);
  const [publishNow, setPublishNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(
    null
  );

  const load = useCallback(async () => {
    try {
      setData(await fetchDashboard());
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  const loadAnnouncements = useCallback(async () => {
    try {
      const response = await fetchAnnouncements();
      setAnnouncements(response.announcements ?? []);
      setAnnouncementsError(null);
    } catch (err) {
      setAnnouncementsError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await Promise.all([load(), loadAnnouncements()]);
    })();
  }, [load, loadAnnouncements, reloadKey]);

  function reload() {
    setData(null);
    setError(null);
    setAnnouncements(null);
    setAnnouncementsError(null);
    setReloadKey((value) => value + 1);
  }

  function retryAnnouncements() {
    setAnnouncements(null);
    setAnnouncementsError(null);
    void loadAnnouncements();
  }

  function toggleAudience(value: string) {
    setAudience((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await createAnnouncement({
        title: title.trim(),
        body: body.trim(),
        audience: audience.length ? audience : ["all"],
        status: publishNow ? "published" : "draft",
      });
      setTitle("");
      setBody("");
      setNotice({
        tone: "success",
        message: publishNow
          ? "Announcement published to the selected audience."
          : "Draft saved.",
      });
      const refreshed = await fetchAnnouncements();
      setAnnouncementsError(null);
      setAnnouncements(refreshed.announcements ?? []);
    } catch (err) {
      setNotice({ tone: "danger", message: messageFor(err) });
    } finally {
      setBusy(false);
    }
  }

  const name = user.fullName ?? user.email;
  // Defaults only exist so the tiles type-check before the fetch lands; the
  // grid only renders once `data` is set.
  const overview = data?.clinicalOverview ?? EMPTY_OVERVIEW;
  const operations = data?.operations ?? EMPTY_OPERATIONS;

  const overviewTiles: OverviewTile[] = [
    {
      label: "Active therapists",
      value: overview.activeTherapists,
      href: "/portal/clinical_advisor/therapists",
    },
    {
      label: "Open escalations",
      value: overview.openEscalations,
      href: "/portal/clinical_advisor/safety",
      hint: "Needs triage",
    },
    {
      label: "Supervision due",
      value: overview.pendingSupervision,
      href: "/portal/clinical_advisor/supervision",
    },
    {
      label: "Standards reviews due",
      value: overview.standardsReviewsDue,
      href: "/portal/clinical_advisor/clinical-standards",
    },
    { label: "Ethics items", value: overview.ethicsItems, href: "/portal/clinical_advisor/ethics" },
    {
      label: "Active clients",
      value: overview.activeClients,
      href: "/portal/clinical_advisor/clients",
    },
  ].filter((tile) => tile.value > 0);

  const operationTiles: OverviewTile[] = [
    {
      label: "Sessions today",
      value: operations.todaySessions,
      href: "/portal/clinical_advisor/appointments",
    },
    { label: "Matching queue", value: operations.pendingMatching, href: "/portal/clinical_advisor/matching" },
    {
      label: "Assessments to review",
      value: operations.pendingAssessments,
      href: "/portal/clinical_advisor/assessments",
    },
    {
      label: "Active treatment plans",
      value: operations.activePlans,
      href: "/portal/clinical_advisor/outcomes",
    },
  ].filter((tile) => tile.value > 0);

  return (
    <>
      <PageTitle
        eyebrow="Clinical oversight"
        description={portal.tagline}
        action={
          <LinkButton href="/portal/clinical_advisor/safety" variant="secondary" size="sm">
            Safety queue
          </LinkButton>
        }
      >
        {`${greeting()}, ${name.split(" ")[0]}`}
      </PageTitle>

      <div className="mb-6">
        <EthicsBadge roleTitle="Clinical Advisor" />
      </div>

      {error && data === null ? (
        <div className="mb-6">
          <EmptyState
            title="We could not load your dashboard"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        </div>
      ) : data === null ? (
        <LoadingState label="Loading clinical oversight" />
      ) : (
        <div className="space-y-6">
          {overviewTiles.length ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {overviewTiles.map((tile) => (
                <StatTile
                  key={tile.label}
                  label={tile.label}
                  value={tile.value}
                  hint={tile.hint}
                  href={tile.href}
                />
              ))}
            </div>
          ) : null}

          {operationTiles.length ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {operationTiles.map((tile) => (
                <StatTile
                  key={tile.label}
                  label={tile.label}
                  value={tile.value}
                  href={tile.href}
                />
              ))}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
              <Panel
                title="Alerts"
                action={
                  <LinkButton
                    href="/portal/clinical_advisor/safety"
                    variant="ghost"
                    size="sm"
                  >
                    All escalations
                  </LinkButton>
                }
              >
                {data.alerts.length === 0 ? (
                  <EmptyState
                    title="No open alerts"
                    description="Safety escalations, overdue supervision and review deadlines surface here the moment they appear."
                  />
                ) : (
                  <ul className="space-y-2">
                    {data.alerts.slice(0, 6).map((alert) => (
                      <li key={alert.id}>
                        <Link
                          href={alert.link || "/portal/clinical_advisor/safety"}
                          className="card card-interactive flex items-start gap-3 p-3.5"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {alert.title}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                              {alert.detail}
                            </span>
                          </span>
                          <Badge tone={SEVERITY_TONE[alert.severity] ?? "neutral"} dot>
                            {humanize(alert.severity)}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Today's sessions"
                action={
                  <LinkButton
                    href="/portal/clinical_advisor/appointments"
                    variant="ghost"
                    size="sm"
                  >
                    Appointments
                  </LinkButton>
                }
              >
                {data.todayAppointments.length === 0 ? (
                  <EmptyState
                    title="Nothing scheduled today"
                    description="Every booked session across the clinic appears here while it is running."
                  />
                ) : (
                  <ul className="space-y-2">
                    {data.todayAppointments.map((appointment) => (
                      <li
                        key={appointment.id}
                        className="card flex items-center gap-3 p-3.5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {appointment.clientName} · {appointment.therapistName}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                            <time dateTime={appointment.scheduledAt}>
                              {formatTime(appointment.scheduledAt)}
                            </time>
                            {" · "}
                            {appointment.durationMinutes} min · {appointment.mode}
                          </span>
                        </span>
                        <Badge tone={APPOINTMENT_TONE[appointment.status] ?? "neutral"} dot>
                          {humanize(appointment.status)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="space-y-6 lg:col-span-2">
              <Panel title="Publish an announcement">
                <form onSubmit={publish} className="space-y-4">
                  <Field label="Title">
                    <input
                      id="announcement-title"
                      className={inputClass}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Supervision schedule update"
                      required
                      minLength={3}
                    />
                  </Field>
                  <Field label="Message">
                    <textarea
                      id="announcement-body"
                      className={textareaClass}
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder="What should the team know?"
                      required
                      minLength={3}
                    />
                  </Field>
                  <div>
                    <p id="announcement-audience" className="field-label">
                      Audience
                    </p>
                    <div
                      role="group"
                      aria-labelledby="announcement-audience"
                      className="flex flex-wrap gap-2"
                    >
                      {AUDIENCE_OPTIONS.map((option) => {
                        const selected = audience.includes(option.value);
                        return (
                          <Button
                            key={option.value}
                            size="sm"
                            variant={selected ? "primary" : "secondary"}
                            aria-pressed={selected}
                            onClick={() => toggleAudience(option.value)}
                          >
                            {option.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={publishNow}
                      onChange={(event) => setPublishNow(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    Publish immediately (uncheck to keep as a draft)
                  </label>
                  {notice ? <Alert tone={notice.tone}>{notice.message}</Alert> : null}
                  <Button type="submit" loading={busy}>
                    {publishNow ? "Publish announcement" : "Save draft"}
                  </Button>
                </form>
              </Panel>

              <Panel
                title="Recent announcements"
                action={
                  data.unreadNotifications > 0 ? (
                    <LinkButton
                      href="/portal/clinical_advisor/notifications"
                      variant="ghost"
                      size="sm"
                    >
                      {data.unreadNotifications} unread
                    </LinkButton>
                  ) : undefined
                }
              >
                {announcementsError && announcements === null ? (
                  <EmptyState
                    title="We could not load announcements"
                    description={announcementsError}
                    action={
                      <Button variant="secondary" onClick={retryAnnouncements}>
                        Try again
                      </Button>
                    }
                  />
                ) : announcements === null ? (
                  <LoadingState label="Loading announcements" />
                ) : announcements.length === 0 ? (
                  <EmptyState
                    title="No announcements yet"
                    description="Publishing here notifies the selected audience and records itself in the audit log."
                  />
                ) : (
                  <ul className="space-y-3">
                    {announcements.slice(0, 5).map((item) => (
                      <li
                        key={item.id}
                        className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-800"
                      >
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {item.title}
                          </p>
                          <Badge tone={ANNOUNCEMENT_TONE[item.status] ?? "neutral"}>
                            {humanize(item.status)}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {item.body}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                          <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                          {item.createdByName ? ` · ${item.createdByName}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
