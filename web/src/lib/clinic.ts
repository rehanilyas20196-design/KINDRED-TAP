/**
 * Collaborative Clinic portal API client.
 *
 * Mirrors `api/src/routes/clinic.routes.js` and `api/src/routes/clinicOps.routes.js`.
 * Every call carries the session token (see `apiFetch`), and every endpoint
 * checks the `collaborative_clinic` role, a permission row and organization
 * membership server side - this file only describes the shapes.
 *
 * Money crosses this boundary in minor units (pence) and is formatted only for
 * display. No amount is ever derived here: the server computed it and froze it
 * when the referral completed, and a client-side recalculation would be a
 * second, disagreeing source of truth.
 */

import { apiFetch } from "./api";

const base = "/api/clinic";

/* ------------------------------------------------------------------ */
/* Formatters                                                          */
/* ------------------------------------------------------------------ */

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Date only, for a date column where the time adds nothing. */
export function formatDate(iso: string | null | undefined): string {
  return formatDay(iso);
}

/** Minor units as a currency string. Presentation only. */
export function formatMoney(amountMinor: number | null | undefined, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format((Number(amountMinor) || 0) / 100);
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return "-";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Status vocabulary                                                   */
/* ------------------------------------------------------------------ */

export type Tone = "teal" | "slate" | "amber" | "rose" | "emerald" | "sky";

export type ReferralStatus =
  | "new"
  | "under_review"
  | "information_required"
  | "accepted"
  | "declined"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "closed";

export type CommissionStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "scheduled"
  | "paid"
  | "cancelled"
  | "disputed";

export type PartnershipStatus = "pending" | "active" | "paused" | "expired" | "terminated";

export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case "completed":
    case "closed":
    case "paid":
    case "active":
    case "approved":
      return "emerald";
    case "declined":
    case "cancelled":
    case "disputed":
    case "failed":
    case "terminated":
      return "rose";
    case "under_review":
    case "information_required":
    case "in_progress":
    case "under_review":
    case "processing":
    case "paused":
      return "amber";
    case "new":
    case "pending":
    case "scheduled":
    case "waiting":
      return "sky";
    default:
      return "slate";
  }
}

export function priorityTone(priority: string | null | undefined): Tone {
  switch (priority) {
    case "urgent":
    case "critical":
      return "rose";
    case "high":
      return "amber";
    case "normal":
      return "sky";
    default:
      return "slate";
  }
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface AttentionItem {
  kind: string;
  id: string | null;
  label: string;
  detail: string | null;
  href: string;
}

export interface DashboardData {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    memberRole: string;
  };
  partnership: {
    id: string;
    name: string;
    status: string;
    renewalDate: string | null;
    daysToRenewal: number | null;
  } | null;
  counts: {
    receivedReferrals: number;
    sentReferrals: number;
    receivedPending: number;
    sentPending: number;
    completedReceived: number;
    completedSent: number;
    declinedReceived: number;
    activeReferredClients: number;
    inProgressClients: number;
    completedClients: number;
    conversionRate: number | null;
    completedThisMonth: number;
  };
  commission: {
    currency: string;
    totalEarned: number;
    pending: number;
    approved: number;
    paid: number;
    cancelled: number;
    thisMonth: number;
    thisQuarter: number;
    thisYear: number;
  };
  upcomingAppointments: number;
  attention: AttentionItem[];
  recentReferrals: ReferralRow[];
  recentClients: ClientRow[];
  recentCommissions: CommissionRow[];
  kindredTap: { id: string; name: string };
  unreadNotifications: number;
}

export const fetchDashboard = () => apiFetch<DashboardData>(`${base}/dashboard`);

/* ------------------------------------------------------------------ */
/* Referrals                                                           */
/* ------------------------------------------------------------------ */

