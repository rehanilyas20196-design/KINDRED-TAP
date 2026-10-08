/**
 * Shapes and fetchers for the Clinical Advisor portal.
 *
 * Every function maps to one endpoint under /api/advisor (or to the shared
 * messaging routes the advisor joins as a participant). The API is the single
 * source of truth: nothing is filtered, scored or guessed in the browser, so
 * each page is a thin rendering of server state.
 */

import { apiFetch } from "@/lib/api";

const base = "/api/advisor";

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface ClinicalOverview {
  activeTherapists: number;
  activeClients: number;
  openEscalations: number;
  pendingSupervision: number;
  standardsReviewsDue: number;
  ethicsItems: number;
}

export interface OperationsOverview {
  todaySessions: number;
  pendingMatching: number;
  pendingAssessments: number;
  activePlans: number;
}

export interface DashboardAlert {
  id: string;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  link: string;
  at: string;
}

export interface DashboardAnnouncement {
  id: string;
  title: string;
  body: string;
  publishAt: string | null;
  createdAt: string;
}

export interface DashboardAppointment {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  mode: string;
  status: string;
  confirmedAt: string | null;
  clientId: string;
  therapistId: string;
  clientName: string;
  therapistName: string;
}

export interface AdvisorDashboard {
  clinicalOverview: ClinicalOverview;
  operations: OperationsOverview;
  todayAppointments: DashboardAppointment[];
  alerts: DashboardAlert[];
  announcements: DashboardAnnouncement[];
  unreadNotifications: number;
}

export const fetchDashboard = () => apiFetch<AdvisorDashboard>(`${base}/dashboard`);

/* ------------------------------------------------------------------ */
/* Clinical standards                                                  */
/* ------------------------------------------------------------------ */

export type StandardStatus =
  | "draft"
  | "active"
  | "under_review"
  | "revision_requested"
  | "archived";

