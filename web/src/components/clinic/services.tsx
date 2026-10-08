"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClinicPage } from "@/components/clinic/shell";
import {
  EmptyState,
  ErrorPanel,
  FilterBar,
  LoadingBlock,
  Notice,
  Paginator,
  PageHeader,
  Panel,
  SearchField,
  SegmentedControl,
  StatusPill,
  type Column,
} from "@/components/clinic/ui";
import {
  Badge,
  DataTable,
  StatTile,
} from "@/components/clinic/ui";
import { messageFor } from "@/lib/api";
import {
  createReferralLink,
  fetchClients,
  fetchMarketingAssets,
  fetchReferralLinks,
  fetchServices,
  formatDay,
  formatMoney,
  recordPromotion,
  titleCase,
  type ClientList,
  type ClientRow,
  type MarketingAsset,
  type ReferralLink,
  type ServiceRow,
} from "@/lib/clinic";

const PAGE_SIZE = 25;

/* ------------------------------------------------------------------ */
/* Clients                                                             */
/* ------------------------------------------------------------------ */

export function ClientsClient() {
  const [data, setData] = useState<ClientList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "active" | "completed" | "pending">("all");
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchClients({ view, limit: PAGE_SIZE, offset, q: search || undefined }));
    } catch (err) {
      setError(messageFor(err));
    }
  }, [view, offset, search]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void (async () => {
          await load();
        })(),
      search ? 300 : 0
    );
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const columns: Column<ClientRow>[] = [
    {
      key: "client",
      header: "Client ID",
      render: (row) => (
        <Link
          href={`/portal/collaborative-clinic/clients/${row.id}`}
          className="font-medium text-teal-700 hover:underline dark:text-teal-300"
        >
          {row.clientReference}
        </Link>
      ),
    },
    { key: "source", header: "Referral Source", render: (row) => row.referralSource },
    { key: "date", header: "Referral Date", render: (row) => formatDay(row.referralDate) },
    { key: "service", header: "Service", render: (row) => row.serviceName },
    { key: "professional", header: "Assigned Professional", render: (row) => row.assignedProfessional ?? "-" },
    {
      key: "appointment",
      header: "Appointment Status",
      render: (row) => (row.appointmentStatus ? <StatusPill status={row.appointmentStatus} /> : "-"),
    },
    { key: "status", header: "Referral Status", render: (row) => <StatusPill status={row.referralStatus} /> },
    { key: "activity", header: "Last Activity", render: (row) => formatDay(row.lastActivity) },
    {
      key: "next",
      header: "Next Appointment",
      render: (row) => (row.nextAppointment ? formatDay(row.nextAppointment) : "-"),
    },
    { key: "outcome", header: "Outcome", render: (row) => (row.outcome ? titleCase(row.outcome) : "-") },
  ];

  return (
    <ClinicPage>
      <PageHeader
        title="Clients"
        description="Clients connected to your partnership through a referral. Referral and appointment information only."
      />

      <Panel>
        <FilterBar>
          <div className="min-w-56 flex-1">
            <SearchField
              value={search}
              onChange={(value) => {
                setSearch(value);
                setOffset(0);
              }}
              placeholder="Search by client ID, referral ID or service"
            />
          </div>
          <SegmentedControl
            ariaLabel="Filter clients by referral status"
            value={view}
            onChange={(value) => {
              setView(value);
              setOffset(0);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "pending", label: "Pending" },
              { value: "completed", label: "Completed" },
            ]}
          />
        </FilterBar>

        {error ? <ErrorPanel message={error} onRetry={load} /> : null}
        {!error && !data ? <LoadingBlock label="Loading clients..." /> : null}

        {data ? (
          <>
            <DataTable
              caption={`Tracked clients: ${data.total}`}
              columns={columns}
              rows={data.clients}
              empty={
                <EmptyState
                  title="No referred clients yet"
                  body="Clients connected to your partnership appear here once a referral involves them."
                />
              }
            />
            <Paginator
              total={data.total}
              limit={data.limit}
              offset={data.offset}
              onChange={setOffset}
              noun="clients"
            />
          </>
        ) : null}
      </Panel>

      <div className="mt-4">
        <Notice>
          This portal tracks referrals and outcomes. It does not give you access to therapy notes,
          assessments or treatment plans.
        </Notice>
      </div>
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Available services                                                  */
/* ------------------------------------------------------------------ */

