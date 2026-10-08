"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  decideMatchRequest,
  fetchMatchRequest,
  fetchTherapists,
  formatDateTime,
  type AdvisorTherapist,
  type MatchDecision,
  type MatchRequestDetail,
} from "@/lib/advisor";

export default function MatchRequestDetailClient({ requestId }: { requestId: string }) {
  const [data, setData] = useState<MatchRequestDetail | null>(null);
  const [therapists, setTherapists] = useState<AdvisorTherapist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [assignTo, setAssignTo] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetchMatchRequest(requestId);
      setData(response);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [requestId]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetchTherapists({ accepting: "1" });
        setTherapists(response.therapists);
      } catch {
        setTherapists([]);
      }
    })();
  }, []);

  async function decide(decision: MatchDecision, therapistId?: string) {
    setBusy(decision);
    setNotice(null);
    try {
      await decideMatchRequest(requestId, {
        decision,
        note: note.trim() || undefined,
        therapistId,
      });
      setNote("");
      setNotice(`Recorded: ${decision}.`);
      await load();
    } catch (err) {
      setNotice(messageFor(err));
    } finally {
      setBusy(null);
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
        <LoadingBlock label="Loading request..." />
      </AdvisorPage>
    );
  }

  const { search, issue, recommendations, history, matchedBecause } = data;

  return (
    <AdvisorPage>
      <PageHeader
        title={`Matching · ${search.clientName}`}
        description={`${issue?.label ?? search.primaryIssueKey} · searched ${formatDateTime(search.createdAt)}`}
        back={{ href: "/portal/clinical_advisor/matching", label: "Matching queue" }}
      />

      {notice ? (
        <div className="mb-5 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800 dark:border-teal-700/60 dark:bg-teal-500/10 dark:text-teal-200">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Panel title="The search">
            <DataRow label="Client">
              <Link
                href={`/portal/clinical_advisor/clients/${search.clientId}`}
                className="font-semibold text-teal-700 hover:underline dark:text-teal-300"
              >
                {search.clientName}
              </Link>
            </DataRow>
            <DataRow label="Primary issue">{issue?.label ?? search.primaryIssueKey}</DataRow>
            <DataRow label="Secondary issues">
              {search.secondaryIssues.join(", ") || "—"}
            </DataRow>
            <DataRow label="Recommendations">{String(search.resultCount)}</DataRow>
            {matchedBecause ? (
              <DataRow label="Why these matches">{matchedBecause}</DataRow>
            ) : null}
          </Panel>

          <Panel title="Shortlist">
            {recommendations.length === 0 ? (
              <EmptyState
                title="No recommendations"
                body="The algorithm found no therapist matching this search; assign someone manually."
              />
            ) : (
              <ul className="space-y-3">
                {recommendations.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/portal/clinical_advisor/therapists/${item.id}`}
                        className="text-sm font-semibold text-slate-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-300"
                      >
                        {item.fullName}
                      </Link>
                      <Badge tone="teal">{Math.round(item.semanticScore * 100)}% match</Badge>
                      <Badge tone="slate">{item.discipline ?? "Therapist"}</Badge>
                      {item.acceptingNewCases ? (
                        <Badge tone="emerald">Accepting</Badge>
                      ) : (
                        <Badge tone="rose">Paused</Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {item.bio || "No bio."}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                      {item.matchedSpecialties.join(", ") || "No listed specialty overlap"} ·{" "}
                      {item.yearsExperience ?? "—"}y · {item.modalities.join(", ")}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy !== null || !item.acceptingNewCases}
                        onClick={() => void decide("assigned", item.id)}
                        className={secondaryActionClass}
                      >
                        {busy === "assigned" ? "Assigning..." : "Assign this therapist"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Decision history">
            {history.length === 0 ? (
              <EmptyState title="No decisions yet" body="This search is waiting for review." />
            ) : (
              <ol className="space-y-4">
                {history.map((row) => (
                  <li key={row.id} className="border-l-2 border-teal-200 pl-4 dark:border-teal-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {row.decision}
                      </p>
                      <span className="text-[11px] text-slate-500 dark:text-slate-500">
                        {formatDateTime(row.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {row.decidedByName ?? "Advisor"}
                      {row.therapistName ? ` · ${row.therapistName}` : ""}
                      {row.note ? ` · ${row.note}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Panel title="Make a decision">
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Your note is stored with the decision and visible in the audit trail.
            </p>
            <Field label="Decision note">
              <textarea
                className={textareaClass}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why this decision?"
              />
            </Field>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide("approved")}
                className={primaryActionClass}
              >
                {busy === "approved" ? "Saving..." : "Approve shortlist"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide("rejected")}
                className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:border-rose-400 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300"
              >
                {busy === "rejected" ? "Saving..." : "Reject"}
              </button>
            </div>
          </Panel>

          <Panel title="Assign directly">
            <Field label="Therapist">
              <select
                className={inputClass}
                value={assignTo}
                onChange={(event) => setAssignTo(event.target.value)}
              >
                <option value="">Choose a practitioner...</option>
                {therapists.map((therapist) => (
                  <option key={therapist.id} value={therapist.id}>
                    {therapist.fullName} - {therapist.activeClients} active
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              disabled={busy !== null || !assignTo}
              onClick={() => void decide("assigned", assignTo)}
              className={`${primaryActionClass} mt-3`}
            >
              {busy === "assigned" ? "Assigning..." : "Assign"}
            </button>
          </Panel>
        </div>
      </div>
    </AdvisorPage>
  );
}
