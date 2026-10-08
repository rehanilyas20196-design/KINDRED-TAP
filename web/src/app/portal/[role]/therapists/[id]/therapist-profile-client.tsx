"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import {
  Badge,
  DataRow,
  ErrorPanel,
  LoadingBlock,
  PageHeader,
  Panel,
  StatTile,
  primaryActionClass,
  secondaryActionClass,
} from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  fetchTherapist,
  formatDay,
  setIntake,
  type TherapistDetailResponse,
} from "@/lib/advisor";

function supervisionTone(status: string): "teal" | "amber" | "rose" {
  if (status === "current") return "teal";
  if (status === "due") return "amber";
  return "rose";
}

function rate(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${value}%`;
}

export default function TherapistProfileClient({ therapistId }: { therapistId: string }) {
  const [data, setData] = useState<TherapistDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetchTherapist(therapistId);
      setData(response);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [therapistId]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  async function toggleIntake() {
    if (!data) return;
    setBusy(true);
    try {
      await setIntake(data.therapist.id, !data.therapist.acceptingNewCases);
      await load();
    } catch (err) {
      setError(messageFor(err));
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
        <LoadingBlock label="Loading practitioner..." />
      </AdvisorPage>
    );
  }

  const { therapist, stats, supervision, standards } = data;

  return (
    <AdvisorPage>
      <PageHeader
        title={therapist.fullName}
        description={`${therapist.discipline ?? "Therapist"} · ${therapist.yearsExperience ?? "—"} years experience`}
        back={{ href: "/portal/clinical_advisor/therapists", label: "Therapists" }}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/portal/clinical_advisor/supervision/${therapist.id}`}
              className={secondaryActionClass}
            >
              Supervision
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleIntake()}
              className={primaryActionClass}
            >
              {busy
                ? "Saving..."
                : therapist.acceptingNewCases
                  ? "Pause intake"
                  : "Resume intake"}
            </button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={therapist.accountStatus === "active" ? "emerald" : "rose"}>
          {therapist.accountStatus}
        </Badge>
        <Badge tone={therapist.registrationVerified ? "emerald" : "amber"}>
          {therapist.registrationVerified ? "Registration verified" : "Registration unverified"}
        </Badge>
        <Badge tone={supervisionTone(therapist.supervision.status)}>
          Supervision {therapist.supervision.status}
        </Badge>
        <Badge tone={therapist.acceptingNewCases ? "teal" : "slate"}>
          {therapist.acceptingNewCases ? "Accepting cases" : "Intake paused"}
        </Badge>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Attendance"
          value={rate(stats.attendanceRate)}
          hint={`${stats.sessionsCompleted} completed / ${stats.sessionsCancelled} cancelled`}
        />
        <StatTile
          label="Documentation"
          value={rate(stats.documentationRate)}
          hint={`${stats.sessionsDocumented} of ${stats.sessionsCompleted} notes`}
        />
        <StatTile
          label="Assessment review"
          value={rate(stats.assessmentReviewRate)}
          hint={`${stats.assessmentsReviewed} of ${stats.assessmentsTotal}`}
        />
        <StatTile
          label="Escalations"
          value={stats.escalations}
          href={
            stats.escalations > 0
              ? `/portal/clinical_advisor/safety?q=${encodeURIComponent(therapist.fullName)}`
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Panel title="Profile">
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {therapist.bio || "No bio recorded."}
            </p>
            <div className="mt-4">
              <DataRow label="Qualifications">
                {therapist.qualifications.join(", ") || "—"}
              </DataRow>
              <DataRow label="Clinical areas">{therapist.clinicalAreas.join(", ") || "—"}</DataRow>
              <DataRow label="Modalities">{therapist.modalities.join(", ") || "—"}</DataRow>
              <DataRow label="Languages">{therapist.languages.join(", ") || "—"}</DataRow>
              <DataRow label="Session modes">{therapist.sessionModes.join(", ") || "—"}</DataRow>
              <DataRow label="Availability">
                {therapist.availabilityDays.join(", ") || "—"}
                {therapist.availabilityHours ? ` · ${therapist.availabilityHours}` : ""}
              </DataRow>
              <DataRow label="Fee">
                {therapist.sessionFee !== null
                  ? `${therapist.sessionFee} ${therapist.currency ?? ""}`
                  : "—"}
              </DataRow>
              <DataRow label="Joined">{formatDay(therapist.joinedAt)}</DataRow>
            </div>
          </Panel>

          <Panel
            title="Registration"
            action={
              therapist.registrationVerified ? (
                <Badge tone="emerald">Verified</Badge>
              ) : (
                <Badge tone="amber">Unverified</Badge>
              )
            }
          >
            <DataRow label="Body">{therapist.registrationBody ?? "—"}</DataRow>
            <DataRow label="Number">{therapist.registrationNumber ?? "—"}</DataRow>
            <DataRow label="Country">{therapist.registrationCountry ?? "—"}</DataRow>
            <DataRow label="Expiry">{formatDay(therapist.registrationExpiry)}</DataRow>
            <DataRow label="Supervises others">
              {therapist.supervisionExperience ? "Yes" : "No"}
            </DataRow>
          </Panel>

          <Panel title="Supervision records">
            {supervision.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No supervision recorded yet.{" "}
                <Link
                  href={`/portal/clinical_advisor/supervision/${therapist.id}`}
                  className="font-semibold text-teal-700 hover:underline dark:text-teal-300"
                >
                  Record the first session
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {supervision.map((record) => (
                  <li key={record.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {formatDay(record.supervisionDate)} · {record.focus || "Supervision"}
                      </p>
                      <Badge tone={record.status === "closed" ? "slate" : "amber"}>
                        {record.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {record.modality} · follow-up {formatDay(record.followUpDate)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Panel title="Goals & caseload">
            <DataRow label="Active clients">{String(stats.activeClients)}</DataRow>
            <DataRow label="Upcoming sessions">{String(stats.upcomingSessions)}</DataRow>
            <DataRow label="Active plans">{String(stats.plansActive)}</DataRow>
            <DataRow label="Completed plans">{String(stats.plansCompleted)}</DataRow>
            <DataRow label="Average goal progress">
              {stats.goalProgress.goalCount
                ? `${stats.goalProgress.averageProgress}% of ${stats.goalProgress.goalCount} goals`
                : "—"}
            </DataRow>
          </Panel>

          <Panel title="Ethics & standards">
            {standards.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No guidelines or standards assigned.
              </p>
            ) : (
              <ul className="space-y-2">
                {standards.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
                      {item.title} · v{item.version}
                    </span>
                    <Badge
                      tone={
                        item.acknowledgedAt && item.acknowledgedVersion === item.version
                          ? "emerald"
                          : "amber"
                      }
                    >
                      {item.acknowledgedAt && item.acknowledgedVersion === item.version
                        ? "acknowledged"
                        : "pending"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </AdvisorPage>
  );
}