export interface ReferralRow {
  id: string;
  reference: string;
  direction: "inbound" | "outbound";
  serviceName: string;
  serviceId: string | null;
  clientReference: string;
  clientAlias: string | null;
  reason: string;
  /** The detail endpoint aliases this from `relevant_information`. */
  relevantInformation?: string | null;
  priority: string;
  status: ReferralStatus;
  outcomeCode: string | null;
  informationRequestedAt: string | null;
  declineReason: string | null;
  acceptedAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sendingOrganization: string;
  receivingOrganization: string;
  sendingProfessional: string | null;
  assignedProfessional: string | null;
  /** The detail endpoint aliases this from `assigned_professional_name`. */
  assignedProfessionalName?: string | null;
  sendingOrgId: string;
  receivingOrgId: string;
  appointmentStatus: string | null;
  nextAppointmentAt: string | null;
}

export type ReferralView = "all" | "active" | "completed" | "declined" | "cancelled" | "pending";

export interface ReferralList {
  referrals: ReferralRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReferralFilters {
  direction?: "inbound" | "outbound" | "all";
  view?: ReferralView;
  status?: string;
  serviceId?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

function referralQuery(filters: ReferralFilters = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `?${suffix}` : "";
}

export const fetchReceivedReferrals = (filters: ReferralFilters = {}) =>
  apiFetch<ReferralList>(`${base}/referrals/received${referralQuery(filters)}`);

export const fetchSentReferrals = (filters: ReferralFilters = {}) =>
  apiFetch<ReferralList>(`${base}/referrals/sent${referralQuery(filters)}`);

export const fetchReferralHistory = (filters: ReferralFilters = {}) =>
  apiFetch<ReferralList>(`${base}/referrals${referralQuery(filters)}`);

export interface ReferralEvent {
  id: string;
  action: string;
  detail: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  actorName: string | null;
  actorRole: string | null;
  createdAt: string;
}

export interface ReferralNote {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export interface ReferralAppointment {
  id: string;
  clientReference: string;
  serviceName: string;
  professionalName: string | null;
  scheduledAt: string;
  status: string;
  createdAt: string;
}

export interface ReferralDetail {
  referral: ReferralRow;
  events: ReferralEvent[];
  notes: ReferralNote[];
  appointments: ReferralAppointment[];
  commission: {
    id: string;
    reference: string;
    status: CommissionStatus;
    amountMinor: number;
    currency: string;
    rateBp: number;
    eligibleAmountMinor: number;
    createdAt: string;
  } | null;
  allowedActions: string[];
}

export const fetchReferral = (id: string) => apiFetch<ReferralDetail>(`${base}/referrals/${id}`);

export type ReferralAction =
  | "accept"
  | "decline"
  | "request_information"
  | "assign"
  | "schedule"
  | "update_status"
  | "add_note"
  | "refer_back"
  | "close_referral";

export interface ReferralActionInput {
  action: ReferralAction;
  detail?: string | null;
  toStatus?: string;
  outcomeCode?: string | null;
  professionalId?: string | null;
  professionalName?: string | null;
  scheduledAt?: string | null;
  serviceId?: string;
}

export const actOnReferral = (id: string, payload: ReferralActionInput) =>
  apiFetch<{ ok: boolean; status: string; referral: ReferralRow }>(
    `${base}/referrals/${id}/actions`,
    { method: "POST", body: payload }
  );

export interface SendReferralInput {
  serviceId: string;
  clientUserId: string;
  reason: string;
  relevantInformation?: string | null;
  priority?: "normal" | "high" | "urgent";
  professionalName?: string | null;
  referralLinkId?: string | null;
}

export const sendReferral = (payload: SendReferralInput) =>
  apiFetch<{ referral: ReferralRow }>(`${base}/referrals`, { method: "POST", body: payload });

/* ------------------------------------------------------------------ */
/* Clients                                                             */
/* ------------------------------------------------------------------ */

export interface ClientRow {
  id: string;
  reference: string;
  clientReference: string;
  direction: "inbound" | "outbound";
  serviceName: string;
  referralSource: string;
  referralDate: string;
  assignedProfessional: string | null;
  referralStatus: ReferralStatus;
  outcome: string | null;
  priority: string;
  appointmentStatus: string | null;
  nextAppointment: string | null;
  lastActivity: string;
  /** The dashboard's recent-clients list uses the referral's own alias. */
  nextAppointmentAt?: string | null;
  lastActivityAt?: string | null;
  status?: ReferralStatus;
}

export interface ClientList {
  clients: ClientRow[];
  total: number;
  limit: number;
  offset: number;
}

export const fetchClients = (filters: { q?: string; view?: string; limit?: number; offset?: number } = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, String(value));
  }
  const suffix = params.toString();
  return apiFetch<ClientList>(`${base}/clients${suffix ? `?${suffix}` : ""}`);
};

export interface ClientProfile {
  client: {
    id: string;
    clientReference: string;
    services: string[];
    referralCount: number;
  };
  referrals: Array<{
    id: string;
    reference: string;
    direction: string;
    serviceName: string;
    partnerOrganization: string;
    status: ReferralStatus;
    outcome: string | null;
    priority: string;
    assignedProfessional: string | null;
    referralDate: string;
    completedAt: string | null;
  }>;
  appointments: ReferralAppointment[];
  timeline: Array<{
    id: string;
    action: string;
    detail: string | null;
    toStatus: string | null;
    actorName: string | null;
    createdAt: string;
    reference: string;
  }>;
}

export const fetchClient = (id: string) => apiFetch<ClientProfile>(`${base}/clients/${id}`);

/* ------------------------------------------------------------------ */
/* Services and promotion                                              */
/* ------------------------------------------------------------------ */

export interface ServiceRow {
  id: string;
  name: string;
  category: string;
  description: string | null;
  availability: "available" | "limited" | "waitlist" | "unavailable";
  eligibility: string | null;
  referralMethod: string;
  priceMinor: number;
  priceCurrency: string;
  commissionRule: "percentage" | "fixed";
  commissionRateBp: number;
  commissionFixedMinor: number;
  marketingStatus: string;
  marketingSummary: string | null;
  marketingBody: string | null;
  referralCount: number;
  activeLinks: number;
}

export const fetchServices = () => apiFetch<{ services: ServiceRow[] }>(`${base}/services`);

export interface MarketingAsset {
  id: string;
  title: string;
  format: string;
  url: string;
  description: string | null;
  serviceId: string | null;
  serviceName: string | null;
}

export const fetchMarketingAssets = () =>
  apiFetch<{ assets: MarketingAsset[] }>(`${base}/marketing`);

export interface ReferralLink {
  id: string;
  code: string;
  campaign: string | null;
  status: string;
  clicks: number;
  createdAt: string;
  serviceId: string;
  serviceName: string;
  referrals: number;
  conversions: number;
  commissionMinor: number;
}

export const fetchReferralLinks = () => apiFetch<{ links: ReferralLink[] }>(`${base}/referral-links`);

export const createReferralLink = (serviceId: string, campaign?: string | null) =>
  apiFetch<{ link: ReferralLink }>(`${base}/referral-links`, {
    method: "POST",
    body: { serviceId, campaign: campaign ?? null },
  });

export const recordPromotion = (id: string, channel: string) =>
  apiFetch<{ ok: boolean }>(`${base}/referral-links/${id}/promote`, {
    method: "POST",
    body: { channel },
  });

/* ------------------------------------------------------------------ */
/* Commission and payouts                                              */
/* ------------------------------------------------------------------ */

export interface CommissionRow {
  id: string;
  reference: string;
  referralId: string;
  clientReference: string;
  serviceName: string;
  referralDate: string;
  rule: "percentage" | "fixed";
  rateBp: number;
  eligibleAmountMinor: number;
  amountMinor: number;
  currency: string;
  status: CommissionStatus;
  approvedAt: string | null;
  paidAt: string | null;
  disputeReason: string | null;
  payoutId: string | null;
  createdAt: string;
}

export interface CommissionList {
  commissions: CommissionRow[];
  total: number;
  limit: number;
  offset: number;
  totals: {
    totalEarned: number;
    pending: number;
    approved: number;
    paid: number;
    cancelled: number;
    disputed: number;
    thisMonth: number;
    thisQuarter: number;
    thisYear: number;
    records: number;
    currency: string;
  };
}

export const fetchCommissions = (
  filters: { status?: string; view?: string; q?: string; limit?: number; offset?: number } = {}
) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, String(value));
  }
  const suffix = params.toString();
  return apiFetch<CommissionList>(`${base}/commission${suffix ? `?${suffix}` : ""}`);
};

