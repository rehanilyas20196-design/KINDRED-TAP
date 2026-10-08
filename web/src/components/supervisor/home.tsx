"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageTitle,
  SectionTitle,
  type Tone,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import { EthicsBadge } from "@/components/ethics-badge";
import type { PortalMeta } from "@/lib/portals";
import type { AuthUser } from "@/lib/api";
import {
  fetchDashboard,
  formatDateTime,
  priorityTone,
  statusLabel,
  statusTone,
  type SupervisorDashboard,
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

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const KIND_LABEL: Record<string, string> = {
  supervision: "Supervision",
  case_review: "Case review",
  intervention: "Intervention",
  concern: "Safety concern",
  escalation: "Escalation",
  event: "Scheduled",
  documentation: "Documentation",
};

export function SupervisorHome({ user, portal }: { user: AuthUser; portal: PortalMeta }) {
  const [data, setData] = useState<SupervisorDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDashboard();
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so no state is set synchronously inside the effect body.
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const firstName = user.fullName?.split(" ")[0] ?? "there";

  const header = (
    <PageTitle
      eyebrow={portal.portal}
      description="Monitor safety, review escalations, supervise the team and step in when a case needs it."
      action={<EthicsBadge roleTitle="Clinic Supervisor" />}
    >
      {`${greeting()}, ${firstName}`}
    </PageTitle>
  );

  if (error) {
    return (
      <>
        {header}
        <EmptyState
          title="We could not load your supervision dashboard"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      </>
    );
  }

  if (loading || !data) {
    return (
      <>
        {header}
        <LoadingState label="Loading your supervision dashboard" />
      </>
    );
  }

  const { counts } = data;

  const statCards: { label: string; value: number; href: string; hint?: string }[] = [
    { label: "Active therapists/supporters", value: counts.activePractitioners, href: `${supervisorRoot()}/team` },
    { label: "Active clients", value: counts.activeClients, href: `${supervisorRoot()}/clients` },
    { label: "Safety concerns", value: counts.openConcerns, href: `${supervisorRoot()}/safety`, hint: counts.highPriorityConcerns > 0 ? `${counts.highPriorityConcerns} high priority` : undefined },
    { label: "Open escalations", value: counts.openEscalations, href: `${supervisorRoot()}/escalations`, hint: counts.highPriorityEscalations > 0 ? `${counts.highPriorityEscalations} high priority` : undefined },
    { label: "Pending case reviews", value: counts.pendingCaseReviews, href: `${supervisorRoot()}/case-reviews` },
    { label: "Pending session reviews", value: counts.pendingSessionReviews, href: `${supervisorRoot()}/session-reviews` },
    { label: "Pending supervision", value: counts.pendingSupervision, href: `${supervisorRoot()}/supervision` },
    { label: "Pending interventions", value: counts.pendingInterventions, href: `${supervisorRoot()}/interventions`, hint: counts.overdueInterventions > 0 ? `${counts.overdueInterventions} overdue` : undefined },
    { label: "Overdue follow-ups", value: counts.overdueFollowUps, href: `${supervisorRoot()}/calendar` },
    { label: "Documentation requiring review", value: counts.documentationPending, href: `${supervisorRoot()}/session-reviews` },
    { label: "Therapists requiring support", value: counts.supervisionOverdue, href: `${supervisorRoot()}/team?filter=needs_supervision` },
  ].filter((card) => card.value > 0);

  return (
    <>
      {header}

      <p className="eyebrow mt-6">At a glance</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link key={card.label} href={card.href} className="card card-interactive p-4">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{card.value}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{card.label}</p>
            {card.hint ? <p className="mt-0.5 text-[11px] text-slate-500">{card.hint}</p> : null}
          </Link>
        ))}
        {statCards.length === 0 ? (
          <div className="card col-span-full p-4">
            <p className="text-sm font-medium text-slate-600">Nothing is waiting on you right now.</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Attention required</SectionTitle>
          <div className="mt-4">
            {data.attention.length === 0 ? (
              <EmptyState
                title="Nothing requires your attention"
                description="There are currently no escalations, concerns or overdue follow-ups waiting on you."
              />
            ) : (
              <ul className="space-y-2">
                {data.attention.map((item, index) => (
                  <li key={`${item.kind}-${item.id ?? index}`}>
                    <Link
                      href={item.href}
                      className="card card-interactive flex items-start justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                          <Badge tone={uiTone(priorityTone(item.priority))}>
                            {KIND_LABEL[item.kind] ?? humanLabel(item.kind)}
                          </Badge>
                          {item.label}
                        </p>
                        {item.detail ? (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.detail}</p>
                        ) : null}
                      </div>
                      {item.reference ? (
                        <span className="shrink-0 text-[11px] font-medium text-slate-500">{item.reference}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle>Today&apos;s activity</SectionTitle>
          <div className="mt-4">
            {data.today.length === 0 ? (
              <EmptyState
                title="Nothing scheduled today"
                description="Supervision sessions, reviews, follow-ups and meetings for today will appear here."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.today.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-700">{item.title}</p>
                      <p className="text-[11px] text-slate-500">{KIND_LABEL[item.kind] ?? humanLabel(item.kind)}</p>
                    </div>
                    <Badge tone={uiTone(statusTone(item.status))} dot>
                      {statusLabel(item.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <SectionTitle>Recent activity</SectionTitle>
          <div className="mt-4">
            {data.recent.length === 0 ? (
              <EmptyState
                title="No recent activity"
                description="Actions on concerns, reviews, supervision and interventions will be recorded here."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recent.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-700">
                        {item.actorName ? `${item.actorName} ` : ""}
                        {humanLabel(item.action)}
                        {item.toStatus ? ` → ${statusLabel(item.toStatus)}` : ""}
                      </p>
                      {item.detail ? (
                        <p className="truncate text-[11px] text-slate-500">{item.detail}</p>
                      ) : null}
                    </div>
                    <time className="shrink-0 text-[11px] text-slate-500" dateTime={item.createdAt}>
                      {formatDateTime(item.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

/** Kept local so the dashboard never depends on the shell's module graph. */
function supervisorRoot(): string {
  return "/portal/clinical_supervisor";
}