export interface StandardRecord {
  id: string;
  key: string;
  title: string;
  description: string | null;
  category: string;
  version: string;
  status: StandardStatus;
  ownerId: string | null;
  ownerName: string | null;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StandardRow extends StandardRecord {
  revisionCount: number;
  reviewDue: boolean;
}

export interface StandardRevision {
  id: string;
  version: string;
  action: string;
  changeSummary: string | null;
  snapshot: { title: string; description: string | null; category?: string; version: string; status?: string } | null;
  changedBy: string | null;
  changedByName: string | null;
  createdAt: string;
}

export interface StandardDetail {
  standard: StandardRecord;
  revisions: StandardRevision[];
}

export interface StandardInput {
  title: string;
  description?: string;
  category?: string;
  version?: string;
  status?: StandardStatus;
  ownerId?: string | null;
  nextReviewAt?: string | null;
}

export const fetchStandards = (status?: string) =>
  apiFetch<{ standards: StandardRow[]; total: number; reviewDue: number }>(
    `${base}/standards${status ? `?status=${encodeURIComponent(status)}` : ""}`
  );

export const fetchStandard = (id: string) => apiFetch<StandardDetail>(`${base}/standards/${id}`);

export const createStandard = (payload: StandardInput) =>
  apiFetch<{ standard: StandardRecord }>(`${base}/standards`, { method: "POST", body: payload });

export const updateStandard = (id: string, payload: Partial<StandardInput>) =>
  apiFetch<{ standard: StandardRecord; changed: boolean }>(`${base}/standards/${id}`, {
    method: "PATCH",
    body: payload,
  });

export const reviewStandard = (
  id: string,
  payload: { action: "reviewed" | "revision_requested"; notes?: string; nextReviewAt?: string | null }
) =>
  apiFetch<{ standard: StandardRecord }>(`${base}/standards/${id}/review`, {
    method: "POST",
    body: payload,
  });

export const archiveStandard = (id: string) =>
  apiFetch<{ standard: StandardRecord }>(`${base}/standards/${id}/archive`, { method: "POST" });

/* ------------------------------------------------------------------ */
/* Supervision                                                         */
/* ------------------------------------------------------------------ */

export type SupervisionStatus = "current" | "due" | "overdue";

export interface SupervisionState {
  status: SupervisionStatus;
  nextDue: string | null;
  daysOverdue: number | null;
}

export interface SupervisionTherapist {
  id: string;
  fullName: string;
  discipline: string | null;
  clinicalAreas: string[];
  availabilityDays: string[];
  lastSupervisionDate: string | null;
  lastSupervisionAt: string | null;
  recordCount: number;
  openActionItems: number;
  nextFollowUpDate: string | null;
  upcomingCount: number;
  activeClients: number;
  supervision: SupervisionState;
}

export interface SupervisionRecord {
  id: string;
  therapistId: string;
  therapistName?: string;
  advisorId?: string;
  advisorName?: string;
  supervisionDate: string;
  modality: string;
  focus: string | null;
  discussionTopics: string | null;
  developmentAreas: string | null;
  concerns: string | null;
  actionItems: string | null;
  followUpDate: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SupervisionList {
  intervalDays: number;
  overview: {
    therapistsRequiringSupervision: number;
    overdueReviews: number;
    upcomingSessions: number;
    recentRecords: number;
    totalTherapists: number;
  };
  therapists: SupervisionTherapist[];
  recent: SupervisionRecord[];
}

export interface SupervisionDetail {
  therapist: SupervisionTherapist;
  records: SupervisionRecord[];
  intervalDays: number;
}

export interface SupervisionInput {
  supervisionDate: string;
  modality: string;
  focus?: string;
  discussionTopics?: string;
  developmentAreas?: string;
  concerns?: string;
  actionItems?: string;
  followUpDate?: string | null;
  status?: string;
}

export const fetchSupervision = () => apiFetch<SupervisionList>(`${base}/supervision`);

export const fetchSupervisionDetail = (therapistId: string) =>
  apiFetch<SupervisionDetail>(`${base}/supervision/${therapistId}`);

export const createSupervision = (therapistId: string, payload: SupervisionInput) =>
  apiFetch<{ recordId: string; ok: boolean }>(`${base}/supervision/${therapistId}`, {
    method: "POST",
    body: payload,
  });

/* ------------------------------------------------------------------ */
/* Safety escalations                                                  */
/* ------------------------------------------------------------------ */

export type EscalationStatus =
  | "new"
  | "under_review"
  | "action_required"
  | "resolved"
  | "closed";

export interface EscalationRow {
  id: string;
  reference: string;
  source: string;
  priority: string;
  status: EscalationStatus;
  riskType: string;
  clientId: string | null;
  clientAlias: string | null;
  therapistId: string | null;
  therapistName: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  sessionId: string | null;
  escalatedAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  eventCount: number;
  clientName?: string | null;
}

export interface EscalationDetail extends EscalationRow {
  reason: string | null;
  observations: string | null;
  recommendedAction: string | null;
  actionsTaken: string | null;
  followUpActions: string | null;
  resolution: string | null;
  createdBy: string | null;
  createdByName: string | null;
}

export interface EscalationEvent {
  id: string;
  action: string;
  detail: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  createdAt: string;
}

export interface SafetyList {
  escalations: EscalationRow[];
  total: number;
  counts: Record<EscalationStatus, number>;
  maySeeClients: boolean;
}

export interface SafetyDetail {
  escalation: EscalationDetail;
  events: EscalationEvent[];
  maySeeClients: boolean;
  emergencyProcedure: string;
  responseHours: number;
}

export type SafetyAction = "acknowledge" | "escalate" | "resolve" | "reassign" | "close";

export const fetchSafety = (query: { status?: string; priority?: string; q?: string } = {}) => {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.priority) params.set("priority", query.priority);
  if (query.q) params.set("q", query.q);
  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch<SafetyList>(`${base}/safety${suffix}`);
};

export const fetchEscalation = (id: string) => apiFetch<SafetyDetail>(`${base}/safety/${id}`);

export const actOnEscalation = (
  id: string,
  payload: { action: SafetyAction; detail?: string; resolution?: string }
) =>
  apiFetch<{ ok: boolean; status: string; priority: string }>(`${base}/safety/${id}/actions`, {
    method: "POST",
    body: payload,
  });

/* ------------------------------------------------------------------ */
/* Ethics                                                              */
/* ------------------------------------------------------------------ */

export interface EthicsGuideline {
  id: string;
  key: string;
  title: string;
  description: string | null;
  category: string;
  version: string;
  status: string;
  applicableRoles: string[];
  ownerId: string | null;
  ownerName: string | null;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgedCount: number;
  pendingCount: number;
  overdueCount: number;
  iHaveAcknowledged: boolean;
  reviewDue: boolean;
}

export interface EthicsList {
  guidelines: EthicsGuideline[];
  total: number;
  intervalDays: number;
  needsAttention: number;
}

export interface EthicsAcknowledgmentRow {
  id: string;
  fullName: string;
  role: string;
  acknowledgedVersion: string | null;
  acknowledgedAt: string | null;
  status: "acknowledged" | "pending" | "overdue";
}

export interface EthicsAcknowledgments {
  guideline: {
    id: string;
    title: string;
    version: string;
    status: string;
    applicableRoles: string[];
  };
  practitioners: EthicsAcknowledgmentRow[];
  counts: { acknowledged: number; pending: number; overdue: number };
  intervalDays: number;
}

export interface EthicsInput {
  title: string;
  description?: string;
  category?: string;
  version?: string;
  applicableRoles?: string[];
  nextReviewAt?: string | null;
}

export const fetchEthics = () => apiFetch<EthicsList>(`${base}/ethics`);

export const createGuideline = (payload: EthicsInput) =>
  apiFetch<{ id: string }>(`${base}/ethics`, { method: "POST", body: payload });

export const updateGuideline = (id: string, payload: Partial<EthicsInput>) =>
  apiFetch<{ ok: boolean }>(`${base}/ethics/${id}`, { method: "PATCH", body: payload });

export const acknowledgeGuideline = (id: string) =>
  apiFetch<{ ok: boolean; version: string }>(`${base}/ethics/${id}/acknowledge`, {
    method: "POST",
  });

export const fetchGuidelineAcknowledgments = (id: string) =>
  apiFetch<EthicsAcknowledgments>(`${base}/ethics/${id}/acknowledgments`);

/* ------------------------------------------------------------------ */
/* Therapists                                                          */
/* ------------------------------------------------------------------ */

export interface AdvisorTherapist {
  id: string;
  fullName: string;
  accountStatus: string;
  discipline: string | null;
  clinicalAreas: string[];
  modalities: string[];
  acceptingNewCases: boolean;
  registrationVerified: boolean;
  registrationBody: string | null;
  yearsExperience: number | null;
  availabilityDays: string[];
  availabilityHours: string | null;
  sessionFee: number | null;
  currency: string | null;
  activeClients: number;
  upcomingSessions: number;
  lastSupervisionDate: string | null;
  supervisionRecords: number;
  pendingEthicsAcks: number;
  standardsOverdue: number;
  supervision: SupervisionState;
}

export interface AdvisorTherapistDetail extends AdvisorTherapist {
  bio: string | null;
  phone: string | null;
  avatarUrl: string | null;
  sessionModes: string[];
  languages: string[];
  qualifications: string[];
  registrationNumber: string | null;
  registrationCountry: string | null;
  registrationExpiry: string | null;
  supervisionExperience: boolean;
  joinedAt: string;
}

export interface TherapistStats {
  sessionsCompleted: number;
  sessionsCancelled: number;
  sessionsDocumented: number;
  plansActive: number;
  plansCompleted: number;
  assessmentsReviewed: number;
  assessmentsTotal: number;
  escalations: number;
  activeClients: number;
  upcomingSessions: number;
  attendanceRate: number | null;
  documentationRate: number | null;
  assessmentReviewRate: number | null;
  goalProgress: { averageProgress: number; goalCount: number; goalsCompleted: number };
}

export interface TherapistStandardAck {
  id: string;
  title: string;
  version: string;
  status: string;
  nextReviewAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedVersion: string | null;
}

export interface TherapistSupervisionSummary {
  id: string;
  supervisionDate: string;
  modality: string;
  focus: string | null;
  status: string;
  followUpDate: string | null;
  createdAt: string;
}

export interface TherapistDetailResponse {
  therapist: AdvisorTherapistDetail;
  stats: TherapistStats;
  supervision: TherapistSupervisionSummary[];
  standards: TherapistStandardAck[];
}

export const fetchTherapists = (query: { q?: string; accepting?: string } = {}) => {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.accepting) params.set("accepting", query.accepting);
  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch<{
    therapists: AdvisorTherapist[];
    total: number;
    intervalDays: number;
    requiringSupervision: number;
  }>(`${base}/therapists${suffix}`);
};