export interface CommissionDetail {
  commission: CommissionRow;
  events: Array<{
    id: string;
    action: string;
    detail: string | null;
    fromStatus: string | null;
    toStatus: string | null;
    actorRole: string | null;
    createdAt: string;
  }>;
  payout: {
    id: string;
    reference: string;
    periodLabel: string;
    status: string;
    amountMinor: number;
    currency: string;
    paidAt: string | null;
  } | null;
  allowedActions: string[];
}

export const fetchCommission = (id: string) =>
  apiFetch<CommissionDetail>(`${base}/commission/${id}`);

export const actOnCommission = (
  id: string,
  payload: { action: "request_review" | "dispute"; detail: string }
) =>
  apiFetch<{ ok: boolean; status: string; commission: CommissionRow }>(
    `${base}/commission/${id}/actions`,
    { method: "POST", body: payload }
  );

export interface PayoutRow {
  id: string;
  reference: string;
  periodLabel: string;
  amountMinor: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  scheduledFor: string | null;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

export const fetchPayouts = () =>
  apiFetch<{ payouts: PayoutRow[]; totals: { totalPaid: number; payoutCount: number } }>(
    `${base}/payouts`
  );

export const fetchPayout = (id: string) =>
  apiFetch<{ payout: PayoutRow; commissions: CommissionRow[] }>(`${base}/payouts/${id}`);

/* ------------------------------------------------------------------ */
/* Partnerships                                                        */
/* ------------------------------------------------------------------ */

export interface PartnershipRow {
  id: string;
  name: string;
  status: PartnershipStatus;
  model: string;
  startDate: string | null;
  renewalDate: string | null;
  services: string[];
  referralTerms: string | null;
  commissionTerms: string | null;
  counterpart: string;
  referralVolume: number;
  completedReferrals: number;
  activeClients: number;
  commissionMinor: number;
  contacts: Array<{
    id: string;
    memberRole: string;
    fullName: string | null;
    email: string;
  }>;
}

export const fetchPartnerships = () =>
  apiFetch<{ partnerships: PartnershipRow[] }>(`${base}/partnerships`);

export interface PartnershipDetail {
  partnership: PartnershipRow & {
    counterpartName: string;
    approvedAt: string | null;
  };
  agreements: Array<{
    id: string;
    title: string;
    version: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    status: string;
    terms: string | null;
    documentName: string | null;
    documentUrl: string | null;
    updateRequestedAt: string | null;
    updateRequestedNote: string | null;
  }>;
  referrals: Array<{
    id: string;
    reference: string;
    direction: string;
    serviceName: string;
    status: ReferralStatus;
    clientReference: string;
    createdAt: string;
  }>;
  commissions: CommissionRow[];
  clients: { total: number };
  performance: {
    referralVolume: number;
    completedReferrals: number;
    activeReferrals: number;
    pendingReferrals: number;
    activeClients: number;
    avgProcessingDays: number;
    declinedReferrals: number;
    conversionRate: number | null;
  };
  contacts: Array<{
    memberRole: string;
    fullName: string | null;
    email: string;
    status: string;
  }>;
}

export const fetchPartnership = (id: string) =>
  apiFetch<PartnershipDetail>(`${base}/partnerships/${id}`);

export const requestAgreementUpdate = (id: string, agreementId: string, note: string) =>
  apiFetch<{ ok: boolean }>(`${base}/partnerships/${id}/agreement-requests`, {
    method: "POST",
    body: { agreementId, note },
  });

export const setPartnershipContact = (id: string, userId: string, memberRole: string) =>
  apiFetch<{ ok: boolean }>(`${base}/partnerships/${id}/contacts`, {
    method: "POST",
    body: { userId, memberRole },
  });

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

export interface AppointmentRow {
  id: string;
  clientReference: string;
  serviceName: string;
  professionalName: string | null;
  scheduledAt: string;
  status: string;
  referralId: string;
  referralReference: string;
}

export const fetchAppointments = (filters: { status?: string; upcoming?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, String(value));
  }
  const suffix = params.toString();
  return apiFetch<{ appointments: AppointmentRow[]; total: number }>(
    `${base}/appointments${suffix ? `?${suffix}` : ""}`
  );
};

