"use client";

import { useCallback, useEffect, useState } from "react";
import { AdvisorPage } from "@/components/advisor/shell";
import { Alert, Button, EmptyState, LoadingState } from "@/components/ui";
import { Badge, Field, PageHeader, Panel, StatTile, inputClass } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  actOnAppointment,
  fetchAppointments,
  formatDateTime,
  type AdvisorAppointment,
} from "@/lib/advisor";

function statusTone(status: string): "teal" | "emerald" | "rose" | "slate" {
  if (status === "scheduled") return "teal";
  if (status === "completed") return "emerald";
  if (status === "cancelled") return "rose";
  return "slate";
}

function statusLabel(status: string): string {
  if (status === "scheduled") return "Scheduled";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function modeLabel(mode: string): string {
  if (mode === "in_person") return "In person";
  if (mode === "online") return "Online";
  if (mode === "phone") return "Phone";
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function AppointmentsClient() {
  const [appointments, setAppointments] = useState<AdvisorAppointment[] | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "danger">("success");
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [newTime, setNewTime] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetchAppointments();
      setAppointments(response.appointments);
      setRange(response.range);
      setError(null);
    } catch (err) {
      setAppointments(null);
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function cancel(appointment: AdvisorAppointment) {
    if (!window.confirm(`Cancel ${appointment.clientName} with ${appointment.therapistName}?`)) {
      return;
    }
    setBusy(appointment.id);
    setNotice(null);
    try {
      await actOnAppointment(appointment.id, { action: "cancel", reason: "Cancelled by advisor" });
      setNotice("Appointment cancelled; both parties are notified.");
      setNoticeTone("success");
      await load();
    } catch (err) {
      setNotice(messageFor(err));
      setNoticeTone("danger");
    } finally {
      setBusy(null);
    }
  }

  async function reschedule(appointment: AdvisorAppointment) {
    if (!newTime) return;
    setBusy(appointment.id);
    setNotice(null);
    try {
      await actOnAppointment(appointment.id, {
        action: "reschedule",
        scheduledAt: new Date(newTime).toISOString(),
        reason: "Rescheduled by advisor",
      });
      setRescheduling(null);
      setNewTime("");
      setNotice("Appointment moved; both parties are notified.");
      setNoticeTone("success");
      await load();
    } catch (err) {
      setNotice(messageFor(err));
      setNoticeTone("danger");
    } finally {
      setBusy(null);
    }
  }

  const rows = appointments ?? [];
  const scheduled = rows.filter((row) => row.status === "scheduled");
  const completed = rows.filter((row) => row.status === "completed");
  const cancelled = rows.filter((row) => row.status === "cancelled");

  const byDay = new Map<string, AdvisorAppointment[]>();
  for (const row of rows) {
    const key = dayKey(row.scheduledAt);
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }
  const days = [...byDay.keys()].sort();

  return (
    <AdvisorPage>
      <PageHeader
        title="Appointments"
        description={
          range
            ? `Every session across the clinic from ${formatDateTime(range.from)} to ${formatDateTime(range.to)}.`
            : "Every session across the clinic."
        }
      />

      {notice ? (
        <div className="mb-5">
          <Alert tone={noticeTone}>{notice}</Alert>
        </div>
      ) : null}

      {appointments ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label="Total" value={rows.length} />
          <StatTile label="Scheduled" value={scheduled.length} />
          <StatTile label="Completed" value={completed.length} />
          <StatTile label="Cancelled" value={cancelled.length} />
        </div>
      ) : null}

      {error ? (
        <EmptyState
          title="We could not load your appointments"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      ) : !appointments ? (
        <LoadingState label="Loading appointments" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No appointments in range"
          description="Booked sessions appear here as clients confirm them with therapists."
        />
      ) : (
        <div className="space-y-6">
          {days.map((key) => (
            <Panel
              key={key}
              title={new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            >
              <ul className="space-y-3">
                {(byDay.get(key) ?? []).map((row) => (
                  <li
                    key={row.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            <time dateTime={row.scheduledAt}>{formatDateTime(row.scheduledAt)}</time>
                          </p>
                          <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                          <Badge tone="slate">{modeLabel(row.mode)}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {row.clientName} with {row.therapistName} · {row.durationMinutes} min
                          {row.cancelReason ? ` · ${row.cancelReason}` : ""}
                        </p>
                      </div>
                      {row.status === "scheduled" ? (
                        <div className="flex shrink-0 gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={busy === row.id}
                            aria-expanded={rescheduling === row.id}
                            aria-controls={`reschedule-${row.id}`}
                            onClick={() => {
                              setRescheduling(rescheduling === row.id ? null : row.id);
                              setNewTime("");
                            }}
                          >
                            Reschedule
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={busy === row.id}
                            onClick={() => void cancel(row)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {rescheduling === row.id ? (
                      <div
                        id={`reschedule-${row.id}`}
                        className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-700"
                      >
                        <Field label="New date and time">
                          <input
                            type="datetime-local"
                            aria-label="New date and time"
                            className={inputClass}
                            value={newTime}
                            onChange={(event) => setNewTime(event.target.value)}
                          />
                        </Field>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busy === row.id}
                          disabled={!newTime}
                          onClick={() => void reschedule(row)}
                        >
                          Confirm new time
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </AdvisorPage>
  );
}