export const fetchTherapist = (id: string) =>
  apiFetch<TherapistDetailResponse>(`${base}/therapists/${id}`);

export const setIntake = (id: string, acceptingNewCases: boolean) =>
  apiFetch<{ ok: boolean }>(`${base}/therapists/${id}`, {
    method: "PATCH",
    body: { acceptingNewCases },
  });

/* ------------------------------------------------------------------ */
/* Clients                                                             */
/* ------------------------------------------------------------------ */

export interface AdvisorClient {
  id: string;
  fullName: string;
  accountStatus: string;
  avatarUrl: string | null;
  preferredLanguage: string | null;
  caseStatus: string | null;
  assignedTherapist: string | null;
  assignedTherapistId: string | null;
  lastTherapistName: string | null;
  nextSessionAt: string | null;
  lastSessionAt: string | null;
  lastSessionStatus: string | null;
  cancelledRecently: number;
  progressPercent: number | null;
  activePlans: number;
  openEscalations: number;
  assessmentStatus: string | null;
  lastAssessmentAt: string | null;
  assessmentPercent: number | null;
  needsAttention: boolean;
}

export interface ClientSessionRow {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  mode: string;
  status: string;
  confirmedAt: string | null;
  therapistName: string | null;
  therapistId: string;
  hasNote: boolean;
}

