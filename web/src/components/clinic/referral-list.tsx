"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClinicPage } from "@/components/clinic/shell";
import { SendReferralClient } from "@/components/clinic/send-referral";
import {
  DataTable,
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
import { messageFor } from "@/lib/api";
import {
  fetchReferralHistory,
  fetchReceivedReferrals,
  fetchSentReferrals,
  formatDay,
  priorityTone,
  type ReferralFilters,
  type ReferralList,
  type ReferralRow,
  type ReferralView,
} from "@/lib/clinic";

const PAGE_SIZE = 25;

/**
 * One table implementation behind the three referral views.
 *
 * Received, sent and history differ only in the `direction` they ask the API
 * for, so they share this component rather than being three near-identical
 * files. The isolation decision is the API's: this never filters by
 * organization, it only asks for one list.
 */
export function ReferralListClient({
  direction,
  title,
  description,
  emptyTitle,
  emptyBody,
  action,
}: {
  direction: "inbound" | "outbound" | "all";
  title: string;
  description: string;
  emptyTitle: string;
  emptyBody: string;
  action?: ReactNode;
}) {
  const [data, setData] = useState<ReferralList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ReferralView>("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(null);
      const filters: ReferralFilters = { direction, view, limit: PAGE_SIZE, offset };
      if (search) filters.q = search;

      const response =
        direction === "inbound"
          ? await fetchReceivedReferrals(filters)
          : direction === "outbound"
            ? await fetchSentReferrals(filters)
            : await fetchReferralHistory(filters);
      setData(response);
    } catch (err) {
      setError(messageFor(err));
      setData(null);
    }
  }, [direction, view, offset, search]);

  // Debounced so a fast typist does not fire a query per keystroke.
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

  const columns: Column<ReferralRow>[] = [
    {
      key: "reference",
      header: "Referral ID",
      render: (row) => (
        <Link
          href={`/portal/collaborative-clinic/referrals/${row.id}`}
          className="font-medium text-teal-700 hover:underline dark:text-teal-300"
        >
          {row.reference}
        </Link>
      ),
    },
    { key: "date", header: "Date", render: (row) => formatDay(row.createdAt) },
    {
      key: "organization",
      header: direction === "inbound" ? "Referring Organization" : "Destination",
      render: (row) =>
        direction === "inbound" ? row.sendingOrganization : row.receivingOrganization,
    },
    {
      key: "professional",
      header: "Referring Professional",
      render: (row) => row.sendingProfessional ?? row.assignedProfessional ?? "-",
    },
    { key: "client", header: "Client ID", render: (row) => row.clientReference },
    { key: "service", header: "Requested Service", render: (row) => row.serviceName },
    {
      key: "priority",
      header: "Priority",
      render: (row) => <StatusPill status={row.priority} tone={priorityTone(row.priority)} />,
    },
    { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
    {
      key: "assigned",
      header: "Assigned Team",
      render: (row) => row.assignedProfessional ?? "-",
    },
    {
      key: "appointment",
      header: "Appointment Status",
      render: (row) => (row.appointmentStatus ? <StatusPill status={row.appointmentStatus} /> : "-"),
    },
  ];

  return (
    <ClinicPage>
      <PageHeader
        title={title}
        description={description}
        action={
          action ??
          (direction === "outbound" ? (
            <Link
              href="/portal/collaborative-clinic/referrals/sent?new=1"
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              Send referral
            </Link>
          ) : undefined)
        }
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
              placeholder="Search by referral ID, client ID or service"
            />
          </div>
          <SegmentedControl<ReferralView>
            ariaLabel="Filter referrals by status"
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
              { value: "declined", label: "Declined" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
        </FilterBar>

        {error ? <ErrorPanel message={error} onRetry={load} /> : null}
        {!error && !data ? <LoadingBlock label="Loading referrals..." /> : null}

        {data ? (
          data.referrals.length === 0 ? (
            <EmptyState
              title={search || view !== "all" ? "No referrals match those filters" : emptyTitle}
              body={
                search || view !== "all"
                  ? "Try a different search term or filter."
                  : emptyBody
              }
            />
          ) : (
            <>
              <DataTable
                caption={`${title}: ${data.total} referrals`}
                columns={columns}
                rows={data.referrals}
                empty={<EmptyState title={emptyTitle} body={emptyBody} />}
              />
              <Paginator
                total={data.total}
                limit={data.limit}
                offset={data.offset}
                onChange={setOffset}
                noun="referrals"
              />
            </>
          )
        ) : null}
      </Panel>

      {direction === "inbound" ? (
        <div className="mt-4">
          <Notice>
            You see the client reference, service and referral history - not the client record.
            Any personal detail is exchanged through the referral conversation with Kindred Tap.
          </Notice>
        </div>
      ) : null}
    </ClinicPage>
  );
}

export function ReceivedReferralsClient() {
  return (
    <ReferralListClient
      direction="inbound"
      title="Received Referrals"
      description="Referrals sent to your clinic by Kindred Tap and authorized partner organizations."
      emptyTitle="No referrals received yet"
      emptyBody="Your clinic has not received any referrals yet. When one arrives it will appear here for review."
    />
  );
}

export function ReferralHistoryClient() {
  return (
    <ReferralListClient
      direction="all"
      title="Referral History"
      description="Every referral in both directions, with filters and search across the whole partnership."
      emptyTitle="No referrals yet"
      emptyBody="Your clinic has not received or sent any referrals yet."
    />
  );
}

/* ------------------------------------------------------------------ */
/* Sent referrals                                                      */
/* ------------------------------------------------------------------ */

/**
 * The sent list, with the send form reachable two ways: from the header button,
 * and from `?new=1` in the URL so a deep link or a browser back button lands on
 * the form rather than silently dropping the user on the list.
 */
export function SentReferralsClient() {
  // Read the deep link during render rather than in an effect. `window` is not
  // available on the server, so the check is guarded and falls back to false;
  // the value cannot change between renders anyway, so there is no state to
  // hold and nothing to cascade.
  const [sending, setSending] = useState(false);

  const wantsForm =
    sending ||
    (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1");

  if (wantsForm) {
    return (
      <SendReferralClient
        onCancel={() => setSending(false)}
        onSent={() => setSending(false)}
      />
    );
  }

  return (
    <ReferralListClient
      direction="outbound"
      title="Sent Referrals"
      description="Referrals your clinic has sent into Kindred Tap, and how each one is progressing."
      emptyTitle="No referrals sent yet"
      emptyBody="Your clinic has not sent any referrals yet. Send one to refer a client into Kindred Tap services."
      action={
        <button
          type="button"
          onClick={() => setSending(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          Send referral
        </button>
      }
    />
  );
}