"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SupervisorPage } from "@/components/supervisor/shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageTitle,
  ProgressBar,
  SectionTitle,
  type Tone,
} from "@/components/ui";
import { DataRow, SegmentedControl } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import {
  fetchTeamActivity,
  fetchTeamClients,
  fetchTeamMember,
  fetchTeamSessions,
  formatDateTime,
  formatDay,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  type ActivityRow,
  type TeamClientRow,
  type TeamDetail,
  type TeamSessionRow,
} from "@/lib/supervisor";

const UI_TONE: Record<string, Tone> = {
  teal: "accent",
  slate: "neutral",
  amber: "warning",
  rose: "danger",
  emerald: "success",
  sky: "info",
};

function uiTone(tone: string): Tone {
  return tone in UI_TONE ? UI_TONE[tone] : "neutral";
}

function humanLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/(^|\s)\S/g, (chunk) => chunk.toUpperCase());
}

type Tab = "overview" | "clients" | "supervision" | "case_reviews" | "session_reviews" | "performance" | "workload" | "escalations" | "interventions" | "activity";

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "clients", label: "Clients" },
  { value: "supervision", label: "Supervision" },
  { value: "case_reviews", label: "Case Reviews" },
  { value: "session_reviews", label: "Session Reviews" },
  { value: "performance", label: "Performance" },
  { value: "workload", label: "Workload" },
  { value: "escalations", label: "Escalations" },
  { value: "interventions", label: "Interventions" },
  { value: "activity", label: "Activity" },
];