export interface ClientAssessmentRow {
  id: string;
  type: string;
  status: string;
  completedAt: string | null;
  primaryIssueKey: string | null;
  primaryIssue: string | null;
  reviewedAt: string | null;
  isHighRisk: boolean;
  percent: number | null;
}

export interface ClientPlanRow {
  id: string;
  title: string;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  updatedAt: string;
  therapistName: string | null;
  progressPercent: number | null;
  goalCount: number;
}

export interface AdvisorClientDetail {
  client: {
    id: string;
    fullName: string;
    accountStatus: string;
    joinedAt: string;
    avatarUrl: string | null;
    preferredLanguage: string | null;
    city: string | null;
  };
  therapist: { id: string; fullName: string } | null;
  stats: {
    totalSessions: number;
    completedSessions: number;
    cancelledSessions: number;
    nextSessionAt: string | null;
    lastSessionAt: string | null;
    progressPercent: number | null;
  };
  sessions: ClientSessionRow[];
  assessments: ClientAssessmentRow[];
  plans: ClientPlanRow[];
  escalations: EscalationRow[];
}

export const fetchClients = (query: { q?: string; attention?: boolean } = {}) => {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.attention) params.set("attention", "1");
  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch<{ clients: AdvisorClient[]; total: number; needingAttention: number }>(
    `${base}/clients${suffix}`
  );
};

export const fetchClient = (id: string) => apiFetch<AdvisorClientDetail>(`${base}/clients/${id}`);

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

