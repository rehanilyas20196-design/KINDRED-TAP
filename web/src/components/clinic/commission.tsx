"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClinicPage } from "@/components/clinic/shell";
import {
  DataTable,
  DataRow,
  EmptyState,
  Field,
  FilterBar,
  Notice,
  Paginator,
  PageHeader,
  Panel,
  SearchField,
  SegmentedControl,
  StatTile,
  StatusPill,
  textareaClass,
  type Column,
} from "@/components/clinic/ui";
import {
  Alert,
  Button,
  EmptyState as ErrorEmptyState,
  LoadingState,
} from "@/components/ui";
import { messageFor, toFieldErrors } from "@/lib/api";
import {
  actOnCommission,
  fetchCommission,
  fetchCommissions,
  fetchPayout,
  fetchPayouts,
  formatDate,
  formatDateTime,
  formatDay,
  formatMoney,
  titleCase,
  type CommissionDetail,
  type CommissionList,
  type CommissionRow,
  type PayoutRow,
} from "@/lib/clinic";

const PAGE_SIZE = 25;

type CommissionView = "all" | "pending" | "approved" | "paid" | "disputed" | "cancelled";

/**
 * Commission overview and transaction list.
 *
 * Amounts arrive from the API in minor units and are formatted here for display
 * only. This page never computes a commission: the rate, the eligible amount and
 * the final figure were all decided and frozen on the server when the referral
 * completed, and a client-side recalculation would be a second source of truth
 * that could disagree with the payment.
 */
