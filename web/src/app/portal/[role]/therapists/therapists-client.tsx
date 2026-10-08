"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import {
  Badge,
  EmptyState,
  ErrorPanel,
  LoadingBlock,
  PageHeader,
  SearchField,
  SegmentedControl,
  StatTile,
} from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  fetchTherapists,
  formatDay,
  setIntake,
  type AdvisorTherapist,
} from "@/lib/advisor";

type IntakeFilter = "all" | "accepting" | "paused";

function supervisionTone(status: string): "teal" | "amber" | "rose" {
  if (status === "current") return "teal";
  if (status === "due") return "amber";
  return "rose";
}

export default function TherapistsClient() {
  const [rows, setRows] = useState<AdvisorTherapist[] | null>(null);
  const [total, setTotal] = useState(0);
  const [requiring, setRequiring] = useState(0);
  const [intervalDays, setIntervalDays] = useState(0);
  const [filter, setFilter] = useState<IntakeFilter>("all");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Debounced so typing hits the API once the user pauses, not per keystroke.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetchTherapists({
            q: search.trim() || undefined,
            accepting: filter === "accepting" ? "1" : filter === "paused" ? "0" : undefined,
          });
          if (cancelled) return;
          setRows(response.therapists);
          setTotal(response.total);
          setRequiring(response.requiringSupervision);
          setIntervalDays(response.intervalDays);
          setError(null);
        } catch (err) {
          if (!cancelled) {
            setRows([]);
            setError(messageFor(err));
          }
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, filter, reload]);

  async function toggleIntake(therapist: AdvisorTherapist) {
    setBusy(therapist.id);
    try {
      await setIntake(therapist.id, !therapist.acceptingNewCases);
      setRows((prev) =>
        (prev ?? []).map((row) =>
          row.id === therapist.id ? { ...row, acceptingNewCases: !therapist.acceptingNewCases } : row
        )
      );
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdvisorPage>
      <PageHeader
        title="Therapists"
        description="Every practitioner in the clinic: registration, caseload, supervision standing and intake - pause intake in one click when a caseload is full."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Practitioners" value={total} />
        <StatTile
          label="Needing supervision"
          value={requiring}
          hint={`Every ${intervalDays} days`}
        />
        <StatTile
          label="Accepting cases"
          value={(rows ?? []).filter((row) => row.acceptingNewCases).length}
        />
        <StatTile
          label="Registration verified"
          value={(rows ?? []).filter((row) => row.registrationVerified).length}
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel="Filter practitioners"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "accepting", label: "Accepting cases" },
            { value: "paused", label: "Intake paused" },
          ]}
        />
        <SearchField value={search} onChange={setSearch} placeholder="Search name or discipline" />
      </div>

      {error ? (
        <ErrorPanel message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : null}
      {rows === null && !error ? <LoadingBlock label="Loading practitioners..." /> : null}

      {rows !== null ? (
        rows.length === 0 ? (
          <EmptyState
            title="No practitioners match"
            body="Adjust the filter, or invite a therapist to the clinic."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/portal/clinical_advisor/therapists/${row.id}`}
                        className="text-sm font-semibold text-slate-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-300"
                      >
                        {row.fullName}
                      </Link>
                      <Badge tone={row.registrationVerified ? "emerald" : "amber"}>
                        {row.registrationVerified ? "Verified" : "Unverified"}
                      </Badge>
                      <Badge tone={supervisionTone(row.supervision.status)}>
                        Supervision {row.supervision.status}
                      </Badge>
                      {row.acceptingNewCases ? (
                        <Badge tone="teal">Intake open</Badge>
                      ) : (
                        <Badge tone="slate">Intake paused</Badge>
                      )}
                      {row.pendingEthicsAcks > 0 ? (
                        <Badge tone="amber">{row.pendingEthicsAcks} ethics pending</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {row.discipline ?? "Therapist"}
                      {row.registrationBody ? ` · ${row.registrationBody}` : ""}
                      {row.yearsExperience ? ` · ${row.yearsExperience}y experience` : ""} ·{" "}
                      {row.activeClients} active clients · {row.upcomingSessions} upcoming · last
                      supervision {formatDay(row.lastSupervisionDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => void toggleIntake(row)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-teal-400 hover:text-teal-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300"
                    >
                      {busy === row.id
                        ? "Saving..."
                        : row.acceptingNewCases
                          ? "Pause intake"
                          : "Resume intake"}
                    </button>
                    <Link
                      href={`/portal/clinical_advisor/therapists/${row.id}`}
                      className="rounded-xl bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-800"
                    >
                      Profile
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </AdvisorPage>
  );
}
