"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  LoadingState,
  Spinner,
} from "@/components/ui";
import { PORTALS } from "@/lib/portals";
import {
  STATUS_TONE,
  adminFetch,
  displayValue,
  formatDate,
  formatDateTime,
  humanize,
  isAuthFailure,
  statusLabel,
  type AdminUser,
  type AdminUserDetail,
  type AdminUserList,
} from "@/lib/admin";
import { messageFor } from "@/lib/api";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  "pending_review",
  "pending_profile",
  "pending_portal",
  "active",
  "rejected",
  "suspended",
];

const PROFILE_BLOCKLIST = new Set([
  "userId",
  "createdAt",
  "updatedAt",
  "avatarUrl",
]);

function portalLabel(role: string | null): string {
  if (!role) return "No portal yet";
  return PORTALS.find((portal) => portal.key === role)?.portal ?? role;
}

function portalRequiresApproval(role: string | null): boolean {
  return role === "clinical_advisor" || role === "clinical_supervisor" || role === "collaborative_clinic";
}

/** The account list's filter, owned by the panel so the portal breakdown and
 *  the table below it can never disagree about what is being shown. */
export interface AdminUserFilter {
  role: string;
  status: string;
  page: number;
}

/**
 * Every account in the product, newest verification requests first. Opening a
 * row shows everything the platform holds about that person so the decision
 * is made on the information, not on the email alone.
 */