export function ServicesClient() {
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchServices();
      setServices(data.services);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const filtered = useMemo(() => {
    if (!services) return [];
    if (!search) return services;
    const needle = search.toLowerCase();
    return services.filter(
      (service) =>
        service.name.toLowerCase().includes(needle) ||
        service.category.toLowerCase().includes(needle) ||
        (service.description ?? "").toLowerCase().includes(needle)
    );
  }, [services, search]);

  return (
    <ClinicPage>
      <PageHeader
        title="Available Services"
        description="Kindred Tap services you can refer into and promote, with eligibility and partner commission."
        action={
          <Link
            href="/portal/collaborative-clinic/promote"
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            Promote services
          </Link>
        }
      />

      <div className="space-y-4">
        <div className="max-w-md">
          <SearchField value={search} onChange={setSearch} placeholder="Search services" />
        </div>

        {error ? <ErrorPanel message={error} onRetry={load} /> : null}
        {!error && !services ? <LoadingBlock label="Loading services..." /> : null}

        {services && filtered.length === 0 ? (
          <EmptyState title="No services match" body="Try a different search term." />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((service) => (
            <Panel key={service.id} title={service.name}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="slate">{titleCase(service.category)}</Badge>
                <StatusPill status={service.availability} />
                <Badge tone={service.marketingStatus === "approved" ? "emerald" : "slate"}>
                  {titleCase(service.marketingStatus)}
                </Badge>
              </div>

              {service.description ? (
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {service.description}
                </p>
              ) : null}

              <dl className="mt-4 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                {service.eligibility ? (
                  <div className="flex gap-2">
                    <dt className="font-medium">Eligibility:</dt>
                    <dd>{service.eligibility}</dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt className="font-medium">Referral method:</dt>
                  <dd>{titleCase(service.referralMethod)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium">Price:</dt>
                  <dd>
                    {service.priceMinor > 0
                      ? formatMoney(service.priceMinor, service.priceCurrency)
                      : "No charge"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium">Partner commission:</dt>
                  <dd>
                    {service.commissionRule === "percentage"
                      ? `${service.commissionRateBp / 100}% of the service price`
                      : `${formatMoney(service.commissionFixedMinor, service.priceCurrency)} per completed referral`}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium">Your referrals:</dt>
                  <dd>{service.referralCount}</dd>
                </div>
              </dl>
            </Panel>
          ))}
        </div>
      </div>
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Promote services                                                    */
/* ------------------------------------------------------------------ */

export function PromoteClient() {
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [links, setLinks] = useState<ReferralLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [campaign, setCampaign] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [serviceData, linkData] = await Promise.all([fetchServices(), fetchReferralLinks()]);
      setServices(serviceData.services);
      setLinks(linkData.links);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function createLink(serviceId: string) {
    setCreating(serviceId);
    setError(null);
    setNotice(null);
    try {
      const response = await createReferralLink(serviceId, campaign || null);
      await load();
      setNotice(`Referral link created for ${response.link.serviceName}.`);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setCreating(null);
    }
  }

  async function share(link: ReferralLink, channel: string) {
    setError(null);
    try {
      await recordPromotion(link.id, channel);
      setNotice("Promotion recorded. Thank you for sharing Kindred Tap services.");
    } catch (err) {
      setError(messageFor(err));
    }
  }

  async function copyLink(code: string) {
    const url = `${window.location.origin}/r/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      setNotice("Referral link copied to your clipboard.");
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      setNotice(url);
    }
  }

  const promotable = (services ?? []).filter(
    (service) => service.marketingStatus === "approved" && service.availability !== "unavailable"
  );

  return (
    <ClinicPage>
      <PageHeader
        title="Promote Services"
        description="Approved Kindred Tap marketing material and your own referral links, with live attribution."
      />

      <div className="space-y-6">
        {error ? <Notice tone="rose">{error}</Notice> : null}
        {notice ? <Notice>{notice}</Notice> : null}

        <Panel title="Your referral links">
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            A referral link is an opaque code, not a client reference. Sharing it attributes
            referrals and commission to your organization without exposing anybody&apos;s details.
          </p>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="campaign"
                className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                Campaign name (optional)
              </label>
              <input
                id="campaign"
                type="text"
                value={campaign}
                onChange={(event) => setCampaign(event.target.value)}
                maxLength={120}
                placeholder="e.g. winter-wellbeing"
                className="w-64 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          {!links ? (
            <LoadingBlock label="Loading referral links..." />
          ) : links.length === 0 ? (
            <EmptyState
              title="No referral links yet"
              body="Create a link for a service below, then share it with your clients or partners."
            />
          ) : (
            <ul className="space-y-4">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="rounded-2xl border border-slate-200 px-4 py-4 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {link.serviceName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {link.campaign ? `Campaign: ${link.campaign} · ` : ""}Created{" "}
                        {formatDay(link.createdAt)}
                      </p>
                    </div>
                    <StatusPill status={link.status} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      /r/{link.code}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyLink(link.code)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
                    >
                      {copied === link.code ? "Copied" : "Copy link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => share(link, "qr")}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
                    >
                      Share as QR
                    </button>
                    <button
                      type="button"
                      onClick={() => share(link, "poster")}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
                    >
                      Share as poster
                    </button>
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-4">
                    <Metric label="Referrals" value={link.referrals} />
                    <Metric label="Conversions" value={link.conversions} />
                    <Metric
                      label="Commission"
                      value={formatMoney(link.commissionMinor)}
                      numeric
                    />
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Create a referral link">
          {promotable.length === 0 ? (
            <EmptyState
              title="No approved services"
              body="Services become promotable once Kindred Tap approves them for partner marketing."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {promotable.map((service) => (
                <li
                  key={service.id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {service.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {service.marketingSummary ?? service.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => createLink(service.id)}
                    disabled={creating === service.id}
                    className="shrink-0 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                  >
                    {creating === service.id ? "Creating..." : "Create link"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Notice tone="amber">
          Only approved Kindred Tap material may be shared. Please do not add clinical claims or
          outcome guarantees to promotional material you distribute.
        </Notice>
      </div>
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Marketing materials                                                 */
/* ------------------------------------------------------------------ */

export function MarketingMaterialsClient() {
  const [assets, setAssets] = useState<MarketingAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchMarketingAssets();
      setAssets(data.assets);
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
        title="Marketing Materials"
        description="Approved promotional material. These are written and approved by Kindred Tap and cannot be edited here."
      />

      {error ? <ErrorPanel message={error} onRetry={load} /> : null}
      {!error && !assets ? <LoadingBlock label="Loading materials..." /> : null}

      {assets && assets.length === 0 ? (
        <Panel>
          <EmptyState
            title="No approved materials yet"
            body="Approved brochures, banners and campaign assets will appear here as soon as Kindred Tap publishes them."
          />
        </Panel>
      ) : null}

      {assets && assets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {assets.map((asset) => (
            <Panel key={asset.id} title={asset.title}>
              {asset.serviceName ? (
                <Badge tone="slate">{asset.serviceName}</Badge>
              ) : null}
              {asset.description ? (
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {asset.description}
                </p>
              ) : null}
              <a
                href={asset.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
              >
                {asset.format === "link" ? "Open" : "Download"} ({asset.format.toUpperCase()})
              </a>
            </Panel>
          ))}
        </div>
      ) : null}
    </ClinicPage>
  );
}

function Metric({ label, value, numeric }: { label: string; value: string | number; numeric?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold text-slate-900 dark:text-white ${numeric ? "tabular-nums" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
