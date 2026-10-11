"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  usePortalGuard,
  GuardSplash,
  SignedOutPanel,
  WrongPortalPanel,
} from "@/components/portal-guard";
import { DashboardShell, JourneyCard, DashboardCard } from "@/components/dashboard";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LinkButton,
  LoadingState,
  Skeleton,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { portalFor, type PortalMeta } from "@/lib/portals";
import { apiFetch, apiPost, messageFor, type AuthUser } from "@/lib/api";
import { EthicsBadge } from "@/components/ethics-badge";
import { TherapistHome } from "@/components/therapist/home";
import { TherapistShell } from "@/components/therapist/shell";
import { AdvisorHome } from "@/components/advisor/home";
import { AdvisorShell } from "@/components/advisor/shell";
import { SupervisorHome } from "@/components/supervisor/home";
import { SupervisorShell } from "@/components/supervisor/shell";
import { ClinicHome } from "@/components/clinic/dashboard";
import { ClinicShell } from "@/components/clinic/shell";
import { EscalationModal } from "@/components/escalation-modal";
import QrInviteCard from "@/components/qr-invite-card";
import { fetchCurrentConcern } from "@/lib/clinical";

/* ------------------------------------------------------------------ */
/* Per-portal panels                                                   */
/* ------------------------------------------------------------------ */