export interface MatchRequestRow {
  id: string;
  clientId: string;
  clientName: string;
  primaryIssueKey: string;
  primaryIssue: string | null;
  secondaryIssues: string[];
  resultCount: number;
  createdAt: string;
  decision: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  assignedTherapistName: string | null;
  assignedTherapistId: string | null;
  decisionCount: number;
  state: string;
}

export interface MatchRecommendation {
  id: string;
  fullName: string;
  discipline: string | null;
  bio: string | null;
  modalities: string[];
  languages: string[];
  sessionModes: string[];
  sessionFee: number | null;
  currency: string | null;
  yearsExperience: number | null;
  acceptingNewCases: boolean;
  registrationVerified: boolean;
  registrationBody: string | null;
  availabilityHoursPerWeek: number | null;
  secondaryOverlap: number;
  specialties: string[];
  matchedSpecialties: string[];
  matchedOn: string | null;
  semanticScore: number;
}

export interface MatchDecisionRow {
  id: string;
  decision: string;
  note: string | null;
  createdAt: string;
  decidedByName: string | null;
  therapistName: string | null;
  therapistId: string | null;
}

export interface MatchRequestDetail {
  search: {
    id: string;
    clientId: string;
    clientName: string;
    primaryIssueKey: string;
    secondaryIssues: string[];
    resultCount: number;
    createdAt: string;
  };
  issue: { id: string; key: string; label: string; description: string | null } | null;
  history: MatchDecisionRow[];
  recommendations: MatchRecommendation[];
  total: number;
  matchedBecause: string | null;
}

export type MatchDecision = "reviewed" | "approved" | "assigned" | "rejected" | "reassigned";

export const fetchMatchRequests = (status?: string) =>
  apiFetch<{
    requests: MatchRequestRow[];
    total: number;
    counts: { pending: number; approved: number; assigned: number; rejected: number };
  }>(`${base}/matching/requests${status && status !== "all" ? `?status=${encodeURIComponent(status)}` : ""}`);

export const fetchMatchRequest = (id: string) =>
  apiFetch<MatchRequestDetail>(`${base}/matching/requests/${id}`);

export const decideMatchRequest = (
  id: string,
  payload: { decision: MatchDecision; note?: string; therapistId?: string }
) =>
  apiFetch<{ ok: boolean; decisionId: string }>(`${base}/matching/requests/${id}/decision`, {
    method: "POST",
    body: payload,
  });

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

export interface AdvisorAppointment {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  mode: string;
  status: string;
  cancelReason: string | null;
  confirmedAt: string | null;
  clientId: string;
  therapistId: string;
  clientName: string;
  therapistName: string;
}

export const fetchAppointments = (query: { from?: string; to?: string } = {}) => {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch<{
    appointments: AdvisorAppointment[];
    total: number;
    range: { from: string; to: string };
  }>(`${base}/appointments${suffix}`);
};

export const actOnAppointment = (
  id: string,
  payload: { action: "cancel" | "reschedule"; scheduledAt?: string; reason?: string }
) =>
  apiFetch<{ ok: boolean }>(`${base}/appointments/${id}`, { method: "PATCH", body: payload });

/* ------------------------------------------------------------------ */
/* Assessments                                                         */
/* ------------------------------------------------------------------ */

export interface AdvisorAssessmentRow {
  id: string;
  type: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  clientId: string;
  clientName: string;
  primaryIssueKey: string | null;
  primaryIssue: string | null;
  summary: string | null;
  isHighRisk: boolean;
  reviewedAt: string | null;
  source: string | null;
  percent: number | null;
}

export interface AdvisorAssessmentDetail {
  assessment: {
    id: string;
    type: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    clientId: string;
    clientName: string;
    primaryIssueKey: string | null;
    primaryIssue: string | null;
    secondaryIssues: string[];
    summary: string | null;
    scores: Record<string, number>;
    source: string | null;
    isHighRisk: boolean;
    safetyMessage: string | null;
    reviewedAt: string | null;
    therapistName: string | null;
    percent: number | null;
    scored: number;
  };
  answers: {
    prompt: string;
    questionType: string;
    category: string;
    answerValue: number | null;
    answerText: string | null;
    score: number | null;
  }[];
}

