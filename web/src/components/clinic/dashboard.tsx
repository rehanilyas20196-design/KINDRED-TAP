"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClinicPage } from "@/components/clinic/shell";
import type { AuthUser } from "@/lib/api";
import type { PortalMeta } from "@/lib/portals";
import { Badge, EmptyState, Panel, StatTile } from "@/components/clinic/ui";
import {
  Alert,
  Button,
  EmptyState as ErrorEmptyState,
  LinkButton,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import QrInviteCard from "@/components/qr-invite-card";
import {
  fetchDashboard,
  formatDay,
  formatDateTime,
  formatMoney,
  priorityTone,
  statusTone,
  titleCase,
  type DashboardData,
} from "@/lib/clinic";

/**
 * The partnership dashboard.
 *
 * Every figure is the server's own count or SUM - nothing here is derived in the
 * browser, so the tiles cannot drift from the referral and commission tables.
 * Layout follows the spec's hierarchy: partnership and commission summaries on
 * top, then recent referrals and attention, then clients and transactions.
 */
export default function ClinicDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchDashboard());
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (error && !data) {
    return (
      <ClinicPage>
        <PageTitle>Dashboard</PageTitle>
        <ErrorEmptyState
          title="We could not load your dashboard"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      </ClinicPage>
    );
  }

  if (!data) {
    return (
      <ClinicPage>
        <PageTitle>Dashboard</PageTitle>
        <LoadingState label="Loading your partnership" />
      </ClinicPage>
    );
  }

  return <ClinicPage>{<ClinicBody data={data} error={error} onRetry={load} />}</ClinicPage>;
}

/**
 * The dashboard body, separate from the shell so the router in
 * `dashboard-client.tsx` can wrap it in `ClinicShell` exactly as it does for the
 * other three framed portals - the shell is applied in one place, not twice.
 */
export function ClinicHome({ user, portal }: { user: AuthUser; portal: PortalMeta }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchDashboard());
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (error && !data) {
    return (
      <>
        <PageTitle>Dashboard</PageTitle>
        <ErrorEmptyState
          title="We could not load your dashboard"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageTitle>Dashboard</PageTitle>
        <LoadingState label="Loading your partnership" />
      </>
    );
  }

  return (
    <>
      <ClinicBody data={data} error={error} onRetry={load} />
      <QrInviteCard role="collaborative_clinic" />
    </>
  );
}