function UserDashboard({ portal }: { user: AuthUser; portal: PortalMeta }) {
  const [hasConcern, setHasConcern] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchCurrentConcern();
      setHasConcern(data.hasCurrentConcern);
      setError(null);
    } catch (err) {
      setHasConcern(null);
      setError(messageFor(err));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  function reload() {
    setChecking(true);
    setError(null);
    setHasConcern(null);
    void load();
  }

  // A failed request never sends anyone anywhere: it settles right here and
  // can be retried. Error, loading, "start the assessment" and real content
  // are each shown alone so they never overlap.
  if (error !== null) {
    return (
      <EmptyState
        title="We could not load your dashboard"
        description={error}
        action={<Button onClick={reload}>Try again</Button>}
      />
    );
  }

  if (checking || hasConcern === null) {
    return (
      <div className="space-y-6">
        <JourneyCard portal={portal} completedCount={0} />
        <div className="card p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-3 w-full max-w-md" />
          <Skeleton className="mt-2 h-3 w-full max-w-sm" />
          <p className="sr-only" role="status">
            Loading your dashboard…
          </p>
        </div>
      </div>
    );
  }

  if (!hasConcern) {
    return (
      <EmptyState
        icon={<Icon name="assessments" className="h-5 w-5" />}
        title="Let’s start with your assessment"
        description="A few questions about how you have been feeling help us match you with the right therapist. It only takes a couple of minutes."
        action={<LinkButton href="/portal/user/assessment">Start your assessment</LinkButton>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <JourneyCard portal={portal} completedCount={1} />

      {/* Primary next step */}
      <section className="card overflow-hidden p-0">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="min-w-0">
            <Badge tone="accent" dot>
              Next step
            </Badge>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              See the therapists matched to you
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Based on your assessment, these are the professionals who specialise in what you are
              dealing with. Nothing reaches a therapist until you write first.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2.5">
            <LinkButton href="/portal/user/matching">See matched therapists</LinkButton>
            <LinkButton href="/portal/user/messages" variant="secondary">
              My messages
            </LinkButton>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200 bg-slate-50 px-6 py-3.5 text-xs text-slate-500 sm:px-7">
          <span className="inline-flex items-center gap-2">
            <span className="status-dot bg-teal-600" aria-hidden="true" />
            Assessment complete
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="status-dot bg-sky-500" aria-hidden="true" />
            Private by default
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="status-dot bg-amber-500" aria-hidden="true" />
            You control who you contact
          </span>
        </div>
      </section>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ActionTile
          href="/portal/user/assessment"
          icon="assessments"
          title="Retake your assessment"
          description="Update how you have been feeling so your matches stay accurate."
        />
        <ActionTile
          href="/portal/user/support"
          icon="safety"
          title="Support & safety"
          description="Urgent help, your therapist, sessions, the assistant and privacy settings."
        />
      </div>
    </div>
  );
}

function ActionTile({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: import("@/components/icons").IconName;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="card card-interactive group flex items-start gap-4 p-5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100 transition group-hover:bg-teal-700 group-hover:text-white group-hover:ring-teal-700">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          {title}
          <Icon
            name="arrowRight"
            className="h-4 w-4 -translate-x-1 text-slate-500 transition group-hover:translate-x-0 group-hover:text-teal-700"
          />
        </span>
        <span className="mt-1 block text-sm leading-6 text-slate-500">{description}</span>
      </span>
    </Link>
  );
}

/** Shape of a matched peer-support request from /api/supporter/requests. */
interface SupporterRequest {
  id: string;
  clientAlias: string;
  ageRange: string;
  topic: string;
  summary: string;
  urgency: string;
  matchScore: number;
  status: string;
}

function SupporterDashboard({ portal }: { user: AuthUser; portal: PortalMeta }) {
  // `null` means "never loaded", so a failure can be told apart from a
  // genuinely quiet day of requests instead of seeding an empty list.
  const [requests, setRequests] = useState<SupporterRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(
    null
  );
  const [isEscalateOpen, setIsEscalateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ requests: SupporterRequest[] }>("/api/supporter/requests");
      setRequests(data.requests || []);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  function reload() {
    setRequests(null);
    setError(null);
    void load();
  }

  async function acceptRequest(id: string) {
    setAcceptingId(id);
    setNotice(null);
    try {
      await apiPost(`/api/supporter/requests/${id}/accept`, {});
      setRequests((prev) =>
        (prev ?? []).map((r) => (r.id === id ? { ...r, status: "accepted" } : r))
      );
      setNotice({
        tone: "success",
        text: "Request accepted — the session room is ready whenever you are.",
      });
    } catch (err) {
      setNotice({ tone: "danger", text: messageFor(err) });
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <EthicsBadge roleTitle="Peer Supporter" />
        <JourneyCard portal={portal} completedCount={2} />

        {/* Matched Requests */}
        <DashboardCard
          title="Matched Support Requests"
          action={
            requests !== null && requests.length > 0 ? (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {requests.length} Matched
              </span>
            ) : null
          }
        >
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            Incoming peer support requests matched to your lived experience and availability.
          </p>

          {error !== null && requests === null ? (
            <div className="mt-4">
              <EmptyState
                title="We could not load your dashboard"
                description={error}
                action={<Button onClick={reload}>Try again</Button>}
              />
            </div>
          ) : requests === null ? (
            <div className="mt-4">
              <LoadingState label="Finding your matched requests" />
            </div>
          ) : requests.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={<Icon name="safety" className="h-5 w-5" />}
                title="No matched requests yet"
                description="Requests that fit your lived experience and availability will appear here as soon as they come in."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {req.clientAlias} ({req.ageRange})
                      </span>
                      <span className="rounded-full bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                        {req.matchScore}% Match
                      </span>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        Urgency: {req.urgency}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-teal-700 dark:text-teal-300">
                      Topic: {req.topic}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                      {req.summary}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {req.status === "accepted" ? (
                      <LinkButton
                        href="/portal/supporter/supporter-session"
                        size="sm"
                      >
                        Enter Peer Session
                        <Icon name="arrowRight" className="h-3.5 w-3.5" />
                      </LinkButton>
                    ) : (
                      <Button
                        size="sm"
                        loading={acceptingId === req.id}
                        disabled={acceptingId !== null && acceptingId !== req.id}
                        onClick={() => void acceptRequest(req.id)}
                      >
                        Accept Request
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {notice ? (
            <div className="mt-4">
              <Alert tone={notice.tone}>{notice.text}</Alert>
            </div>
          ) : null}
        </DashboardCard>

        {/* Peer Support Session Workspace */}
        <DashboardCard
          title="Provide Peer Support & Complete Session"
          action={
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-700 hover:text-rose-800"
              onClick={() => setIsEscalateOpen(true)}
            >
              Escalate concern
            </Button>
          }
        >
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            Provide empathetic peer support in real-time, document session notes, escalate safeguarding concerns when needed, and complete peer support sessions.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <LinkButton href="/portal/supporter/supporter-session">
              Provide Peer Support &amp; Complete Session
              <Icon name="arrowRight" className="h-4 w-4" />
            </LinkButton>
            <Button variant="danger" onClick={() => setIsEscalateOpen(true)}>
              Safeguarding Escalation
            </Button>
          </div>
        </DashboardCard>
      </div>

      <QrInviteCard role="supporter" />

      <EscalationModal
        isOpen={isEscalateOpen}
        onClose={() => setIsEscalateOpen(false)}
        sessionId="session-req-sup-101"
        clientAlias="Matched Peer Client"
        role="supporter"
      />
    </>
  );
}

function TherapistDashboard({ user, portal }: { user: AuthUser; portal: PortalMeta }) {
  return <TherapistHome user={user} portal={portal} />;
}

function AdvisorDashboard({ user, portal }: { user: AuthUser; portal: PortalMeta }) {
  return <AdvisorHome user={user} portal={portal} />;
}

function SupervisorDashboard({ user, portal }: { user: AuthUser; portal: PortalMeta }) {
  return <SupervisorHome user={user} portal={portal} />;
}

function ClinicDashboard({ user, portal }: { user: AuthUser; portal: PortalMeta }) {
  return <ClinicHome user={user} portal={portal} />;
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

const DASHBOARDS: Record<string, (props: { user: AuthUser; portal: PortalMeta }) => React.ReactElement> = {
  user: UserDashboard,
  supporter: SupporterDashboard,
  therapist: TherapistDashboard,
  clinical_advisor: AdvisorDashboard,
  clinical_supervisor: SupervisorDashboard,
  collaborative_clinic: ClinicDashboard,
};

export default function PortalDashboardClient({ role }: { role: string }) {
  const guard = usePortalGuard(role);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }

  const Dashboard = DASHBOARDS[role];
  const portal = portalFor(role);

  if (!Dashboard || !portal) {
    return (
      <GuardSplash label="">
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          We could not open that portal.{" "}
          <Link href="/login" className="font-semibold text-teal-700 dark:text-teal-300">
            Back to login
          </Link>
        </p>
      </GuardSplash>
    );
  }

  // The therapist and advisor portals have their own frames: a persistent
  // section nav for clinical work. Every other portal keeps the original
  // single-column shell.
  if (role === "therapist") {
    return (
      <TherapistShell portal={portal} user={guard.user}>
        <Dashboard user={guard.user} portal={portal} />
      </TherapistShell>
    );
  }

  if (role === "clinical_advisor") {
    return (
      <AdvisorShell portal={portal} user={guard.user}>
        <Dashboard user={guard.user} portal={portal} />
      </AdvisorShell>
    );
  }

  if (role === "clinical_supervisor") {
    return (
      <SupervisorShell portal={portal} user={guard.user}>
        <Dashboard user={guard.user} portal={portal} />
      </SupervisorShell>
    );
  }

  if (role === "collaborative_clinic") {
    return (
      <ClinicShell portal={portal} user={guard.user}>
        <Dashboard user={guard.user} portal={portal} />
      </ClinicShell>
    );
  }

  return (
    <DashboardShell portal={portal} user={guard.user}>
      <Dashboard user={guard.user} portal={portal} />
    </DashboardShell>
  );
}