export const setAppointmentStatus = (id: string, status: string, reason?: string | null) =>
  apiFetch<{ ok: boolean; status: string }>(`${base}/appointments/${id}/status`, {
    method: "POST",
    body: { status, reason: reason ?? null },
  });

/* ------------------------------------------------------------------ */
/* Messaging                                                           */
/* ------------------------------------------------------------------ */

export interface ThreadRow {
  id: string;
  topic: string;
  lastMessageAt: string;
  referralId: string | null;
  partnershipId: string | null;
  messageCount: number;
  lastMessage: string | null;
  unread: number;
}

export const fetchThreads = () => apiFetch<{ threads: ThreadRow[] }>(`${base}/threads`);

export const fetchThread = (id: string) =>
  apiFetch<{
    thread: { id: string; topic: string; referralId: string | null; partnershipId: string | null; createdAt: string };
    messages: Array<{ id: string; body: string; senderId: string; senderName: string | null; createdAt: string }>;
  }>(`${base}/threads/${id}`);

export const openThread = (payload: {
  topic: string;
  body: string;
  referralId?: string | null;
  partnershipId?: string | null;
}) => apiFetch<{ threadId: string }>(`${base}/threads`, { method: "POST", body: payload });

export const sendMessage = (id: string, body: string) =>
  apiFetch<{ message: { id: string; body: string; senderId: string; createdAt: string } }>(
    `${base}/threads/${id}/messages`,
    { method: "POST", body: { body } }
  );

