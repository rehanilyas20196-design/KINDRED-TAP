"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TherapistPage } from "@/components/therapist/shell";
import {
  Badge,
  ErrorPanel,
  Field,
  LoadingBlock,
  PageHeader,
  Panel,
  inputClass,
  primaryActionClass,
} from "@/components/therapist/ui";
import { apiFetch, messageFor } from "@/lib/api";
import { WEEKDAYS, fetchSettings, saveSettings, type TherapistSettings } from "@/lib/therapist";

const PREFS: { key: keyof TherapistSettings["profile"]["notificationPrefs"]; label: string; hint: string }[] = [
  { key: "appointments", label: "Appointments", hint: "New bookings, confirmations, changes and cancellations." },
  { key: "messages", label: "Messages", hint: "A client writes to you." },
  { key: "assessments", label: "Assessments", hint: "A client completes an assessment." },
  { key: "reminders", label: "Reminders", hint: "Upcoming sessions and plan follow-ups." },
];

export default function SettingsClient() {
  const [settings, setSettings] = useState<TherapistSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [hours, setHours] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("");
  const [accepting, setAccepting] = useState(true);
  const [prefs, setPrefs] = useState<TherapistSettings["profile"]["notificationPrefs"]>({
    appointments: true,
    messages: true,
    assessments: true,
    reminders: true,
  });

  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((response) => {
        if (cancelled) return;
        setSettings(response);
        setFullName(response.user.fullName ?? "");
        setBio(response.profile.bio ?? "");
        setDays(response.profile.availabilityDays ?? []);
        setHours(response.profile.availabilityHours ?? "");
        setHoursPerWeek(
          response.profile.availabilityHoursPerWeek === null
            ? ""
            : String(response.profile.availabilityHoursPerWeek)
        );
        setAccepting(response.profile.acceptingNewCases);
        setPrefs(response.profile.notificationPrefs);
      })
      .catch((err) => {
        if (!cancelled) setError(messageFor(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await saveSettings({
        fullName: fullName.trim() || undefined,
        bio,
        availabilityDays: days,
        availabilityHours: hours || null,
        availabilityHoursPerWeek: hoursPerWeek === "" ? null : Number(hoursPerWeek),
        acceptingNewCases: accepting,
        notificationPrefs: prefs,
      });
      setNotice(response.message || "Settings saved.");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordNotice(null);

    if (passwords.next.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordBusy(true);
    try {
      await apiFetch<{ ok: boolean }>("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword: passwords.current, newPassword: passwords.next },
      });
      setPasswordNotice("Password updated. Other sessions were signed out.");
      setPasswords({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPasswordError(messageFor(err));
    } finally {
      setPasswordBusy(false);
    }
  }

  if (error && !settings) return <ErrorPanel message={error} />;
  if (!settings) return <LoadingBlock label="Loading settings..." />;

  function toggleDay(day: string) {
    setDays((prev) => {
      const next = prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day];
      return WEEKDAYS.filter((item) => next.includes(item));
    });
  }

  return (
    <TherapistPage>
      <PageHeader
        title="Settings"
        description="Your availability, what you get notified about, and your account password."
        action={
          <Link
            href="/portal/therapist/profile"
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white"
          >
            Full profile
          </Link>
        }
      />

      {error ? <div className="mb-5"><ErrorPanel message={error} /></div> : null}
      {notice ? (
        <p className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Account">
            <dl className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
              <div className="flex justify-between gap-4 py-2">
                <dt className="shrink-0 text-xs text-slate-500">Email</dt>
                <dd className="min-w-0 break-words text-sm text-slate-700 dark:text-slate-200">
                  {settings.user.email}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="shrink-0 text-xs text-slate-500">Registration</dt>
                <dd className="min-w-0 break-words text-sm text-slate-700 dark:text-slate-200">
                  {settings.profile.registrationBody ?? "—"}
                  {settings.profile.registrationNumber
                    ? ` · ${settings.profile.registrationNumber}`
                    : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="shrink-0 text-xs text-slate-500">Verified</dt>
                <dd className="min-w-0">
                  <Badge tone={settings.profile.registrationVerified ? "emerald" : "amber"}>
                    {settings.profile.registrationVerified ? "Verified" : "Not verified"}
                  </Badge>
                </dd>
              </div>
            </dl>

            <form onSubmit={submit} className="space-y-4">
              <Field label="Display name">
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className={inputClass}
                  maxLength={160}
                />
              </Field>

              <Field label="Short bio" hint="Shown on your public profile in the matching directory.">
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  className={`${inputClass} min-h-28 resize-y`}
                  maxLength={2000}
                />
              </Field>

              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Availability days
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const active = days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleDay(day)}
                        className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                          active
                            ? "bg-teal-700 text-white"
                            : "border border-slate-200 text-slate-500 hover:border-teal-400 hover:text-teal-700 dark:border-slate-700 dark:text-slate-400"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Hours shown to clients" hint="e.g. Mon-Fri 09:00-17:00">
                  <input
                    type="text"
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                    className={inputClass}
                    maxLength={120}
                  />
                </Field>
                <Field label="Hours per week" hint="Capacity you accept for sessions">
                  <input
                    type="number"
                    min={0}
                    max={80}
                    value={hoursPerWeek}
                    onChange={(event) => setHoursPerWeek(event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>

              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                <input
                  type="checkbox"
                  checked={accepting}
                  onChange={(event) => setAccepting(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-teal-700"
                />
                <span className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                  <span className="block font-semibold text-slate-800 dark:text-slate-100">
                    Accepting new cases
                  </span>
                  When off, you keep your current caseload but stop appearing in new matches.
                </span>
              </label>

              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Notify me about
                </p>
                <div className="mt-2 space-y-2">
                  {PREFS.map((pref) => (
                    <label
                      key={pref.key}
                      className="flex items-start gap-3 rounded-xl border border-slate-100 px-3.5 py-2.5 dark:border-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={prefs[pref.key]}
                        onChange={(event) =>
                          setPrefs({ ...prefs, [pref.key]: event.target.checked })
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-teal-700"
                      />
                      <span className="text-xs leading-5">
                        <span className="block font-medium text-slate-700 dark:text-slate-200">
                          {pref.label}
                        </span>
                        <span className="text-slate-500 dark:text-slate-500">{pref.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={busy} className={primaryActionClass}>
                {busy ? "Saving..." : "Save settings"}
              </button>
            </form>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Change password">
            {passwordNotice ? (
              <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                {passwordNotice}
              </p>
            ) : null}
            {passwordError ? (
              <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {passwordError}
              </p>
            ) : null}
            <form onSubmit={changePassword} className="space-y-3">
              <Field label="Current password">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passwords.current}
                  onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="New password" hint="At least 8 characters.">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.next}
                  onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Confirm new password">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirm}
                  onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
                  className={inputClass}
                  required
                />
              </Field>
              <button
                type="submit"
                disabled={passwordBusy}
                className={`${primaryActionClass} w-full`}
              >
                {passwordBusy ? "Updating..." : "Update password"}
              </button>
            </form>
          </Panel>

          <Panel title="Privacy">
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Session notes stay with you unless you publish the client summary. Client data never
              leaves your caseload: every therapist endpoint is scoped to your account and rejects
              sessions belonging to someone else.
            </p>
          </Panel>
        </div>
      </div>
    </TherapistPage>
  );
}