export function AdminUsers({
  role,
  status,
  page,
  onFilterChange,
  onSessionLost,
}: AdminUserFilter & {
  onFilterChange: (next: Partial<AdminUserFilter>) => void;
  onSessionLost: () => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const [data, setData] = useState<AdminUserList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (status) params.set("status", status);
      if (role) params.set("role", role);
      if (query) params.set("q", query);

      const result = await adminFetch<AdminUserList>(`/api/admin/users?${params.toString()}`);
      setData(result);
    } catch (err) {
      if (isAuthFailure(err)) return onSessionLost();
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [status, role, query, page, onSessionLost]);

  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    void loadRef.current();
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      if (!selectedId) {
        setDetail(null);
        return;
      }

      setDetailLoading(true);
      setActionError(null);
      setNote("");

      try {
        const result = await adminFetch<AdminUserDetail>(`/api/admin/users/${selectedId}`);
        if (!cancelled) setDetail(result);
      } catch (err) {
        if (cancelled) return;
        if (isAuthFailure(err)) {
          onSessionLost();
          return;
        }
        setActionError(messageFor(err));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void open();
    return () => {
      cancelled = true;
    };
  }, [selectedId, onSessionLost]);

  async function decide(kind: "approve" | "reject") {
    if (!selectedId) return;

    setActing(kind);
    setActionError(null);

    try {
      const result = await adminFetch<{ user: AdminUser }>(
        `/api/admin/users/${selectedId}/${kind}`,
        { method: "POST", body: kind === "reject" ? { note: note.trim() || undefined } : {} }
      );
      setFlash(
        kind === "approve"
          ? `${result.user.fullName ?? result.user.email} approved. They can finish their portal profile now.`
          : `${result.user.fullName ?? result.user.email} rejected. They will see your note when they sign in.`
      );
      setSelectedId(null);
      await load();
    } catch (err) {
      if (isAuthFailure(err)) return onSessionLost();
      setActionError(messageFor(err));
    } finally {
      setActing(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      {flash ? (
        <Alert tone="success" title="Decision saved">
          {flash}
        </Alert>
      ) : null}

      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_minmax(0,14rem)]">
          <div>
            <label htmlFor="admin-search" className="field-label">
              Search
            </label>
            <input
              id="admin-search"
              type="search"
              className="field"
              placeholder="Name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onFilterChange({ page: 1 });
                  setQuery(search.trim());
                }
              }}
            />
          </div>

          <div>
            <label htmlFor="admin-status" className="field-label">
              Status
            </label>
            <select
              id="admin-status"
              className="field"
              value={status}
              onChange={(event) => onFilterChange({ status: event.target.value, page: 1 })}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="admin-role" className="field-label">
              Portal
            </label>
            <select
              id="admin-role"
              className="field"
              value={role}
              onChange={(event) => onFilterChange({ role: event.target.value, page: 1 })}
            >
              <option value="">All portals</option>
              {PORTALS.map((portal) => (
                <option key={portal.key} value={portal.key}>
                  {portal.portal}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {data ? `${data.total} account${data.total === 1 ? "" : "s"}` : "Loading accounts…"}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()} loading={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {error ? (
          <div className="p-5">
            <Alert tone="danger" title="Could not load accounts">
              {error}
            </Alert>
          </div>
        ) : loading && !data ? (
          <div className="p-5">
            <LoadingState label="Loading accounts" />
          </div>
        ) : !data || data.users.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No accounts match"
              description={
                status === "pending_review"
                  ? "Nothing is waiting for verification right now."
                  : "Try a different status, portal or search term."
              }
              action={
                status !== "pending_review" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onFilterChange({ status: "pending_review", role: "", page: 1 });
                      setSearch("");
                      setQuery("");
                    }}
                  >
                    Show the verification queue
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-900/60">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Name
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Email
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Portal
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Joined
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Last sign-in
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedId(user.id)}
                    className="cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {user.fullName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.email}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {portalLabel(user.role)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[user.status] ?? "neutral"}>
                        {statusLabel(user.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {formatDate(user.lastLoginAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => onFilterChange({ page: Math.max(1, page - 1) })}
            >
              Previous
            </Button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => onFilterChange({ page: page + 1 })}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={detail?.user.fullName ?? "Account"}
        subtitle={detail?.user.email}
        footer={
          detail ? (
            <>
              <Button variant="secondary" onClick={() => setSelectedId(null)}>
                Close
              </Button>
              {detail.user.status === "rejected" || detail.user.status === "active" ? null : (
                <>
                  <Button
                    variant="danger"
                    loading={acting === "reject"}
                    disabled={acting !== null}
                    onClick={() => void decide("reject")}
                  >
                    Reject
                  </Button>
                  <Button
                    loading={acting === "approve"}
                    disabled={acting !== null}
                    onClick={() => void decide("approve")}
                  >
                    Approve
                  </Button>
                </>
              )}
            </>
          ) : null
        }
      >
        {detailLoading || !detail ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Spinner className="h-4 w-4 text-teal-700" />
            Loading account…
          </div>
        ) : (
          <div className="space-y-5">
            {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Decision
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[detail.user.status] ?? "neutral"}>
                  {statusLabel(detail.user.status)}
                </Badge>
                {portalRequiresApproval(detail.user.role) ? (
                  <Badge tone="info">Admin verification required</Badge>
                ) : null}
                {detail.user.ethicsAccepted ? (
                  <Badge tone="accent">Ethics agreement {detail.user.ethicsVersion ?? ""}</Badge>
                ) : null}
              </div>
              {detail.user.reviewedAt ? (
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Last reviewed {formatDateTime(detail.user.reviewedAt)}
                  {detail.user.reviewedBy ? ` by ${detail.user.reviewedBy}` : ""}.
                </p>
              ) : null}
              {detail.user.reviewNote ? (
                <p className="mt-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm leading-6 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                  Note on file: {detail.user.reviewNote}
                </p>
              ) : null}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Account
              </h3>
              <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                <Fact label="Portal" value={portalLabel(detail.user.role)} />
                <Fact
                  label="Terms accepted"
                  value={detail.user.termsAcceptedAt ? formatDate(detail.user.termsAcceptedAt) : "Not yet"}
                />
                <Fact
                  label="Ethics agreement"
                  value={
                    detail.user.ethicsAgreedAt
                      ? `${formatDate(detail.user.ethicsAgreedAt)}${
                          detail.user.ethicsVersion ? ` · v${detail.user.ethicsVersion}` : ""
                        }`
                      : "Not applicable"
                  }
                />
                <Fact label="Joined" value={formatDateTime(detail.user.createdAt)} />
                <Fact label="Last sign-in" value={formatDateTime(detail.user.lastLoginAt)} />
                <Fact
                  label="Profile completed"
                  value={detail.user.onboardedAt ? formatDate(detail.user.onboardedAt) : "Not yet"}
                />
              </dl>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Submitted details
              </h3>
              {detail.profile && Object.keys(detail.profile).length > 0 ? (
                <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  {Object.entries(detail.profile)
                    .filter(([key, value]) => !PROFILE_BLOCKLIST.has(key) && displayValue(value))
                    .map(([key, value]) => (
                      <Fact key={key} label={humanize(key)} value={displayValue(value) ?? "—"} />
                    ))}
                </dl>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  This person has not completed a portal profile yet. Everything the platform
                  holds about them is the account section above.
                </p>
              )}
            </section>

            {detail.user.status === "active" ? null : (
              <section>
                <label htmlFor="admin-note" className="field-label">
                  Note for the applicant
                </label>
                <textarea
                  id="admin-note"
                  className="field min-h-[5.5rem]"
                  maxLength={500}
                  placeholder="Shown to them if you reject the account. Optional when approving."
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Keep it factual: what is missing, or what to send next.
                </p>
              </section>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="break-words text-sm font-medium text-slate-800 dark:text-slate-200">
        {value}
      </dd>
    </div>
  );
}
