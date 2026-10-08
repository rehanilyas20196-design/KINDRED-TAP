"use client";

import { useCallback, useEffect, useState } from "react";
import { ClinicPage } from "@/components/clinic/shell";
import {
  DataRow,
  EmptyState,
  ErrorPanel,
  LoadingBlock,
  Notice,
  PageHeader,
  Panel,
  StatusPill,
  inputClass,
  primaryActionClass,
  secondaryActionClass,
  textareaClass,
} from "@/components/clinic/ui";
import { messageFor, toFieldErrors } from "@/lib/api";
import {
  actOnReferral,
  fetchReferral,
  formatDateTime,
  formatMoney,
  priorityTone,
  titleCase,
  type ReferralAction,
  type ReferralDetail,
} from "@/lib/clinic";

/**
 * One referral, with the actions the API says this organization may take.
 *
 * The button set is not hardcoded from a guess about who is reading: the detail
 * response carries `allowedActions`, derived server side from which side of the
 * referral this organization sits on. A sending clinic sees no accept button
 * because the API would refuse it anyway - the UI is just honest about it.
 */
export function ReferralDetailClient({ referralId }: { referralId: string }) {
  const [data, setData] = useState<ReferralDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Action draft state, kept local so a half-written note survives a re-render.
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [nextStatus, setNextStatus] = useState("");

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchReferral(referralId));
    } catch (err) {
      setError(messageFor(err));
    }
  }, [referralId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(action: ReferralAction, payload: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    setFieldError(null);
    setNotice(null);
    try {
      await actOnReferral(referralId, { action, ...payload });
      await load();
      setNote("");
      setReason("");
      setScheduledAt("");
      setNextStatus("");
      setNotice(
        action === "add_note"
          ? "Note added."
          : action === "accept"
            ? "Referral accepted."
            : action === "decline"
              ? "Referral declined."
              : action === "request_information"
                ? "Information requested from the referring organization."
                : "Referral updated."
      );
    } catch (err) {
      const fields = toFieldErrors(err);
      setError(messageFor(err));
      setFieldError(Object.values(fields)[0] ?? null);
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) {
    return (
      <ClinicPage>
        <PageHeader
          title="Referral"
          back={{ href: "/portal/collaborative-clinic/referrals/history", label: "Referral history" }}
        />
        <ErrorPanel message={error} onRetry={load} />
      </ClinicPage>
    );
  }

  if (!data) {
    return (
      <ClinicPage>
        <PageHeader title="Referral" />
        <LoadingBlock label="Loading referral..." />
      </ClinicPage>
    );
  }

  const { referral, events, notes, appointments, commission, allowedActions } = data;
  const can = (action: string) => allowedActions.includes(action);

  return (
    <ClinicPage>
      <PageHeader
        title={referral.reference}
        description={`${referral.serviceName} · ${referral.direction === "inbound" ? `Received from ${referral.sendingOrganization}` : `Sent to ${referral.receivingOrganization}`}`}
        back={{ href: "/portal/collaborative-clinic/referrals/history", label: "Referral history" }}
        action={<StatusPill status={referral.status} />}
      />

      <div className="space-y-6">
        {error ? <Notice tone="rose">{error}</Notice> : null}
        {notice ? <Notice>{notice}</Notice> : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Referral Details" className="lg:col-span-2">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              <DataRow label="Referral ID">{referral.reference}</DataRow>
              <DataRow label="Created Date">{formatDateTime(referral.createdAt)}</DataRow>
              <DataRow label="Referring Organization">{referral.sendingOrganization}</DataRow>
              <DataRow label="Referring Professional">
                {referral.sendingProfessional ?? "-"}
              </DataRow>
              <DataRow label="Client ID">{referral.clientReference}</DataRow>
              <DataRow label="Requested Service">{referral.serviceName}</DataRow>
              <DataRow label="Reason for Referral">{referral.reason}</DataRow>
              <DataRow label="Priority">
                <StatusPill status={referral.priority} tone={priorityTone(referral.priority)} />
              </DataRow>
              <DataRow label="Current Status">
                <StatusPill status={referral.status} />
              </DataRow>
              <DataRow label="Assigned Professional">
                {referral.assignedProfessionalName ?? "-"}
              </DataRow>
              <DataRow label="Outcome">{referral.outcomeCode ?? "-"}</DataRow>
              {referral.declineReason ? (
                <DataRow label="Decline Reason">{referral.declineReason}</DataRow>
              ) : null}
            </dl>

            {referral.relevantInformation ? (
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Relevant information
                </p>
                {referral.relevantInformation}
              </div>
            ) : null}

            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              The client is referenced by ID only. Personal details are exchanged through the
              referral conversation, not through this portal.
            </p>
          </Panel>

          <div className="space-y-6">
            {commission ? (
              <Panel title="Commission">
                <dl>
                  <DataRow label="Commission">{commission.reference}</DataRow>
                  <DataRow label="Amount">
                    {formatMoney(commission.amountMinor, commission.currency)}
                  </DataRow>
                  <DataRow label="Rate">{commission.rateBp / 100}%</DataRow>
                  <DataRow label="Status">
                    <StatusPill status={commission.status} />
                  </DataRow>
                </dl>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Calculated by Kindred Tap when the referral completed. Amounts cannot be changed
                  from the partner portal.
                </p>
              </Panel>
            ) : null}

            <Panel title="Appointments">
              {appointments.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No appointments yet.</p>
              ) : (
                <ul className="space-y-3">
                  {appointments.map((appointment) => (
                    <li key={appointment.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {formatDateTime(appointment.scheduledAt)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {appointment.professionalName ?? "To be assigned"}
                        </p>
                      </div>
                      <StatusPill status={appointment.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        {/* Actions */}
        <Panel title="Actions">
          {allowedActions.length === 0 ? (
            <EmptyState
              title="No actions available"
              body="This referral is settled. You can still add a note and follow the timeline below."
            />
          ) : (
            <div className="space-y-5">
              {can("accept") ? (
                <ActionRow
                  label="Accept this referral"
                  description="Confirms your clinic will take this referral on. You can then assign and schedule."
                  onAct={() => act("accept")}
                  busy={busy === "accept"}
                />
              ) : null}

              {can("decline") ? (
                <ActionBlock
                  label="Decline this referral"
                  description="Tell the referring organization why. The referral closes and cannot be reopened."
                  value={reason}
                  onChange={setReason}
                  onAct={() => act("decline", { detail: reason })}
                  busy={busy === "decline"}
                  disabled={reason.trim().length < 5}
                  actionLabel="Decline referral"
                  tone="rose"
                />
              ) : null}

              {can("refer_back") ? (
                <ActionBlock
                  label="Refer back"
                  description="Send this back to the referring organization so they can look elsewhere."
                  value={reason}
                  onChange={setReason}
                  onAct={() => act("refer_back", { detail: reason || null })}
                  busy={busy === "refer_back"}
                  disabled={false}
                  actionLabel="Refer back"
                />
              ) : null}

              {can("request_information") ? (
                <ActionBlock
                  label="Request information"
                  description="Ask for what you need before deciding. The referring organization is notified."
                  value={reason}
                  onChange={setReason}
                  onAct={() => act("request_information", { detail: reason })}
                  busy={busy === "request_information"}
                  disabled={reason.trim().length < 5}
                  actionLabel="Request information"
                />
              ) : null}

              {can("schedule") ? (
                <ActionBlock
                  label="Schedule appointment"
                  description="Book the first appointment connected to this referral."
                  value={scheduledAt}
                  onChange={setScheduledAt}
                  type="datetime-local"
                  onAct={() =>
                    act("schedule", { scheduledAt: new Date(scheduledAt).toISOString() })
                  }
                  busy={busy === "schedule"}
                  disabled={!scheduledAt}
                  actionLabel="Schedule appointment"
                />
              ) : null}

              {can("update_status") ? (
                <ActionBlock
                  label="Update status"
                  description="Move this referral forward. Only statuses the workflow allows from here are accepted."
                  value={nextStatus}
                  onChange={setNextStatus}
                  type="select"
                  options={[
                    { value: "under_review", label: "Move to under review" },
                    { value: "information_required", label: "Request information" },
                    { value: "accepted", label: "Mark accepted" },
                    { value: "in_progress", label: "Mark in progress" },
                    { value: "completed", label: "Mark completed" },
                    { value: "cancelled", label: "Cancel referral" },
                  ]}
                  onAct={() => act("update_status", { toStatus: nextStatus })}
                  busy={busy === "update_status"}
                  disabled={!nextStatus}
                  actionLabel="Update status"
                />
              ) : null}

              {can("add_note") ? (
                <ActionBlock
                  label="Add note"
                  description="Internal note on the referral record. Do not paste clinical documentation here."
                  value={note}
                  onChange={setNote}
                  onAct={() => act("add_note", { detail: note })}
                  busy={busy === "add_note"}
                  disabled={note.trim().length < 1}
                  actionLabel="Add note"
                />
              ) : null}

              {can("close_referral") ? (
                <ActionRow
                  label="Close referral"
                  description="Close this referral. It stays in the history but stops appearing as active."
                  onAct={() => act("close_referral")}
                  busy={busy === "close_referral"}
                />
              ) : null}

              {fieldError ? <Notice tone="rose">{fieldError}</Notice> : null}
            </div>
          )}
        </Panel>

        {/* Notes and timeline */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Notes">
            {notes.length === 0 ? (
              <EmptyState title="No notes" body="Notes added to this referral appear here." />
            ) : (
              <ul className="space-y-3">
                {notes.map((entry) => (
                  <li key={entry.id} className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
                    <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{entry.body}</p>
                    <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {entry.authorName ?? "Unknown"} &middot; {formatDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Timeline">
            {events.length === 0 ? (
              <EmptyState title="No activity" body="Nothing has happened on this referral yet." />
            ) : (
              <ol className="space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {titleCase(event.action.split(".").pop() ?? event.action)}
                      {event.toStatus ? ` · ${titleCase(event.toStatus)}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDateTime(event.createdAt)}
                      {event.actorName ? ` · ${event.actorName}` : ""}
                    </p>
                    {event.detail ? (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{event.detail}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Action primitives                                                   */
/* ------------------------------------------------------------------ */

function ActionRow({
  label,
  description,
  onAct,
  busy,
}: {
  label: string;
  description: string;
  onAct: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <button type="button" onClick={onAct} disabled={busy} className={primaryActionClass}>
        {busy ? "Working..." : label}
      </button>
    </div>
  );
}

/**
 * An action that needs a value before it can run.
 *
 * A real `<label>` bound to the control, and the control is disabled while the
 * action is in flight, so the button and the field cannot disagree about whether
 * the action is available.
 */
function ActionBlock({
  label,
  description,
  value,
  onChange,
  onAct,
  busy,
  disabled,
  actionLabel,
  type = "text",
  options,
  tone = "primary",
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  onAct: () => void;
  busy: boolean;
  disabled: boolean;
  actionLabel: string;
  type?: "text" | "datetime-local" | "select";
  options?: { value: string; label: string }[];
  tone?: "primary" | "rose";
}) {
  const controlId = `action-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;

  return (
    <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          {type === "select" ? (
            <select
              id={controlId}
              aria-label={label}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              disabled={busy}
              className={inputClass}
            >
              <option value="">Choose an action</option>
              {(options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <>
              <label htmlFor={controlId} className="sr-only">
                {label} detail
              </label>
              {type === "datetime-local" ? (
                <input
                  id={controlId}
                  type="datetime-local"
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  disabled={busy}
                  className={inputClass}
                />
              ) : (
                <textarea
                  id={controlId}
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                  rows={2}
                  maxLength={2000}
                  disabled={busy}
                  className={textareaClass}
                />
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onAct}
          disabled={busy || disabled}
          className={tone === "rose" ? `${secondaryActionClass} border-rose-300 text-rose-700` : primaryActionClass}
        >
          {busy ? "Working..." : actionLabel}
        </button>
      </div>
    </div>
  );
}