function StatTile({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <div className="card p-4">
      <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function SupervisorTeamProfileClient({ memberId }: { memberId: string }) {
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTeamMember(memberId);
      setDetail(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <SupervisorPage>
        <LoadingState label="Loading practitioner profile" />
      </SupervisorPage>
    );
  }
  if (error || !detail) {
    return (
      <SupervisorPage>
        <EmptyState
          title="We could not load this practitioner"
          description={error ?? "That team member does not exist."}
          action={<Button onClick={reload}>Try again</Button>}
        />
      </SupervisorPage>
    );
  }

  const p = detail.practitioner;

  return (
    <SupervisorPage>
      <Link
        href="/portal/clinical_supervisor/team"
        className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Back to the team
      </Link>

      <PageTitle
        description={`${humanLabel(p.role)}${p.specialization ? ` · ${p.specialization}` : ""}`}
        action={
          <span className="flex gap-2">
            <Badge tone={uiTone(statusTone(p.supervision.status))} dot>{statusLabel(p.supervision.status)}</Badge>
            <Badge tone={p.workload.band === "overloaded" ? "danger" : "neutral"}>{p.workload.label}</Badge>
          </span>
        }
      >
        {p.fullName}
      </PageTitle>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active clients" value={p.activeClients} />
        <StatTile label="Sessions this week" value={p.sessionsThisWeek} />
        <StatTile label="Open case reviews" value={p.openCaseReviews} />
        <StatTile label="Open escalations" value={p.openEscalations} />
      </div>

      <div className="mt-5">
        <SegmentedControl options={TABS} value={tab} onChange={setTab} ariaLabel="Profile sections" />
      </div>

      <div className="mt-5">
        {tab === "overview" ? <Overview detail={detail} /> : null}
        {tab === "clients" ? <ClientsTab memberId={memberId} /> : null}
        {tab === "supervision" ? <SupervisionTab detail={detail} /> : null}
        {tab === "case_reviews" ? <CaseReviewsTab detail={detail} /> : null}
        {tab === "session_reviews" ? <SessionsTab memberId={memberId} /> : null}
        {tab === "performance" ? <PerformanceTab detail={detail} /> : null}
        {tab === "workload" ? <WorkloadTab detail={detail} /> : null}
        {tab === "escalations" ? <EscalationsTab detail={detail} /> : null}
        {tab === "interventions" ? <InterventionsTab detail={detail} /> : null}
        {tab === "activity" ? <ActivityTab memberId={memberId} /> : null}
      </div>
    </SupervisorPage>
  );
}

function Overview({ detail }: { detail: TeamDetail }) {
  const p = detail.practitioner;
  return (
    <Card>
      <SectionTitle>Overview</SectionTitle>
      <dl className="mt-4 divide-y divide-slate-100">
        <DataRow label="Status">{humanLabel(p.accountStatus)}</DataRow>
        <DataRow label="Specialization">{p.specialization ?? "-"}</DataRow>
        <DataRow label="Last supervision">
          {p.lastSupervisionDate ? <time dateTime={p.lastSupervisionDate}>{formatDay(p.lastSupervisionDate)}</time> : "-"}
        </DataRow>
        <DataRow label="Next supervision">
          {p.supervision.nextDue ? <time dateTime={p.supervision.nextDue}>{formatDay(p.supervision.nextDue)}</time> : "-"}
        </DataRow>
        <DataRow label="Open interventions">{p.openInterventions}</DataRow>
        <DataRow label="Documentation pending">{p.documentationPending}</DataRow>
      </dl>
    </Card>
  );
}

function ClientsTab({ memberId }: { memberId: string }) {
  const [rows, setRows] = useState<TeamClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setError(null);
      fetchTeamClients(memberId)
        .then((r) => { if (active) setRows(r.clients); })
        .catch((e) => { if (active) setError(messageFor(e)); });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [memberId, tick]);

  if (error) {
    return (
      <EmptyState
        title="We could not load this caseload"
        description={error}
        action={<Button onClick={() => setTick((value) => value + 1)}>Try again</Button>}
      />
    );
  }
  if (!rows) return <LoadingState label="Loading caseload" />;
  if (rows.length === 0) {
    return <EmptyState title="No clients" description="This practitioner has no client cases recorded." />;
  }

  return (
    <Card>
      <SectionTitle detail={`${rows.length} shown`}>Caseload</SectionTitle>
      <ul className="mt-4 divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.caseId} className="flex items-center justify-between gap-3 py-3 text-sm">
            <div>
              <p className="font-medium text-slate-700">{row.clientName ?? row.clientId.slice(0, 8)}</p>
              <p className="text-[11px] text-slate-500">
                Plan {statusLabel(row.planStatus)} · Opened{" "}
                {row.openedAt ? <time dateTime={row.openedAt}>{formatDay(row.openedAt)}</time> : "-"}
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <Badge tone={uiTone(statusTone(row.caseStatus))}>{statusLabel(row.caseStatus)}</Badge>
              <p className="mt-1">
                Next {row.nextSessionAt ? <time dateTime={row.nextSessionAt}>{formatDay(row.nextSessionAt.slice(0, 10))}</time> : "-"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SupervisionTab({ detail }: { detail: TeamDetail }) {
  const records = detail.supervisionRecords;
  return (
    <Card>
      <SectionTitle detail={<Link href="/portal/clinical_supervisor/supervision" className="text-xs font-semibold text-teal-700">All supervision</Link>}>
        Supervision history
      </SectionTitle>
      {records.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No supervision recorded" description="Supervision sessions for this practitioner will appear here." />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {records.map((record) => (
            <li key={record.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-700">
                  <time dateTime={record.supervisionDate}>{formatDay(record.supervisionDate)}</time> · {humanLabel(record.modality)}
                </p>
                <p className="text-[11px] text-slate-500">{record.focus ?? "Individual supervision"}</p>
              </div>
              <Badge tone={uiTone(statusTone(record.status))}>{statusLabel(record.status)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CaseReviewsTab({ detail }: { detail: TeamDetail }) {
  return (
    <Card>
      <SectionTitle detail={`${detail.caseReviews.length} shown`}>Case reviews</SectionTitle>
      {detail.caseReviews.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No case reviews" description="Case reviews for this practitioner will appear here." />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {detail.caseReviews.map((review) => (
            <li key={review.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div>
                <Link href={`/portal/clinical_supervisor/case-reviews/${review.id}`} className="font-medium text-teal-700">
                  {review.reference}
                </Link>
                <p className="text-[11px] text-slate-500">{review.summary}</p>
              </div>
              <span className="flex gap-2">
                <Badge tone={uiTone(priorityTone(review.priority))} dot>{priorityLabel(review.priority)}</Badge>
                <Badge tone={uiTone(statusTone(review.status))}>{statusLabel(review.status)}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SessionsTab({ memberId }: { memberId: string }) {
  const [rows, setRows] = useState<TeamSessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setError(null);
      fetchTeamSessions(memberId)
        .then((r) => { if (active) setRows(r.sessions); })
        .catch((e) => { if (active) setError(messageFor(e)); });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [memberId, tick]);

  if (error) {
    return (
      <EmptyState
        title="We could not load session documentation"
        description={error}
        action={<Button onClick={() => setTick((value) => value + 1)}>Try again</Button>}
      />
    );
  }
  if (!rows) return <LoadingState label="Loading session documentation" />;
  if (rows.length === 0) {
    return <EmptyState title="No sessions" description="Completed sessions for this practitioner will appear here." />;
  }

  return (
    <Card>
      <SectionTitle detail={`${rows.length} shown`}>Session documentation</SectionTitle>
      <ul className="mt-4 divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.sessionId} className="flex items-center justify-between gap-3 py-3 text-sm">
            <div>
              <p className="font-medium text-slate-700">
                <time dateTime={row.scheduledAt}>{formatDateTime(row.scheduledAt)}</time>
              </p>
              <p className="text-[11px] text-slate-500">
                {row.clientName ?? "Client"} · {row.mode ? humanLabel(row.mode) : "Session"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={row.documentationStatus === "final" ? "success" : "warning"}>
                {statusLabel(row.documentationStatus)}
              </Badge>
              {row.reviewId ? (
                <Link href={`/portal/clinical_supervisor/session-reviews/${row.reviewId}`} className="text-xs font-semibold text-teal-700">
                  Review
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PerformanceTab({ detail }: { detail: TeamDetail }) {
  const perf = detail.practitioner.performance;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <SectionTitle>Documentation</SectionTitle>
        <p className="mt-4 text-2xl font-semibold text-slate-900">
          {perf.documentation.rate ?? "-"}
          {perf.documentation.rate !== null ? "%" : ""}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {perf.documentation.finalNotes ?? 0}/{perf.documentation.completedSessions ?? 0} completed sessions with a final note.
        </p>
      </Card>
      <Card>
        <SectionTitle>Session completion</SectionTitle>
        <p className="mt-4 text-2xl font-semibold text-slate-900">
          {perf.sessionCompletionRate ?? "-"}
          {perf.sessionCompletionRate !== null ? "%" : ""}
        </p>
        <p className="mt-1 text-xs text-slate-500">Completed vs cancelled over the last 30 days.</p>
      </Card>
      <Card>
        <SectionTitle>Case reviews</SectionTitle>
        <p className="mt-4 text-2xl font-semibold text-slate-900">
          {perf.caseReviews.resolved}/{perf.caseReviews.total}
        </p>
        <p className="mt-1 text-xs text-slate-500">Resolved case reviews.</p>
      </Card>
      <Card>
        <SectionTitle>Interventions</SectionTitle>
        <p className="mt-4 text-2xl font-semibold text-slate-900">
          {perf.interventions.completed}/{perf.interventions.total}
        </p>
        <p className="mt-1 text-xs text-slate-500">{perf.interventions.overdue} overdue.</p>
      </Card>
      <Card className="sm:col-span-2">
        <SectionTitle>Development flags</SectionTitle>
        {perf.developmentFlags.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No development flags. Nothing indicates a need for additional support right now.
          </p>
        ) : (
          <ul className="mt-4 list-inside list-disc text-sm text-amber-700">
            {perf.developmentFlags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function WorkloadTab({ detail }: { detail: TeamDetail }) {
  const p = detail.practitioner;
  return (
    <Card>
      <SectionTitle detail={p.workload.label}>Workload</SectionTitle>
      <div className="mt-4">
        <ProgressBar value={p.activeClients} total={12} label="Caseload against a full caseload of 12" />
      </div>
      <dl className="mt-4 divide-y divide-slate-100">
        <DataRow label="Band"><Badge tone={p.workload.band === "overloaded" ? "danger" : "neutral"}>{p.workload.label}</Badge></DataRow>
        <DataRow label="Active clients">{p.activeClients}</DataRow>
        <DataRow label="Sessions this week">{p.sessionsThisWeek}</DataRow>
        <DataRow label="Upcoming sessions">{p.upcomingSessions}</DataRow>
        <DataRow label="Overdue documentation">{p.documentationPending}</DataRow>
        <DataRow label="Open interventions">{p.openInterventions}</DataRow>
      </dl>
    </Card>
  );
}

function EscalationsTab({ detail }: { detail: TeamDetail }) {
  return (
    <Card>
      <SectionTitle detail={`${detail.escalations.length} shown`}>Escalations</SectionTitle>
      {detail.escalations.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No escalations" description="Escalations involving this practitioner will appear here." />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {detail.escalations.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <Link href={`/portal/clinical_supervisor/escalations/${e.id}`} className="font-medium text-teal-700">
                {e.reference}
              </Link>
              <span className="flex gap-2">
                <Badge tone={uiTone(priorityTone(e.priority))} dot>{priorityLabel(e.priority)}</Badge>
                <Badge tone={uiTone(statusTone(e.status))}>{statusLabel(e.status)}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function InterventionsTab({ detail }: { detail: TeamDetail }) {
  return (
    <Card>
      <SectionTitle detail={`${detail.interventions.length} shown`}>Interventions</SectionTitle>
      {detail.interventions.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No interventions" description="Interventions assigned to this practitioner will appear here." />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {detail.interventions.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <Link href={`/portal/clinical_supervisor/interventions/${i.id}`} className="font-medium text-teal-700">
                {i.title}
              </Link>
              <span className="flex gap-2">
                <Badge tone={uiTone(priorityTone(i.priority))} dot>{priorityLabel(i.priority)}</Badge>
                <Badge tone={uiTone(statusTone(i.status))}>{statusLabel(i.status)}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActivityTab({ memberId }: { memberId: string }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setError(null);
      fetchTeamActivity(memberId)
        .then((r) => { if (active) setRows(r.activity); })
        .catch((e) => { if (active) setError(messageFor(e)); });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [memberId, tick]);

  if (error) {
    return (
      <EmptyState
        title="We could not load activity"
        description={error}
        action={<Button onClick={() => setTick((value) => value + 1)}>Try again</Button>}
      />
    );
  }
  if (!rows) return <LoadingState label="Loading activity" />;
  if (rows.length === 0) {
    return <EmptyState title="No activity" description="Recent supervision, reviews and interventions will appear here." />;
  }

  return (
    <Card>
      <SectionTitle detail={`${rows.length} shown`}>Activity</SectionTitle>
      <ul className="mt-4 divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={`${row.kind}-${row.id}`} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="text-slate-700">{row.title}</span>
            <span className="text-[11px] text-slate-500">
              <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