export function CommissionClient({ initialView = "all" }: { initialView?: CommissionView }) {
  const [data, setData] = useState<CommissionList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CommissionView>(initialView);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(
        await fetchCommissions({
          view,
          limit: PAGE_SIZE,
          offset,
          q: search || undefined,
        })
      );
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

  const columns: Column<CommissionRow>[] = [
    {
      key: "reference",
      header: "Referral ID",
      render: (row) => (
        <Link
          href={`/portal/collaborative-clinic/commission/${row.id}`}
          className="font-medium text-teal-700 hover:underline dark:text-teal-300"
        >
          {row.reference}
        </Link>
      ),
    },
    { key: "client", header: "Client Reference", render: (row) => row.clientReference },
    { key: "service", header: "Service", render: (row) => row.serviceName },
    {
      key: "date",
      header: "Referral Date",
      render: (row) => <time dateTime={row.referralDate}>{formatDay(row.referralDate)}</time>,
    },
    {
      key: "rate",
      header: "Commission Rate",
      numeric: true,
      render: (row) =>
        row.rule === "percentage" ? `${row.rateBp / 100}%` : formatMoney(row.amountMinor, row.currency),
    },
    {
      key: "amount",
      header: "Commission Amount",
      numeric: true,
      render: (row) => (
        <span className="font-semibold">{formatMoney(row.amountMinor, row.currency)}</span>
      ),
    },
    { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
    {
      key: "approved",
      header: "Approval Date",
      render: (row) =>
        row.approvedAt ? <time dateTime={row.approvedAt}>{formatDay(row.approvedAt)}</time> : "-",
    },
    {
      key: "paid",
      header: "Payout Date",
      render: (row) => (row.paidAt ? <time dateTime={row.paidAt}>{formatDay(row.paidAt)}</time> : "-"),
    },
  ];

  const totals = data?.totals;
  const money = (value: number | undefined) => formatMoney(value ?? 0, totals?.currency ?? "GBP");

  return (
    <ClinicPage>
      <PageHeader
        title="Commission"
        description="Commission earned, pending verification, approved and paid on your referrals."
      />

      <div className="space-y-6">
        {totals ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile
              label="Total Earned"
              value={money(totals.totalEarned)}
              hint={totals.records > 0 ? `${totals.records} records` : undefined}
            />
            <StatTile label="Pending" value={money(totals.pending)} hint="Awaiting verification" />
            <StatTile label="Approved" value={money(totals.approved)} hint="Ready for payout" />
            <StatTile label="Paid" value={money(totals.paid)} hint={`${money(totals.thisYear)} this year`} />
            <StatTile label="Disputed / Cancelled" value={money(totals.disputed + totals.cancelled)} hint="Not payable" />
          </div>
        ) : null}

        <Panel>
          <FilterBar>
            <div className="min-w-56 flex-1">
              <SearchField
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setOffset(0);
                }}
                placeholder="Search by commission, client or service"
              />
            </div>
            <SegmentedControl<CommissionView>
              ariaLabel="Filter commission by status"
              value={view}
              onChange={(value) => {
                setView(value);
                setOffset(0);
              }}
              options={[
                { value: "all", label: "All" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "paid", label: "Paid" },
                { value: "disputed", label: "Disputed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </FilterBar>

          {error && !data ? (
            <ErrorEmptyState
              title="We could not load commission"
              description={error}
              action={<Button onClick={() => void load()}>Try again</Button>}
            />
          ) : null}
          {!error && !data ? <LoadingState label="Loading commission" /> : null}
          {error && data ? <Alert tone="danger">{error}</Alert> : null}

          {data ? (
            <>
              <DataTable
                caption={`Commission transactions: ${data.total}`}
                columns={columns}
                rows={data.commissions}
                empty={
                  <EmptyState
                    title="No commission yet"
                    body="Commission appears here once a referral is completed. Amounts are calculated by Kindred Tap under your agreement."
                  />
                }
              />
              <Paginator
                total={data.total}
                limit={data.limit}
                offset={data.offset}
                onChange={setOffset}
                noun="transactions"
              />
            </>
          ) : null}
        </Panel>

        {totals ? (
          <Panel title="Periods">
            <div className="grid grid-cols-3 gap-4">
              <Metric label="This month" value={money(totals.thisMonth)} />
              <Metric label="This quarter" value={money(totals.thisQuarter)} />
              <Metric label="This year" value={money(totals.thisYear)} />
            </div>
          </Panel>
        ) : null}

        <Notice>
          Commission is calculated on the Kindred Tap side when a referral completes, using the rate
          in force at that moment. Partner clinics can request a review or raise a dispute, but
          cannot change an amount.
        </Notice>
      </div>
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Commission detail                                                   */
/* ------------------------------------------------------------------ */

export function CommissionDetailClient({ commissionId }: { commissionId: string }) {
  const [data, setData] = useState<CommissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState<"request_review" | "dispute" | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchCommission(commissionId));
    } catch (err) {
      setError(messageFor(err));
    }
  }, [commissionId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(action: "request_review" | "dispute") {
    setBusy(action);
    setError(null);
    setFieldError(null);
    setNotice(null);
    try {
      await actOnCommission(commissionId, { action, detail });
      await load();
      setDetail("");
      setNotice(
        action === "dispute"
          ? "Dispute raised. Kindred Tap will review this commission."
          : "Review requested. Kindred Tap will look at this commission."
      );
    } catch (err) {
      const fields = toFieldErrors(err);
      setError(messageFor(err));
      setFieldError(Object.values(fields)[0] ?? null);
    } finally {
      setBusy(null);
    }
  }

  function downloadStatement() {
    const row = data?.commission;
    if (!row) return;
    const lines = [
      "Commission statement",
      `Reference,${row.reference}`,
      `Referral,${row.referralId}`,
      `Client reference,${row.clientReference}`,
      `Service,${row.serviceName}`,
      `Referral date,${row.referralDate}`,
      `Rule,${row.rule}`,
      `Rate (bp),${row.rateBp}`,
      `Eligible amount (minor),${row.eligibleAmountMinor}`,
      `Commission (minor),${row.amountMinor}`,
      `Currency,${row.currency}`,
      `Status,${row.status}`,
      `Approved,${row.approvedAt ?? ""}`,
      `Paid,${row.paidAt ?? ""}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${row.reference}-statement.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (error && !data) {
    return (
      <ClinicPage>
        <PageHeader title="Commission" back={{ href: "/portal/collaborative-clinic/commission", label: "Commission" }} />
        <ErrorEmptyState
          title="We could not load this commission"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      </ClinicPage>
    );
  }

  if (!data) {
    return (
      <ClinicPage>
        <PageHeader title="Commission" />
        <LoadingState label="Loading commission" />
      </ClinicPage>
    );
  }

  const { commission, events, payout, allowedActions } = data;

  return (
    <ClinicPage>
      <PageHeader
        title={commission.reference}
        description={`${commission.serviceName} · ${commission.clientReference}`}
        back={{ href: "/portal/collaborative-clinic/commission", label: "Commission" }}
        action={<StatusPill status={commission.status} />}
      />

      <div className="space-y-6">
        {error ? <Notice tone="rose">{error}</Notice> : null}
        {notice ? <Notice>{notice}</Notice> : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Commission Details" className="lg:col-span-2">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              <DataRow label="Commission ID">{commission.id}</DataRow>
              <DataRow label="Referral ID">
                <Link
                  href={`/portal/collaborative-clinic/referrals/${commission.referralId}`}
                  className="text-teal-700 hover:underline dark:text-teal-300"
                >
                  {commission.referralId.slice(0, 8)}&hellip;
                </Link>
              </DataRow>
              <DataRow label="Service">{commission.serviceName}</DataRow>
              <DataRow label="Commission Rule">{titleCase(commission.rule)}</DataRow>
              <DataRow label="Commission Rate">
                {commission.rule === "percentage"
                  ? `${commission.rateBp / 100}%`
                  : "Fixed amount"}
              </DataRow>
              <DataRow label="Eligible Amount">
                {formatMoney(commission.eligibleAmountMinor, commission.currency)}
              </DataRow>
              <DataRow label="Commission Amount">
                <span className="text-base font-semibold">
                  {formatMoney(commission.amountMinor, commission.currency)}
                </span>
              </DataRow>
              <DataRow label="Status">
                <StatusPill status={commission.status} />
              </DataRow>
              <DataRow label="Created Date">{formatDateTime(commission.createdAt)}</DataRow>
              <DataRow label="Approved Date">
                {commission.approvedAt ? formatDateTime(commission.approvedAt) : "-"}
              </DataRow>
              <DataRow label="Payout Date">
                {commission.paidAt ? formatDateTime(commission.paidAt) : "-"}
              </DataRow>
              <DataRow label="Payment Reference">
                {payout?.reference ?? "-"}
              </DataRow>
            </dl>
          </Panel>

          <Panel title="Payout">
            {payout ? (
              <dl>
                <DataRow label="Payout">{payout.reference}</DataRow>
                <DataRow label="Period">{payout.periodLabel}</DataRow>
                <DataRow label="Amount">{formatMoney(payout.amountMinor, payout.currency)}</DataRow>
                <DataRow label="Status">
                  <StatusPill status={payout.status} />
                </DataRow>
                <DataRow label="Paid">{payout.paidAt ? formatDate(payout.paidAt) : "-"}</DataRow>
              </dl>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This commission is not in a payout yet.
              </p>
            )}
          </Panel>
        </div>

        <Panel title="Actions">
          <div className="space-y-4">
            {commission.disputeReason ? (
              <Notice tone="amber">
                <strong>Dispute raised:</strong> {commission.disputeReason}
              </Notice>
            ) : null}

            {allowedActions.includes("request_review") || allowedActions.includes("dispute") ? (
              <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <Field
                  label="What needs looking at?"
                  hint="A Kindred Tap reviewer will see this. Amounts and rates cannot be changed from here."
                  error={fieldError ?? undefined}
                >
                  <textarea
                    value={detail}
                    onChange={(event) => setDetail(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    className={textareaClass}
                  />
                </Field>
                <div className="mt-3 flex flex-wrap gap-2">
                  {allowedActions.includes("request_review") ? (
                    <Button
                      size="sm"
                      loading={busy === "request_review"}
                      disabled={busy !== null || detail.trim().length < 5}
                      onClick={() => act("request_review")}
                    >
                      Request review
                    </Button>
                  ) : null}
                  {allowedActions.includes("dispute") ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === "dispute"}
                      disabled={busy !== null || detail.trim().length < 5}
                      onClick={() => act("dispute")}
                    >
                      Dispute
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This commission is settled. You can still download the statement.
              </p>
            )}

            <Button size="sm" variant="secondary" onClick={downloadStatement}>
              Download statement
            </Button>
          </div>
        </Panel>

        <Panel title="History">
          {events.length === 0 ? (
            <EmptyState title="No activity" body="Nothing has happened on this commission yet." />
          ) : (
            <ol className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {titleCase(event.action.replace(/[._]/g, " "))}
                    {event.toStatus ? ` · ${titleCase(event.toStatus)}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {formatDateTime(event.createdAt)}
                  </p>
                  {event.detail ? (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{event.detail}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </ClinicPage>
  );
}

/* ------------------------------------------------------------------ */
/* Payouts                                                             */
/* ------------------------------------------------------------------ */

export function PayoutsClient() {
  const [payouts, setPayouts] = useState<PayoutRow[] | null>(null);
  const [totals, setTotals] = useState<{ totalPaid: number; payoutCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ payout: PayoutRow; commissions: CommissionRow[] } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchPayouts();
      setPayouts(data.payouts);
      setTotals(data.totals);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const openPayout = useCallback(async (id: string) => {
    setDetailError(null);
    setDetail(null);
    setOpenId(id);
    try {
      setDetail(await fetchPayout(id));
    } catch (err) {
      setDetailError(messageFor(err));
    }
  }, []);

  const columns: Column<PayoutRow>[] = [
    {
      key: "reference",
      header: "Payout ID",
      render: (row) => (
        <button
          type="button"
          onClick={() => openPayout(row.id)}
          aria-expanded={openId === row.id}
          className="font-medium text-teal-700 hover:underline dark:text-teal-300"
        >
          {row.reference}
        </button>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      render: (row) => (
        <span className="font-semibold">{formatMoney(row.amountMinor, row.currency)}</span>
      ),
    },
    { key: "period", header: "Period", render: (row) => row.periodLabel },
    { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
    { key: "date", header: "Payment Date", render: (row) => (row.paidAt ? formatDay(row.paidAt) : "-") },
    { key: "method", header: "Payment Method", render: (row) => (row.paymentMethod ? titleCase(row.paymentMethod) : "-") },
    { key: "ref", header: "Reference", render: (row) => row.paymentReference ?? "-" },
  ];

  return (
    <ClinicPage>
      <PageHeader
        title="Payouts"
        description="Commission payouts made to your organization, with the transactions each one covers."
      />

      <div className="space-y-6">
        {totals && totals.payoutCount > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Total Paid"
              value={formatMoney(totals.totalPaid)}
              hint={`${totals.payoutCount} payout${totals.payoutCount === 1 ? "" : "s"}`}
            />
          </div>
        ) : null}

        <Panel>
          {error && !payouts ? (
            <ErrorEmptyState
              title="We could not load payouts"
              description={error}
              action={<Button onClick={() => void load()}>Try again</Button>}
            />
          ) : null}
          {!error && !payouts ? <LoadingState label="Loading payouts" /> : null}
          {error && payouts ? <Alert tone="danger">{error}</Alert> : null}

          {payouts && payouts.length === 0 ? (
            <EmptyState
              title="No payouts yet"
              body="Payouts appear here once approved commission has been paid. Kindred Tap pays commission monthly in arrears."
            />
          ) : null}

          {payouts && payouts.length > 0 ? (
            <DataTable
              caption={`Payouts: ${payouts.length}`}
              columns={columns}
              rows={payouts}
            />
          ) : null}
        </Panel>

        {openId ? (
          <Panel
            title="Payout detail"
            action={
              <button
                type="button"
                onClick={() => {
                  setOpenId(null);
                  setDetail(null);
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400"
              >
                Close
              </button>
            }
          >
            {detailError ? (
              <Alert tone="danger" title="We could not load that payout">
                {detailError}
              </Alert>
            ) : null}
            {!detail && !detailError ? <LoadingState label="Loading payout" /> : null}
            {detail ? (
              <div className="space-y-4">
                <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                  <DataRow label="Payout ID">{detail.payout.reference}</DataRow>
                  <DataRow label="Amount">
                    {formatMoney(detail.payout.amountMinor, detail.payout.currency)}
                  </DataRow>
                  <DataRow label="Period">{detail.payout.periodLabel}</DataRow>
                  <DataRow label="Status">
                    <StatusPill status={detail.payout.status} />
                  </DataRow>
                  <DataRow label="Payment Reference">
                    {detail.payout.paymentReference ?? "-"}
                  </DataRow>
                  {detail.payout.failureReason ? (
                    <DataRow label="Failure Reason">{detail.payout.failureReason}</DataRow>
                  ) : null}
                </dl>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Transactions in this payout
                  </p>
                  {detail.commissions.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No commission transactions in this payout.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {detail.commissions.map((commission) => (
                        <li key={commission.id} className="flex items-center justify-between gap-3 py-2.5">
                          <Link
                            href={`/portal/collaborative-clinic/commission/${commission.id}`}
                            className="text-sm text-teal-700 hover:underline dark:text-teal-300"
                          >
                            {commission.reference}
                          </Link>
                          <span className="text-sm font-semibold">
                            {formatMoney(commission.amountMinor, commission.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}

            </Panel>
        ) : (
          <Panel title="Payout detail">
            <EmptyState
              title="Select a payout"
              body="Choose a payout from the table above to see the commission transactions it covers."
            />
          </Panel>
        )}

        <Notice>
          Payment details are held in the Kindred Tap payments system. Banking information is never
          stored against a referral or a payout record.
        </Notice>
      </div>
    </ClinicPage>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}
