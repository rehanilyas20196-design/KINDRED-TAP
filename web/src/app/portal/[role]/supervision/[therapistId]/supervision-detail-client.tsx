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
  StatTile,
  inputClass,
  primaryActionClass,
  textareaClass,
} from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  createSupervision,
  fetchSupervisionDetail,
  formatDay,
  formatDateTime,
  type SupervisionDetail,
} from "@/lib/advisor";

const MODALITIES = ["individual", "group", "peer", "case_review"];

export default function SupervisionDetailClient({ therapistId }: { therapistId: string }) {
  const [data, setData] = useState<SupervisionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [supervisionDate, setSupervisionDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [modality, setModality] = useState("individual");
  const [focus, setFocus] = useState("");
  const [discussionTopics, setDiscussionTopics] = useState("");
  const [actionItems, setActionItems] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetchSupervisionDetail(therapistId);
      setData(response);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [therapistId]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await createSupervision(therapistId, {
        supervisionDate,
        modality,
        focus: focus.trim() || "Supervision",
        discussionTopics: discussionTopics.trim() || undefined,
        actionItems: actionItems.trim() || undefined,
        followUpDate: followUpDate || null,
        status: "open",
      });
      setFocus("");
      setDiscussionTopics("");
      setActionItems("");
      setFollowUpDate("");
      setNotice("Supervision recorded.");
      await load();
    } catch (err) {
      setNotice(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <AdvisorPage>
        <ErrorPanel message={error} onRetry={load} />
      </AdvisorPage>
    );
  }
  if (!data) {
    return (
      <AdvisorPage>
        <LoadingBlock label="Loading supervision history..." />
      </AdvisorPage>
    );
  }

  const { therapist, records } = data;

  return (
    <AdvisorPage>
      <PageHeader
        title={`Supervision · ${therapist.fullName}`}
        description={`${therapist.discipline ?? "Practitioner"} · supervised every ${data.intervalDays} days`}
        back={{ href: "/portal/clinical_advisor/supervision", label: "Supervision" }}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Records" value={therapist.recordCount} />
        <StatTile
          label="Open actions"
          value={therapist.openActionItems}
          hint={therapist.openActionItems ? "Carry into next session" : "All closed"}
        />
        <StatTile label="Active clients" value={therapist.activeClients} />
        <StatTile
          label="Status"
          value={
            <Badge
              tone={
                therapist.supervision.status === "current"
                  ? "teal"
                  : therapist.supervision.status === "due"
                    ? "amber"
                    : "rose"
              }
            >
              {therapist.supervision.status}
            </Badge>
          }
          hint={
            therapist.supervision.nextDue
              ? `Next due ${formatDay(therapist.supervision.nextDue)}`
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Panel title="Record a supervision session">
            {notice ? (
              <p className="mb-3 text-xs font-medium text-teal-700 dark:text-teal-300">{notice}</p>
            ) : null}
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Date">
                <input
                  type="date"
                  className={inputClass}
                  value={supervisionDate}
                  onChange={(event) => setSupervisionDate(event.target.value)}
                  required
                />
              </Field>
              <Field label="Modality">
                <select
                  className={inputClass}
                  value={modality}
                  onChange={(event) => setModality(event.target.value)}
                >
                  {MODALITIES.map((item) => (
                    <option key={item} value={item}>
                      {item.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Focus" className="sm:col-span-2">
                <input
                  className={inputClass}
                  value={focus}
                  onChange={(event) => setFocus(event.target.value)}
                  placeholder="Caseload review"
                />
              </Field>
              <Field label="Discussion topics" className="sm:col-span-2">
                <textarea
                  className={textareaClass}
                  value={discussionTopics}
                  onChange={(event) => setDiscussionTopics(event.target.value)}
                  placeholder="What was discussed?"
                />
              </Field>
              <Field label="Action items" className="sm:col-span-2">
                <textarea
                  className={textareaClass}
                  value={actionItems}
                  onChange={(event) => setActionItems(event.target.value)}
                  placeholder="What must happen before the next supervision?"
                />
              </Field>
              <Field label="Follow-up date">
                <input
                  type="date"
                  className={inputClass}
                  value={followUpDate}
                  onChange={(event) => setFollowUpDate(event.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <button type="submit" disabled={busy} className={primaryActionClass}>
                  {busy ? "Saving..." : "Record supervision"}
                </button>
              </div>
            </form>
            <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-500">
              Supervision records never include session notes or anything written about an individual
              client&apos;s treatment.
            </p>
          </Panel>

          <Panel title="History">
            {records.length === 0 ? (
              <EmptyState
                title="No supervision recorded"
                body="The first record starts the supervision clock for this practitioner."
              />
            ) : (
              <ol className="space-y-4">
                {records.map((record) => (
                  <li
                    key={record.id}
                    className="border-l-2 border-teal-200 pl-4 dark:border-teal-800"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {formatDay(record.supervisionDate)} · {record.focus || "Supervision"}
                      </p>
                      <Badge tone={record.status === "closed" ? "slate" : "amber"}>
                        {record.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {record.modality}
                      {record.advisorName ? ` · ${record.advisorName}` : ""} ·{" "}
                      {formatDateTime(record.createdAt)}
                    </p>
                    {record.discussionTopics ? (
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        Topics: {record.discussionTopics}
                      </p>
                    ) : null}
                    {record.actionItems ? (
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        Actions: {record.actionItems}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Panel title="Practitioner">
            <DataRow label="Discipline">{therapist.discipline ?? "—"}</DataRow>
            <DataRow label="Clinical areas">
              {therapist.clinicalAreas.length ? therapist.clinicalAreas.join(", ") : "—"}
            </DataRow>
            <DataRow label="Availability">
              {therapist.availabilityDays.length ? therapist.availabilityDays.join(", ") : "—"}
            </DataRow>
            <DataRow label="Last supervision">{formatDay(therapist.lastSupervisionDate)}</DataRow>
            <DataRow label="Next follow-up">{formatDay(therapist.nextFollowUpDate)}</DataRow>
            <DataRow label="Upcoming sessions">{String(therapist.upcomingCount)}</DataRow>
          </Panel>
        </div>
      </div>
    </AdvisorPage>
  );
}