export const fetchAssessments = (query: { filter?: string; q?: string } = {}) => {
  const params = new URLSearchParams();
  if (query.filter && query.filter !== "all") params.set("filter", query.filter);
  if (query.q) params.set("q", query.q);
  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch<{ assessments: AdvisorAssessmentRow[]; total: number; pending: number }>(
    `${base}/assessments${suffix}`
  );
};

export const fetchAssessment = (id: string) =>
  apiFetch<AdvisorAssessmentDetail>(`${base}/assessments/${id}`);

export const reviewAssessment = (id: string) =>
  apiFetch<{ ok: boolean }>(`${base}/assessments/${id}/review`, { method: "POST" });

/* ------------------------------------------------------------------ */
/* Outcomes                                                            */
/* ------------------------------------------------------------------ */

export interface OutcomeClientRow {
  id: string;
  fullName: string;
  progressPercent: number | null;
  cancelledRecently: number;
  lastSessionAt: string | null;
  state: "needs_attention" | "improving" | "stable";
}

export interface OutcomesReport {
  windowDays: number;
  trend: { improving: number; stable: number; needsAttention: number; withTrend: number };
  attendance: {
    scheduled: number;
    completed: number;
    cancelled: number;
    attendanceRate: number;
  };
  goals: { goalCount: number; goalsCompleted: number; averageProgress: number };
  followUp: { assigned: number; completed: number; completionRate: number };
  feedback: { count: number; averageRating: number | null };
  series: { month: string; sessions: number; completed: number; cancelled: number }[];
  clients: OutcomeClientRow[];
  note: string;
}

export const fetchOutcomes = () => apiFetch<OutcomesReport>(`${base}/outcomes`);

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export interface AnalyticsReport {
  growth: { month: string; signups: number; clients: number; therapists: number }[];
  workload: {
    rows: {
      id: string;
      fullName: string;
      activeClients: number;
      upcomingSessions: number;
      acceptingNewCases: boolean;
    }[];
    rowCount: number;
  };
  appointments: {
    total: number;
    completed: number;
    cancelled: number;
    scheduled: number;
    online: number;
    phone: number;
    inPerson: number;
    completionRate: number;
  };
  assessments: {
    total: number;
    completed: number;
    inProgress: number;
    reviewed: number;
    flagged: number;
  };
  escalations: { month: string; total: number; critical: number; open: number; resolved: number }[];
  supervision: {
    therapists: number;
    current: number;
    intervalDays: number;
    completionRate: number;
  };
  standards: { total: number; active: number; archived: number; overdue: number; dueSoon: number };
  ethics: {
    title: string;
    version: string;
    practitioners: number;
    acknowledged: number;
    rate: number;
  }[];
  quality: {
    documentationRate: number | null;
    attendanceRate: number;
    goalCompletionRate: number;
    assessmentReviewRate: number;
    feedbackAverage: number | null;
  };
}

export const fetchAnalytics = () => apiFetch<AnalyticsReport>(`${base}/analytics`);

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export interface ReportCatalogItem {
  key: string;
  title: string;
  columns: string[];
}

export interface GeneratedReport {
  key: string;
  title: string;
  columns: string[];
  rows: Record<string, string | number | null>[];
  rowCount: number;
  csv: string;
  generatedAt: string;
}

export const fetchReports = () =>
  apiFetch<{
    reports: ReportCatalogItem[];
    history: {
      id: string;
      reportKey: string;
      format: string;
      rowCount: number;
      createdAt: string;
      advisorId: string;
    }[];
  }>(`${base}/reports`);

export const generateReport = (key: string, format: "csv" | "json" = "csv") =>
  apiFetch<GeneratedReport>(`${base}/reports/${key}/generate`, { method: "POST", body: { format } });