/* ------------------------------------------------------------------ */
/* Reports and notifications                                           */
/* ------------------------------------------------------------------ */

export interface ReportCatalogItem {
  key: string;
  title: string;
  columns: string[];
}

export const fetchReports = () =>
  apiFetch<{
    reports: ReportCatalogItem[];
    history: Array<{ id: string; reportKey: string; rowCount: number; createdAt: string }>;
  }>(`${base}/reports`);

export interface GeneratedReport {
  key: string;
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  csv: string;
  generatedAt: string;
}

export const generateReport = (key: string) =>
  apiFetch<GeneratedReport>(`${base}/reports/${key}/generate`, { method: "POST", body: {} });

export interface ClinicNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export const fetchNotifications = () =>
  apiFetch<{ notifications: ClinicNotification[]; unread: number }>(`${base}/notifications`);

export const markNotificationRead = (id: string) =>
  apiFetch<{ ok: boolean; updated: boolean }>(`${base}/notifications/${id}/read`, {
    method: "POST",
    body: {},
  });

export const markAllNotificationsRead = () =>
  apiFetch<{ ok: boolean; updated: number }>(`${base}/notifications/read-all`, {
    method: "POST",
    body: {},
  });

/* ------------------------------------------------------------------ */
/* Settings and organization                                           */
/* ------------------------------------------------------------------ */

export const fetchSettings = () =>
  apiFetch<{
    organization: { id: string; name: string; slug: string; status: string; memberRole: string };
    counterpart: { id: string; name: string };
    permissions: Array<{ permission: string; label: string; held: boolean }>;
    currencies: string[];
    referralDestinations: Array<{ id: string; name: string; status: string; partnershipStatus: string | null }>;
  }>(`${base}/settings`);

export const fetchOrganization = () =>
  apiFetch<{
    organization: {
      id: string;
      slug: string;
      name: string;
      kind: string;
      organizationType: string | null;
      status: string;
      contactName: string | null;
      contactEmail: string | null;
      contactPhone: string | null;
      website: string | null;
      city: string | null;
      country: string | null;
      registrationNumber: string | null;
      createdAt: string;
      updatedAt: string;
    };
    members: Array<{
      id: string;
      memberRole: string;
      isActive: boolean;
      fullName: string | null;
      email: string;
      status: string;
    }>;
    profile: Record<string, unknown> | null;
    partnershipStatus: string;
  }>(`${base}/organization`);