function ClinicBody({
  data,
  error,
  onRetry,
}: {
  data: DashboardData;
  error: string | null;
  onRetry: () => void;
}) {

  const { counts, commission, organization, partnership } = data;
  const money = (value: number) => formatMoney(value, commission.currency);
  const hasActivity = counts.receivedReferrals + counts.sentReferrals > 0;
  const countHint = (value: number, suffix: string) => (value > 0 ? `${value} ${suffix}` : undefined);

  return (
      <div className="space-y-6">
        {error ? (
          <Alert
            tone="danger"
            action={<Button size="sm" onClick={() => void onRetry()}>Try again</Button>}
          >
            {error}
          </Alert>
        ) : null}

        <PageTitle
          description={`Your partnership with ${data.kindredTap.name}: referrals, clients, commission and performance.`}
          action={<LinkButton href={`${CLINIC_LINK}/referrals/sent?new=1`}>Send a referral</LinkButton>}
        >
          {organization.name}
        </PageTitle>

        {/* Active partnership */}
        {partnership ? (
          <Panel title="Active Partnership">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {partnership.name}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {partnership.renewalDate ? (
                    <>
                      Renews{" "}
                      <time dateTime={partnership.renewalDate}>
                        {formatDay(partnership.renewalDate)}
                      </time>
                    </>
                  ) : (
                    "No renewal date recorded"
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(partnership.status)}>{titleCase(partnership.status)}</Badge>
                <Link
                  href={`${CLINIC_LINK}/partnerships`}
                  className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                >
                  Open
                </Link>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel title="Partnership">
            <EmptyState
              title="No active partnership yet"
              body="Once Kindred Tap approves your partnership agreement, your referrals, commission and performance all appear here."
              action={
                <LinkButton href={`${CLINIC_LINK}/partnerships`}>View partnerships</LinkButton>
              }
            />
          </Panel>
        )}

        {/* Referral summary */}
        <section aria-labelledby="referral-summary">
          <h2 id="referral-summary" className="sr-only">
            Referral summary
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile
              label="Received Referrals"
              value={counts.receivedReferrals}
              hint={countHint(counts.receivedPending, "awaiting action")}
              href={`${CLINIC_LINK}/referrals/received`}
            />
            <StatTile
              label="Sent Referrals"
              value={counts.sentReferrals}
              hint={countHint(counts.sentPending, "awaiting action")}
              href={`${CLINIC_LINK}/referrals/sent`}
            />
            <StatTile
              label="Active Clients"
              value={counts.activeReferredClients}
              hint={countHint(counts.inProgressClients, "in progress")}
              href={`${CLINIC_LINK}/clients`}
            />
            <StatTile
              label="Completed Referrals"
              value={counts.completedReceived}
              hint={countHint(counts.completedThisMonth, "this month")}
            />
            <StatTile label="Pending Referrals" value={counts.receivedPending} hint="Need review" />
            <StatTile
              label="Conversion Rate"
              value={counts.conversionRate === null ? "-" : `${counts.conversionRate}%`}
              hint="Received referrals completed"
            />
          </div>
        </section>

        {/* Commission summary */}
        <Panel title="Commission Summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Commission Earned"
              value={money(commission.totalEarned)}
              hint={countHint(commission.thisMonth, "this month")}
            />
            <StatTile label="Pending Commission" value={money(commission.pending)} hint="Awaiting verification" />
            <StatTile label="Approved" value={money(commission.approved)} hint="Ready for payout" />
            <StatTile
              label="Paid Commission"
              value={money(commission.paid)}
              hint={countHint(commission.thisYear, "this year")}
            />
          </div>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            {data.upcomingAppointments} upcoming appointment{data.upcomingAppointments === 1 ? "" : "s"} in the next 30 days.{" "}
            <Link
              href={`${CLINIC_LINK}/commission`}
              className="font-semibold text-teal-700 hover:underline dark:text-teal-300"
            >
              See commission detail
            </Link>
          </p>
        </Panel>

        {/* Middle: attention, then recent referrals */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Attention Required">
            {data.attention.length === 0 ? (
              <EmptyState
                title="Nothing needs your attention"
                body="No referrals waiting on review, no unscheduled appointments and no commission awaiting verification."
              />
            ) : (
              <ul className="space-y-2.5">
                {data.attention.map((item, index) => (
                  <li key={`${item.kind}-${item.id ?? index}`}>
                    <Link
                      href={item.href}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 transition hover:border-amber-300 dark:border-amber-500/30 dark:bg-amber-500/10"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                          {item.label}
                        </span>
                        {item.detail ? (
                          <span className="mt-0.5 block text-[11px] text-amber-700 dark:text-amber-300">
                            {item.detail}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        Review
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Recent Referrals"
            action={
              <Link
                href={`${CLINIC_LINK}/referrals/history`}
                className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
              >
                All referrals
              </Link>
            }
          >
            {!hasActivity ? (
              <EmptyState
                title="No referrals yet"
                body="Your clinic has not received or sent any referrals yet."
              />
            ) : data.recentReferrals.length === 0 ? (
              <EmptyState title="No referrals yet" body="Your clinic has not received or sent any referrals yet." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recentReferrals.map((referral) => (
                  <li key={referral.id} className="py-3 first:pt-0 last:pb-0">
                    <Link href={`${CLINIC_LINK}/referrals/${referral.id}`} className="block">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                            {referral.reference} &middot; {referral.serviceName}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {referral.direction === "inbound" ? "Received from" : "Sent to"}{" "}
                            {referral.direction === "inbound"
                              ? referral.sendingOrganization
                              : referral.receivingOrganization}{" "}
                            &middot;{" "}
                            <time dateTime={referral.createdAt}>
                              {formatDateTime(referral.createdAt)}
                            </time>
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge tone={statusTone(referral.status)}>{titleCase(referral.status)}</Badge>
                          {referral.priority !== "normal" ? (
                            <Badge tone={priorityTone(referral.priority)}>
                              {titleCase(referral.priority)}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Bottom: clients, then commission transactions */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel
            title="Recent Clients"
            action={
              <Link
                href={`${CLINIC_LINK}/clients`}
                className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
              >
                All clients
              </Link>
            }
          >
            {data.recentClients.length === 0 ? (
              <EmptyState
                title="No referred clients yet"
                body="Clients connected to your partnership appear here once a referral has been received or sent."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recentClients.map((client) => (
                  <li key={client.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <Link href={`${CLINIC_LINK}/clients/${client.id}`} className="min-w-0 block">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {client.clientReference}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {client.serviceName} &middot;{" "}
                        {client.nextAppointmentAt ? (
                          <>
                            Next{" "}
                            <time dateTime={client.nextAppointmentAt}>
                              {formatDay(client.nextAppointmentAt)}
                            </time>
                          </>
                        ) : (
                          <>
                            Last activity{" "}
                            <time dateTime={client.lastActivity}>{formatDay(client.lastActivity)}</time>
                          </>
                        )}
                      </p>
                    </Link>
                    <Badge tone={statusTone(client.status)}>{titleCase(client.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Recent Commission Transactions"
            action={
              <Link
                href={`${CLINIC_LINK}/commission`}
                className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
              >
                All transactions
              </Link>
            }
          >
            {data.recentCommissions.length === 0 ? (
              <EmptyState
                title="No commission yet"
                body="Commission appears once a referral is completed, calculated from the agreement in force."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recentCommissions.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <Link href={`${CLINIC_LINK}/commission/${row.id}`} className="min-w-0 block">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {row.reference}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {row.serviceName} &middot; {row.clientReference} &middot;{" "}
                        <time dateTime={row.createdAt}>{formatDay(row.createdAt)}</time>
                      </p>
                    </Link>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {formatMoney(row.amountMinor, row.currency)}
                      </span>
                      <Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Partnership activity */}
        <Panel title="Partnership Activity">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ActivityStat label="Referrals received" value={counts.receivedReferrals} />
            <ActivityStat label="Referrals sent" value={counts.sentReferrals} />
            <ActivityStat label="Declined" value={counts.declinedReceived} />
            <ActivityStat label="Clients completed" value={counts.completedClients} />
          </dl>
        </Panel>
      </div>
  );
}

function ActivityStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}

const CLINIC_LINK = "/portal/collaborative-clinic";