/* ------------------------------------------------------------------ */
/* Clinic settings, permissions and audit                              */
/* ------------------------------------------------------------------ */

export interface ClinicSettingRow {
  key: string;
  value: unknown;
  category: string;
  description: string;
  adminOnly: boolean;
  updatedAt: string | null;
  canEdit: boolean;
}

export const fetchSettings = () =>
  apiFetch<{
    settings: ClinicSettingRow[];
    canManage: boolean;
    permissions: string[];
  }>(`${base}/settings`);

export const saveSettings = (settings: { key: string; value: unknown }[]) =>
  apiFetch<{ ok: boolean; changed: string[] }>(`${base}/settings`, {
    method: "PATCH",
    body: { settings },
  });

export interface PermissionRow {
  permission: string;
  label: string;
  granted: boolean;
}

export const fetchPermissions = () =>
  apiFetch<{ permissions: PermissionRow[]; held: string[] }>(`${base}/permissions`);

export const savePermissions = (userId: string, permissions: string[]) =>
  apiFetch<{ ok: boolean; permissions: string[] }>(`${base}/permissions/${userId}`, {
    method: "PUT",
    body: { permissions },
  });

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  result: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
}

export const fetchAudit = (query: { limit?: number; action?: string } = {}) => {
  const params = new URLSearchParams();
  if (query.limit) params.set("limit", String(query.limit));
  if (query.action) params.set("action", query.action);
  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch<{ entries: AuditEntry[]; total: number }>(`${base}/audit${suffix}`);
};

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: string[];
  status: string;
  publishAt: string | null;
  createdAt: string;
  createdByName: string | null;
}

export const fetchAnnouncements = () =>
  apiFetch<{ announcements: AnnouncementRow[] }>(`${base}/announcements`);

export const createAnnouncement = (payload: {
  title: string;
  body: string;
  audience: string[];
  status: "draft" | "published";
  publishAt?: string | null;
}) =>
  apiFetch<{ id: string }>(`${base}/announcements`, { method: "POST", body: payload });

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export interface AdvisorNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export const fetchNotifications = () =>
  apiFetch<{ notifications: AdvisorNotification[]; unread: number }>(`${base}/notifications`);

export const markNotificationRead = (id: string) =>
  apiFetch<{ ok: boolean }>(`${base}/notifications/${id}/read`, { method: "POST" });

export const markAllNotificationsRead = () =>
  apiFetch<{ ok: boolean }>(`${base}/notifications/read-all`, { method: "POST" });

/* ------------------------------------------------------------------ */
/* Messaging (shared support routes, advisor as participant)           */
/* ------------------------------------------------------------------ */

export interface ThreadParticipant {
  id: string;
  fullName: string;
  role: string;
}

export const fetchThreadParticipants = (q?: string) =>
  apiFetch<{ participants: ThreadParticipant[] }>(
    `${base}/threads/participants${q ? `?q=${encodeURIComponent(q)}` : ""}`
  );

export const openThread = (participantId: string) =>
  apiFetch<{ conversationId: string; participant: ThreadParticipant }>(`${base}/threads`, {
    method: "POST",
    body: { participantId },
  });

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export function standardStatusLabel(status: string): string {
  return (
    {
      draft: "Draft",
      active: "Active",
      under_review: "Under review",
      revision_requested: "Revision requested",
      archived: "Archived",
    } as Record<string, string>
  )[status] ?? status;
}

export function escalationStatusLabel(status: string): string {
  return (
    {
      new: "New",
      under_review: "Under review",
      action_required: "Action required",
      resolved: "Resolved",
      closed: "Closed",
    } as Record<string, string>
  )[status] ?? status;
}

export function decisionLabel(decision: string | null): string {
  if (!decision) return "Pending review";
  return (
    {
      reviewed: "Reviewed",
      approved: "Approved",
      assigned: "Assigned",
      rejected: "Rejected",
      reassigned: "Reassigned",
    } as Record<string, string>
  )[decision] ?? decision;
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
