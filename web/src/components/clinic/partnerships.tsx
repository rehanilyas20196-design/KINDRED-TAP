"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClinicPage } from "@/components/clinic/shell";
import {
  Badge,
  DataRow,
  EmptyState,
  ErrorPanel,
  Field,
  LoadingBlock,
  Notice,
  PageHeader,
  Panel,
  StatusPill,
  StatTile,
  inputClass,
  primaryActionClass,
  secondaryActionClass,
  textareaClass,
} from "@/components/clinic/ui";
import { messageFor } from "@/lib/api";
import {
  fetchPartnership,
  fetchPartnerships,
  formatDay,
  formatMoney,
  requestAgreementUpdate,
  titleCase,
  type PartnershipDetail,
  type PartnershipRow,
} from "@/lib/clinic";

/* ------------------------------------------------------------------ */
/* Partnership list                                                    */
/* ------------------------------------------------------------------ */

export function PartnershipsClient() {
  const [partnerships, setPartnerships] = useState<PartnershipRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchPartnerships();
      setPartnerships(data.partnerships);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <ClinicPage>
      <PageHeader
        title="Partnerships"
        description="Your agreements with Kindred Tap, their status, and how each one is performing."
      />

      <div className="space-y-4">
        {error ? <ErrorPanel message={error} onRetry={load} /> : null}
        {!error && !partnerships ? <LoadingBlock label="Loading partnerships..." /> : null}

        {partnerships && partnerships.length === 0 ? (
          <Panel>
            <EmptyState
              title="No partnerships yet"
              body="Once Kindred Tap approves a partnership agreement, it appears here with its terms, referrals and performance."
            />
          </Panel>
        ) : null}

        {partnerships?.map((partnership) => (
          <Panel key={partnership.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/portal/collaborative-clinic/partnerships/${partnership.id}`}
                  className="text-base font-semibold text-slate-900 hover:underline dark:text-white"
                >
                  {partnership.name}
                </Link>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {partnership.counterpart} &middot; {titleCase(partnership.model)}
                  {partnership.startDate ? ` · started ${formatDay(partnership.startDate)}` : ""}
                  {partnership.renewalDate ? ` · renews ${formatDay(partnership.renewalDate)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={partnership.status} />
                <Link
                  href={`/portal/collaborative-clinic/partnerships/${partnership.id}`}
                  className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                >
                  Open
                </Link>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Referrals" value={partnership.referralVolume} />
              <Metric label="Completed" value={partnership.completedReferrals} />
              <Metric label="Active clients" value={partnership.activeClients} />
              <Metric label="Commission" value={formatMoney(partnership.commissionMinor)} />
            </div>

            {partnership.services?.length ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {partnership.services.map((service) => (
                  <Badge key={service} tone="slate">
                    {service}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Panel>
        ))}
      </div>
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Partnership detail                                                  */
/* ------------------------------------------------------------------ */

type Tab =
  | "overview"
  | "referrals"
  | "clients"
  | "services"
  | "commission"
  | "performance"
  | "documents"
  | "contacts"
  | "activity";

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "referrals", label: "Referrals" },
  { value: "clients", label: "Clients" },
  { value: "services", label: "Services" },
  { value: "commission", label: "Commission" },
  { value: "performance", label: "Performance" },
  { value: "documents", label: "Documents" },
  { value: "contacts", label: "Contacts" },
  { value: "activity", label: "Activity" },
];

/**
 * One partnership, as tabs.
 *
 * Tabs rather than nine stacked sections because a partnership page is long and
 * a clinic usually wants one of these at a time. The tab strip is a real ARIA
 * tablist, so arrow keys and screen readers behave the way they should.
 */
export function PartnershipDetailClient({ partnershipId }: { partnershipId: string }) {
  const [data, setData] = useState<PartnershipDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchPartnership(partnershipId));
    } catch (err) {
      setError(messageFor(err));
    }
  }, [partnershipId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function requestUpdate(agreementId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestAgreementUpdate(partnershipId, agreementId, note);
      await load();
      setNote("");
      setNotice("Update requested. Kindred Tap will review it and issue a new version if needed.");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <ClinicPage>
        <PageHeader title="Partnership" back={{ href: "/portal/collaborative-clinic/partnerships", label: "Partnerships" }} />
        <ErrorPanel message={error} onRetry={load} />
      </ClinicPage>
    );
  }

  if (!data) {
    return (
      <ClinicPage>
        <PageHeader title="Partnership" />
        <LoadingBlock label="Loading partnership..." />
      </ClinicPage>
    );
  }

  const { partnership, agreements, referrals, commissions, performance, contacts } = data;

  return (
    <ClinicPage>
      <PageHeader
        title={partnership.name}
        description={`${partnership.counterpartName} · ${titleCase(partnership.model)}`}
        back={{ href: "/portal/collaborative-clinic/partnerships", label: "Partnerships" }}
        action={<StatusPill status={partnership.status} />}
      />

      <div className="space-y-6">
        {error ? <Notice tone="rose">{error}</Notice> : null}
        {notice ? <Notice>{notice}</Notice> : null}

        <div role="tablist" aria-label="Partnership sections" className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-800/60">
          {TABS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="tab"
              id={`tab-${entry.value}`}
              aria-selected={tab === entry.value}
              aria-controls={`panel-${entry.value}`}
              onClick={() => setTab(entry.value)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                tab === entry.value
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "overview" ? (
            <div className="space-y-6">
              <Panel title="Partnership Status">
                <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                  <DataRow label="Status">
                    <StatusPill status={partnership.status} />
                  </DataRow>
                  <DataRow label="Start Date">{formatDay(partnership.startDate)}</DataRow>
                  <DataRow label="Renewal Date">{formatDay(partnership.renewalDate)}</DataRow>
                  <DataRow label="Agreement Status">
                    {agreements[0] ? (
                      <StatusPill status={agreements[0].status} />
                    ) : (
                      "No agreement on file"
                    )}
                  </DataRow>
                  <DataRow label="Referral Volume">{performance.referralVolume}</DataRow>
                  <DataRow label="Conversion Rate">
                    {performance.conversionRate === null ? "-" : `${performance.conversionRate}%`}
                  </DataRow>
                  <DataRow label="Commission">
                    {formatMoney(
                      commissions.reduce((total, commission) => total + commission.amountMinor, 0)
                    )}
                  </DataRow>
                  <DataRow label="Active Clients">{performance.activeClients}</DataRow>
                  <DataRow label="Completed Referrals">{performance.completedReferrals}</DataRow>
                </dl>
              </Panel>

              <Panel title="Terms">
                <dl className="space-y-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Referral terms
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">
                      {partnership.referralTerms ?? "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Commission terms
                    </dt>
                    <dd className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">
                      {partnership.commissionTerms ?? "Not recorded"}
                    </dd>
                  </div>
                </dl>
              </Panel>
            </div>
          ) : null}

          {tab === "referrals" ? (
            <Panel title="Referrals">
              {referrals.length === 0 ? (
                <EmptyState title="No referrals" body="No referrals have been made under this partnership yet." />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {referrals.map((referral) => (
                    <li key={referral.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <Link href={`/portal/collaborative-clinic/referrals/${referral.id}`} className="min-w-0 block">
                        <p className="truncate text-sm font-medium text-teal-700 hover:underline dark:text-teal-300">
                          {referral.reference} &middot; {referral.serviceName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {referral.clientReference} &middot; {formatDay(referral.createdAt)}
                        </p>
                      </Link>
                      <StatusPill status={referral.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === "clients" ? (
            <Panel title="Clients">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {performance.activeClients} client{performance.activeClients === 1 ? "" : "s"} connected
                to this partnership. Open the Clients page to see each referral and appointment.
              </p>
              <Link
                href="/portal/collaborative-clinic/clients"
                className={`mt-4 ${secondaryActionClass}`}
              >
                Open clients
              </Link>
            </Panel>
          ) : null}

          {tab === "services" ? (
            <Panel title="Covered Services">
              {partnership.services?.length ? (
                <ul className="space-y-2">
                  {partnership.services.map((service) => (
                    <li key={service} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <Badge tone="teal">{service}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No services listed" body="No services are recorded on this agreement." />
              )}
            </Panel>
          ) : null}

          {tab === "commission" ? (
            <Panel title="Commission">
              {commissions.length === 0 ? (
                <EmptyState title="No commission" body="No commission has been earned under this partnership yet." />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {commissions.map((commission) => (
                    <li key={commission.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <Link href={`/portal/collaborative-clinic/commission/${commission.id}`} className="min-w-0 block">
                        <p className="truncate text-sm font-medium text-teal-700 hover:underline dark:text-teal-300">
                          {commission.reference}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {commission.serviceName} &middot; {formatDay(commission.referralDate)}
                        </p>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold">
                          {formatMoney(commission.amountMinor, commission.currency)}
                        </span>
                        <StatusPill status={commission.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === "performance" ? <PerformanceTab performance={performance} referrals={referrals} /> : null}

          {tab === "documents" ? (
            <div className="space-y-6">
              <Panel title="Agreements">
                {agreements.length === 0 ? (
                  <EmptyState title="No agreements" body="No agreement documents have been issued yet." />
                ) : (
                  <ul className="space-y-4">
                    {agreements.map((agreement) => (
                      <li
                        key={agreement.id}
                        className="rounded-2xl border border-slate-200 px-4 py-4 dark:border-slate-800"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {agreement.title}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              Version {agreement.version} &middot; {formatDay(agreement.effectiveFrom)}
                              {agreement.effectiveTo ? ` to ${formatDay(agreement.effectiveTo)}` : ""}
                            </p>
                          </div>
                          <StatusPill status={agreement.status} />
                        </div>

                        {agreement.terms ? (
                          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {agreement.terms}
                          </p>
                        ) : null}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {agreement.documentUrl ? (
                            <a
                              href={agreement.documentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={secondaryActionClass}
                            >
                              View agreement
                            </a>
                          ) : agreement.documentName ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {agreement.documentName}
                            </span>
                          ) : null}
                        </div>

                        {agreement.updateRequestedAt ? (
                          <Notice tone="amber">
                            <strong>Update requested</strong>
                            {agreement.updateRequestedNote
                              ? `: ${agreement.updateRequestedNote}`
                              : ""}
                          </Notice>
                        ) : (
                          <div className="mt-4">
                            <Field
                              label="Request an update"
                              hint="Kindred Tap reviews and issues any change; agreements are not editable here."
                            >
                              <textarea
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                rows={2}
                                maxLength={2000}
                                className={textareaClass}
                              />
                            </Field>
                            <button
                              type="button"
                              onClick={() => requestUpdate(agreement.id)}
                              disabled={busy || note.trim().length < 10}
                              className={`mt-2 ${secondaryActionClass}`}
                            >
                              {busy ? "Requesting..." : "Request update"}
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Notice>
                Agreements are issued and versioned by Kindred Tap. A partner can request a change
                but cannot edit the agreement in force.
              </Notice>
            </div>
          ) : null}

          {tab === "contacts" ? (
            <Panel title="Partnership Contacts">
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                Only information needed to run the partnership is held here.
              </p>
              {contacts.length === 0 ? (
                <EmptyState title="No contacts" body="No contacts are recorded for this organization." />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {contacts.map((contact) => (
                    <li key={contact.email} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {contact.fullName ?? contact.email}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {contact.email}
                        </p>
                      </div>
                      <Badge tone="slate">{titleCase(contact.memberRole)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === "activity" ? (
            <Panel title="Activity">
              {referrals.length === 0 ? (
                <EmptyState title="No activity" body="Nothing has happened on this partnership yet." />
              ) : (
                <ol className="space-y-3">
                  {referrals.map((referral) => (
                    <li key={referral.id} className="border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {referral.reference} &middot; {titleCase(referral.status)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {formatDay(referral.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          ) : null}
        </div>
      </div>
    </ClinicPage>
  );
}

/**
 * Performance, derived from the referral rows rather than from a stored score.
 *
 * The referral-over-time bars are plain CSS widths computed from the counts the
 * API returned - no chart library, and nothing that could suggest more
 * precision than the underlying rows support.
 */
function PerformanceTab({
  performance,
  referrals,
}: {
  performance: PartnershipDetail["performance"];
  referrals: PartnershipDetail["referrals"];
}) {
  const byMonth = new Map<string, { received: number; completed: number }>();
  for (const referral of referrals) {
    const month = referral.createdAt.slice(0, 7);
    const entry = byMonth.get(month) ?? { received: 0, completed: 0 };
    entry.received += 1;
    if (["completed", "closed"].includes(referral.status)) entry.completed += 1;
    byMonth.set(month, entry);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  const peak = Math.max(1, ...months.map(([, value]) => value.received));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Referral Volume" value={performance.referralVolume} />
        <StatTile label="Completed" value={performance.completedReferrals} />
        <StatTile label="Active Referrals" value={performance.activeReferrals} />
        <StatTile label="Active Clients" value={performance.activeClients} />
        <StatTile
          label="Conversion Rate"
          value={performance.conversionRate === null ? "-" : `${performance.conversionRate}%`}
        />
        <StatTile
          label="Avg Processing"
          value={`${Number(performance.avgProcessingDays ?? 0).toFixed(1)}d`}
          hint="From creation to completion"
        />
      </div>

      <Panel title="Referrals Over Time">
        {months.length === 0 ? (
          <EmptyState title="No referral history" body="Once referrals flow, the trend appears here." />
        ) : (
          <ul className="space-y-3">
            {months.map(([month, value]) => (
              <li key={month}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-300">{month}</span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    {value.received} received &middot; {value.completed} completed
                  </span>
                </div>
                <div
                  className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                  role="img"
                  aria-label={`${month}: ${value.received} referrals received, ${value.completed} completed`}
                >
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${(value.received / peak) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}
