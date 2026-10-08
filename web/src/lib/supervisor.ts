/**
 * Clinic Supervisor portal API client.
 *
 * Mirrors `api/src/routes/supervisor.routes.js` and
 * `api/src/routes/supervisorOps.routes.js`. Every call carries the session
 * token (see `apiFetch`), and every endpoint checks the supervisor role and a
 * permission row server side - this file only describes the shapes.
 */

import { apiFetch } from "./api";

const base = "/api/supervisor";

export type Priority = "low" | "medium" | "high" | "critical";
export type PriorityRank = Record<Priority, number>;

/* ------------------------------------------------------------------ */
/* Formatters and labels                                               */
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

export function relativeFromNow(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const days = Math.round(abs / 86_400_000);
  if (days === 0) return diff >= 0 ? "today" : "earlier today";
  if (days === 1) return diff >= 0 ? "tomorrow" : "yesterday";
  if (days < 30) return diff >= 0 ? `in ${days} days` : `${days} days ago`;
  return formatDay(iso);
}

export function priorityLabel(priority: string | null | undefined): string {
  if (!priority) return "Unset";
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function concernCategoryLabel(category: string): string {
  const map: Record<string, string> = {
    urgent_client_concern: "Urgent client concern",
    risk_escalation: "Risk escalation",
    client_status_change: "Change in client status",
    missed_sessions: "Repeated missed sessions",
    practitioner_concern: "Therapist / supporter concern",
    safeguarding: "Safeguarding concern",
    documentation: "Documentation concern",
    communication: "Communication concern",
    treatment: "Treatment concern",
    operational: "Operational concern",
  };
  return map[category] ?? category;
}

export function caseReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    complex_case: "Complex case",
    limited_progress: "Limited progress",
    practitioner_request: "Practitioner request",
    safety_concern: "Safety concern",
    treatment_plan_concern: "Treatment-plan concern",
    documentation_concern: "Documentation concern",
    client_concern: "Client concern",
    missed_sessions: "Repeated missed sessions",
    escalation: "Escalation",
    ethical_concern: "Ethical concern",
    confidentiality_concern: "Confidentiality concern",
    communication_concern: "Communication concern",
    boundary_concern: "Professional boundary concern",
    consent_concern: "Consent / documentation concern",
    unauthorized_access: "Unauthorized access",
    disclosure_concern: "Inappropriate disclosure",
    conflict_of_interest: "Conflict of interest",
    conduct_concern: "Professional conduct concern",
  };
  return map[reason] ?? reason.replace(/_/g, " ");
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const map: Record<string, string> = {
    open: "Open",
    under_review: "Under review",
    action_required: "Action required",
    awaiting_information: "Awaiting information",
    in_review: "In review",
    escalated: "Escalated",
    resolved: "Resolved",
    closed: "Closed",
    new: "New",
    pending: "Pending",
    in_progress: "In progress",
    completed: "Completed",
    awaiting_review: "Awaiting review",
    current: "Current",
    due_soon: "Due soon",
    overdue: "Overdue",
    never: "Never supervised",
  };
  return map[status] ?? status.replace(/_/g, " ");
}

type Tone = "teal" | "slate" | "amber" | "rose" | "emerald" | "sky";

export function priorityTone(priority: string | null | undefined): Tone {
  switch (priority) {
    case "critical":
      return "rose";
    case "high":
      return "amber";
    case "medium":
      return "sky";
    default:
      return "slate";
  }
}

export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case "resolved":
    case "completed":
    case "closed":
    case "compliant":
      return "emerald";
    case "escalated":
    case "action_required":
    case "overdue":
      return "rose";
    case "in_review":
    case "under_review":
    case "in_progress":
    case "needs_review":
      return "amber";
    case "new":
    case "open":
    case "pending":
    case "awaiting_review":
      return "sky";
    default:
      return "slate";
  }
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface SupervisorCounts {
  activePractitioners: number;
  activeTherapists: number;
  activeSupporters: number;
  activeClients: number;
  openConcerns: number;
  highPriorityConcerns: number;
  openEscalations: number;
  highPriorityEscalations: number;
  pendingCaseReviews: number;
  pendingSessionReviews: number;
  pendingSupervision: number;
  pendingInterventions: number;
  overdueInterventions: number;
  overdueFollowUps: number;
  documentationPending: number;
  supervisionOverdue: number;
}

export interface AttentionItem {
  kind: string;
  id: string | null;
  priority: string;
  label: string;
  detail: string | null;
  href: string;
  reference: string | null;
}

export interface TodayItem {
  kind: string;
  id: string;
  title: string;
  day: string;
  status: string;
}

export interface RecentItem {
  id: string;
  domain?: string;
  action: string;
  detail: string | null;
  toStatus: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface SupervisorDashboard {
  counts: SupervisorCounts;
  attention: AttentionItem[];
  today: TodayItem[];
  recent: RecentItem[];
  maySeeClients: boolean;
  responseHours: number;
  intervalDays: number;
  unreadNotifications: number;
}

export const fetchDashboard = () => apiFetch<SupervisorDashboard>(`${base}/dashboard`);

/* ------------------------------------------------------------------ */
/* Safety concerns                                                     */
/* ------------------------------------------------------------------ */

export type ConcernStatus = "open" | "under_review" | "action_required" | "resolved";

export interface ConcernRow {
  id: string;
  reference: string;
  category: string;
  priority: Priority;
  status: ConcernStatus;
  reason: string;
  information: string | null;
  currentActions: string | null;
  followUpDate: string | null;
  clientId: string | null;
  clientName: string | null;
  subjectUserId: string | null;
  subjectName: string | null;
  subjectRole: string | null;
  assignedSupervisorId: string | null;
  assignedSupervisorName: string | null;
  escalationId: string | null;
  escalationReference: string | null;
  escalationStatus: string | null;
  escalationPriority: string | null;
  resolution: string | null;
  raisedBy: string | null;
  raisedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConcernActivity {
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
  concerns: ConcernRow[];
  total: number;
  counts: Record<string, number> & { byPriority: Record<string, number> };
  maySeeClients: boolean;
}

export const fetchSafety = (query: { priority?: string; status?: string; category?: string; q?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<SafetyList>(`${base}/safety${suffix}`);
};

export interface SafetyDetail {
  concern: ConcernRow;
  activity: ConcernActivity[];
  maySeeClients: boolean;
  emergencyProcedure: string | null;
}

export const fetchConcern = (id: string) => apiFetch<SafetyDetail>(`${base}/safety/${id}`);

export interface CreateConcernInput {
  category: string;
  priority: Priority;
  reason: string;
  information?: string | null;
  clientId?: string | null;
  subjectUserId?: string | null;
  followUpDate?: string | null;
}

export const createConcern = (payload: CreateConcernInput) =>
  apiFetch<{ concern: ConcernRow }>(`${base}/safety`, { method: "POST", body: payload });

export type ConcernAction = "review" | "assign" | "note" | "request_information" | "set_follow_up" | "escalate" | "resolve" | "reopen";

export const actOnConcern = (
  id: string,
  payload: { action: ConcernAction; detail?: string | null; followUpDate?: string | null; priority?: Priority; assigneeId?: string | null; confirm?: boolean }
) => apiFetch<{ ok: boolean; status: string }>(`${base}/safety/${id}/actions`, { method: "POST", body: payload });

/* ------------------------------------------------------------------ */
/* Escalations                                                         */
/* ------------------------------------------------------------------ */

export interface EscalationRow {
  id: string;
  reference: string;
  source: string;
  priority: Priority;
  status: string;
  riskType: string | null;
  clientId: string | null;
  clientAlias: string | null;
  clientName: string | null;
  therapistId: string | null;
  therapistName: string | null;
  therapistRole: string | null;
  assignedReviewerId: string | null;
  assignedReviewerName: string | null;
  escalatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reason?: string;
  observations?: string | null;
  recommendedAction?: string | null;
  actionsTaken?: string | null;
  followUpActions?: string | null;
  resolution?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
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

export interface EscalationList {
  escalations: EscalationRow[];
  total: number;
  counts: Record<string, number>;
  maySeeClients: boolean;
}

export const fetchEscalations = (query: { status?: string; priority?: string; q?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<EscalationList>(`${base}/escalations${suffix}`);
};

export interface EscalationDetail {
  escalation: EscalationRow;
  events: EscalationEvent[];
  maySeeClients: boolean;
  emergencyProcedure: string | null;
  responseHours: number;
}

export const fetchEscalation = (id: string) => apiFetch<EscalationDetail>(`${base}/escalations/${id}`);

export type EscalationAction =
  | "acknowledge"
  | "assign_reviewer"
  | "request_information"
  | "add_action"
  | "escalate"
  | "escalate_to_advisor"
  | "resolve"
  | "close";

export const actOnEscalation = (
  id: string,
  payload: { action: EscalationAction; detail?: string | null; priority?: Priority; assignedReviewerId?: string | null; resolution?: string | null; followUpActions?: string | null; confirm?: boolean }
) => apiFetch<{ ok: boolean; status: string }>(`${base}/escalations/${id}/actions`, { method: "POST", body: payload });

/* ------------------------------------------------------------------ */
/* Team (therapists and supporters)                                    */
/* ------------------------------------------------------------------ */

export interface SupervisionState {
  status: string;
  nextDue: string | null;
  daysOverdue: number | null;
}

export interface TeamMember {
  id: string;
  fullName: string;
  role: string;
  accountStatus: string;
  specialization: string | null;
  activeClients: number;
  sessionsThisWeek: number;
  upcomingSessions: number;
  lastSupervisionDate: string | null;
  nextSupervisionDate: string | null;
  openConcerns: number;
  openEscalations: number;
  openCaseReviews: number;
  openInterventions: number;
  documentationPending: number;
  supervision: SupervisionState;
  workload: { band: string; label: string };
  needsReview: boolean;
}

export interface TeamList {
  team: TeamMember[];
  total: number;
  intervalDays: number;
  counts: {
    total: number;
    therapists: number;
    supporters: number;
    needingSupervision: number;
    highWorkload: number;
    openConcerns: number;
    openEscalations: number;
  };
}

export const fetchTeam = (query: { role?: string; filter?: string; q?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<TeamList>(`${base}/team${suffix}`);
};

export interface TeamPerformance {
  supervision: SupervisionState;
  documentation: { completedSessions: number | null; finalNotes: number | null; pendingDocumentation: number | null; rate: number | null };
  sessionCompletionRate: number | null;
  caseReviews: { total: number; resolved: number; rate: number | null };
  interventions: { total: number; completed: number; overdue: number };
  caseload: number;
  developmentFlags: string[];
}

export interface TeamDetail {
  practitioner: TeamMember & { performance: TeamPerformance };
  escalations: EscalationRow[];
  interventions: InterventionRow[];
  supervisionRecords: SupervisionRecord[];
  concerns: ConcernRow[];
  caseReviews: CaseReviewRow[];
  intervalDays: number;
}

export const fetchTeamMember = (id: string) => apiFetch<TeamDetail>(`${base}/team/${id}`);

export interface TeamClientRow {
  caseId: string;
  caseStatus: string;
  openedAt: string;
  clientId: string;
  clientName: string | null;
  planStatus: string | null;
  nextSessionAt: string | null;
  openCaseReviews: number;
  openEscalations: number;
}

export const fetchTeamClients = (id: string) => apiFetch<{ clients: TeamClientRow[]; total: number }>(`${base}/team/${id}/clients`);
export const fetchTeamSupervision = (id: string) => apiFetch<{ records: SupervisionRecord[]; total: number }>(`${base}/team/${id}/supervision`);
export const fetchTeamReviews = (id: string) => apiFetch<{ reviews: CaseReviewRow[]; total: number }>(`${base}/team/${id}/reviews`);

export interface TeamSessionRow {
  sessionId: string;
  scheduledAt: string;
  status: string;
  mode: string | null;
  documentationStatus: string;
  documentedAt: string | null;
  reviewId: string | null;
  reviewStatus: string | null;
  followUpRequired: boolean | null;
  clientId: string;
  clientName: string | null;
}

export const fetchTeamSessions = (id: string) => apiFetch<{ sessions: TeamSessionRow[]; total: number; maySeeClients: boolean }>(`${base}/team/${id}/sessions`);

export interface ActivityRow {
  kind: string;
  id: string;
  status: string;
  title: string;
  createdAt: string;
}

export const fetchTeamActivity = (id: string) => apiFetch<{ activity: ActivityRow[]; total: number }>(`${base}/team/${id}/activity`);

/* ------------------------------------------------------------------ */
/* Supervision                                                         */
/* ------------------------------------------------------------------ */

export interface SupervisionRecord {
  id: string;
  practitionerId: string;
  practitionerName: string;
  practitionerRole: string;
  supervisorId: string;
  supervisorName: string | null;
  supervisionDate: string;
  modality: string;
  focus: string | null;
  discussionTopics: string | null;
  developmentAreas?: string | null;
  checklist: string[];
  actionItems: string | null;
  concerns: string | null;
  followUpDate: string | null;
  status: string;
  supervisorRole: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupervisionDue {
  id: string;
  fullName: string;
  role: string;
  specialization: string | null;
  lastSupervisionDate: string | null;
  supervision: SupervisionState;
}

export interface SupervisionList {
  records: SupervisionRecord[];
  total: number;
  counts: Record<string, number>;
  due: SupervisionDue[];
  intervalDays: number;
  overview: { totalRecords: number; dueCount: number; overdue: number; never: number; scheduled: number };
}

export const fetchSupervision = (query: { status?: string; role?: string; q?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<SupervisionList>(`${base}/supervision${suffix}`);
};

export const fetchSupervisionRecord = (id: string) => apiFetch<{ record: SupervisionRecord }>(`${base}/supervision/${id}`);

export interface SupervisionInput {
  practitionerId: string;
  supervisionDate: string;
  modality?: string;
  focus?: string | null;
  checklist?: string[];
  discussionTopics?: string | null;
  developmentAreas?: string | null;
  actionItems?: string | null;
  followUpDate?: string | null;
}

export const createSupervision = (payload: SupervisionInput) =>
  apiFetch<{ record: { id: string } }>(`${base}/supervision`, { method: "POST", body: payload });

export const completeSupervision = (
  id: string,
  payload: { checklist?: string[]; discussionTopics?: string | null; developmentAreas?: string | null; concerns?: string | null; actionItems?: string | null; followUpDate?: string | null; summary?: string | null }
) => apiFetch<{ ok: boolean; record: SupervisionRecord }>(`${base}/supervision/${id}/complete`, { method: "POST", body: payload });

/* ------------------------------------------------------------------ */
/* Case reviews                                                        */
/* ------------------------------------------------------------------ */

export interface CaseReviewRow {
  id: string;
  reference: string;
  domain: "clinical" | "ethics";
  reason: string;
  priority: Priority;
  status: string;
  summary: string;
  information?: string | null;
  supervisorNotes?: string | null;
  clientId: string | null;
  clientName: string | null;
  therapistId: string | null;
  therapistName: string | null;
  therapistRole: string | null;
  assignedSupervisorId: string | null;
  assignedSupervisorName: string | null;
  escalationId: string | null;
  escalationReference: string | null;
  followUpDate: string | null;
  resolution?: string | null;
  advisorEscalatedAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseReviewList {
  reviews: CaseReviewRow[];
  total: number;
  counts: Record<string, number>;
  maySeeClients: boolean;
}

export const fetchCaseReviews = (query: { status?: string; domain?: string; reason?: string; q?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<CaseReviewList>(`${base}/case-reviews${suffix}`);
};

export interface CaseReviewDetail {
  review: CaseReviewRow;
  activity: ConcernActivity[];
  interventions: InterventionRow[];
  maySeeClients: boolean;
}

export const fetchCaseReview = (id: string) => apiFetch<CaseReviewDetail>(`${base}/case-reviews/${id}`);

export interface CreateCaseReviewInput {
  domain: "clinical" | "ethics";
  reason: string;
  priority: Priority;
  summary: string;
  clientId?: string | null;
  therapistId?: string | null;
  followUpDate?: string | null;
}

export const createCaseReview = (payload: CreateCaseReviewInput) =>
  apiFetch<{ review: CaseReviewRow }>(`${base}/case-reviews`, { method: "POST", body: payload });

export type CaseReviewAction = "note" | "request_information" | "start_review" | "create_action" | "schedule_follow_up" | "escalate_to_advisor" | "resolve" | "reopen";

export const actOnCaseReview = (
  id: string,
  payload: { action: CaseReviewAction; detail?: string | null; followUpDate?: string | null; priority?: Priority; confirm?: boolean }
) => apiFetch<{ ok: boolean; status: string }>(`${base}/case-reviews/${id}/actions`, { method: "POST", body: payload });

/* ------------------------------------------------------------------ */
/* Session reviews                                                     */
/* ------------------------------------------------------------------ */

export interface SessionReviewRow {
  id: string;
  sessionId: string;
  scheduledAt: string;
  mode?: string | null;
  durationMinutes?: number | null;
  sessionStatus?: string;
  reviewRowId: string | null;
  therapistId: string;
  therapistName: string;
  therapistRole: string;
  clientId: string;
  clientName: string | null;
  reviewStatus: string;
  supervisorFeedback: string | null;
  followUpRequired: boolean;
  followUpDate: string | null;
  supervisorId?: string | null;
  supervisorName?: string | null;
  reviewedAt: string | null;
  documentationStatus: string;
  documentedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SessionReviewList {
  sessions: SessionReviewRow[];
  total: number;
  counts: Record<string, number>;
  maySeeClients: boolean;
}

export const fetchSessionReviews = (query: { status?: string; q?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<SessionReviewList>(`${base}/session-reviews${suffix}`);
};

export interface SessionReviewDetail {
  review: SessionReviewRow;
  maySeeClients: boolean;
  activity: ConcernActivity[];
}

export const fetchSessionReview = (id: string) => apiFetch<SessionReviewDetail>(`${base}/session-reviews/${id}`);

export const openSessionReview = (sessionId: string) =>
  apiFetch<{ review: { id: string } }>(`${base}/session-reviews`, { method: "POST", body: { sessionId } });

export const submitSessionFeedback = (
  id: string,
  payload: { feedback?: string | null; followUpRequired?: boolean; followUpDate?: string | null; complete?: boolean }
) => apiFetch<{ ok: boolean; reviewStatus: string }>(`${base}/session-reviews/${id}/feedback`, { method: "POST", body: payload });

export interface SessionDocumentation {
  note: {
    id: string;
    sessionId: string;
    status: string;
    sessionDate: string;
    sessionNumber: number | null;
    sessionType: string | null;
    presentation: string | null;
    discussion: string | null;
    interventions: string | null;
    clientResponse: string | null;
    progressNotes: string | null;
    homework: string | null;
    nextSessionPlan: string | null;
    privateNotes: string | null;
    clientSummary: string | null;
    sharedWithClient: boolean;
    updatedAt: string;
  };
}

export const fetchSessionDocumentation = (id: string) => apiFetch<SessionDocumentation>(`${base}/session-reviews/${id}/documentation`);

/* ------------------------------------------------------------------ */
/* Interventions                                                       */
/* ------------------------------------------------------------------ */

export interface InterventionStep {
  id: string;
  text: string;
  done: boolean;
}

export interface InterventionRow {
  id: string;
  reference: string;
  category: string;
  title: string;
  reason: string;
  instructions: string | null;
  steps: InterventionStep[];
  priority: Priority;
  status: string;
  assignedTo: string | null;
  assigneeName: string | null;
  assigneeRole: string | null;
  dueDate: string | null;
  followUpDate: string | null;
  followUpNote: string | null;
  relatedType: string | null;
  relatedId: string | null;
  completedAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  progress: { total: number; done: number; percent: number };
  overdue: boolean;
}

export interface InterventionList {
  interventions: InterventionRow[];
  total: number;
  counts: Record<string, number>;
}

export const fetchInterventions = (query: { status?: string; priority?: string; q?: string; assignedTo?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<InterventionList>(`${base}/interventions${suffix}`);
};

export const fetchIntervention = (id: string) => apiFetch<{ intervention: InterventionRow; activity: ConcernActivity[] }>(`${base}/interventions/${id}`);

export interface CreateInterventionInput {
  assignedTo: string;
  category: string;
  title: string;
  reason: string;
  instructions?: string | null;
  steps?: InterventionStep[];
  priority: Priority;
  dueDate?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
}

export const createIntervention = (payload: CreateInterventionInput) =>
  apiFetch<{ intervention: { id: string; reference: string } }>(`${base}/interventions`, { method: "POST", body: payload });

export const updateIntervention = (id: string, payload: Partial<CreateInterventionInput>) =>
  apiFetch<{ intervention: InterventionRow }>(`${base}/interventions/${id}`, { method: "PATCH", body: payload });

export type InterventionAction = "start" | "add_follow_up" | "assign" | "complete" | "reopen";

export const actOnIntervention = (
  id: string,
  payload: { action: InterventionAction; detail?: string | null; followUpDate?: string | null; assignedTo?: string | null; confirm?: boolean }
) => apiFetch<{ ok: boolean; status: string }>(`${base}/interventions/${id}/actions`, { method: "POST", body: payload });

/* ------------------------------------------------------------------ */
/* Clients                                                             */
/* ------------------------------------------------------------------ */

export interface ClientOverviewRow {
  id: string;
  clientName: string | null;
  assignedTherapist: string | null;
  therapyStatus: string | null;
  planStatus: string | null;
  assessmentStatus: string | null;
  nextAppointment: string | null;
  openCaseReviews: number;
  openEscalations: number;
  progressPercent: number | null;
}

export const fetchClients = (query: { q?: string; attention?: boolean } = {}) => {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.attention) params.set("attention", "true");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ clients: ClientOverviewRow[]; total: number }>(`${base}/clients${suffix}`);
};

/* ------------------------------------------------------------------ */
/* Workload                                                            */
/* ------------------------------------------------------------------ */

export interface WorkloadRow {
  id: string;
  fullName: string;
  role: string;
  specialization: string | null;
  activeClients: number;
  sessionsThisWeek: number;
  upcomingSessions: number;
  overdueDocumentation: number;
  openCaseReviews: number;
  openEscalations: number;
  openInterventions: number;
  supervisionWorkload: number;
  workload: { band: string; label: string };
}

export interface WorkloadList {
  team: WorkloadRow[];
  total: number;
  counts: { total: number; overloaded: number; normal: number; underutilized: number; needsReview: number };
  mayReassign: boolean;
}

export const fetchWorkload = () => apiFetch<WorkloadList>(`${base}/workload`);

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

export interface CalendarEvent {
  id: string;
  type: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  relatedType: string | null;
  relatedId: string | null;
  notes: string | null;
}

export interface CalendarDerived {
  id: string;
  kind: string;
  status: string;
  title: string;
  day: string;
}

export interface CalendarData {
  from: string;
  to: string;
  events: CalendarEvent[];
  derived: CalendarDerived[];
}

export const fetchCalendar = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<CalendarData>(`${base}/calendar${suffix}`);
};

export const createCalendarEvent = (payload: { type: string; title: string; startsAt: string; endsAt?: string | null; notes?: string | null }) =>
  apiFetch<{ event: CalendarEvent }>(`${base}/calendar`, { method: "POST", body: payload });

export const deleteCalendarEvent = (id: string) =>
  apiFetch<{ ok: boolean }>(`${base}/calendar/${id}`, { method: "DELETE" });

/* ------------------------------------------------------------------ */
/* Oversight                                                           */
/* ------------------------------------------------------------------ */

export interface ClinicalArea {
  key: string;
  label: string;
  description: string;
  indicator: { value: number | null; unit: string; tone: string; detail: string } | null;
  status: string;
  note: string | null;
  updatedAt: string | null;
  recorded: boolean;
}

export interface ClinicalOversight {
  areas: ClinicalArea[];
  policies: { key: string; title: string; version: string; status: string; nextReviewAt: string | null }[];
  canManage: boolean;
}

export const fetchClinicalOversight = () => apiFetch<ClinicalOversight>(`${base}/oversight/clinical`);
export const recordClinicalOversight = (area: string, payload: { status: string; note?: string | null }) =>
  apiFetch<{ ok: boolean }>(`${base}/oversight/clinical/${area}`, { method: "POST", body: payload });

export interface EthicalArea {
  key: string;
  label: string;
  total: number;
  resolved: number;
  open: number;
  status: string;
  note: string | null;
  updatedAt: string | null;
  recorded: boolean;
}

export interface EthicalOversight {
  areas: EthicalArea[];
  guidelines: { id: string; title: string; version: string; status: string; applicableRoles: string[]; practitioners: number; acknowledged: number }[];
  canManage: boolean;
}

export const fetchEthicalOversight = () => apiFetch<EthicalOversight>(`${base}/oversight/ethical`);
export const recordEthicalOversight = (area: string, payload: { status: string; note?: string | null }) =>
  apiFetch<{ ok: boolean }>(`${base}/oversight/ethical/${area}`, { method: "POST", body: payload });

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export interface ReportCatalogItem {
  key: string;
  title: string;
  columns: string[];
}

export interface ReportHistoryRow {
  id: string;
  reportKey: string;
  format: string;
  rowCount: number;
  createdAt: string;
  createdByName: string | null;
}

export interface GeneratedReport {
  key: string;
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  csv: string;
  generatedAt: string;
}

export const fetchReports = () => apiFetch<{ reports: ReportCatalogItem[]; history: ReportHistoryRow[] }>(`${base}/reports`);
export const generateReport = (key: string, format: "csv" | "json" = "csv") =>
  apiFetch<GeneratedReport>(`${base}/reports/${key}/generate`, { method: "POST", body: { format } });

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export interface SupervisorNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export const fetchNotifications = () => apiFetch<{ notifications: SupervisorNotification[]; unread: number }>(`${base}/notifications`);
export const markNotificationRead = (id: string) => apiFetch<{ ok: boolean }>(`${base}/notifications/${id}/read`, { method: "POST", body: {} });
export const markAllNotificationsRead = () => apiFetch<{ ok: boolean }>(`${base}/notifications/read-all`, { method: "POST", body: {} });

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

export interface ThreadParticipant {
  id: string;
  fullName: string | null;
  role: string;
}

export const fetchThreadParticipants = (q?: string) => {
  const suffix = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiFetch<{ participants: ThreadParticipant[] }>(`${base}/threads/participants${suffix}`);
};

export const openThread = (participantId: string) =>
  apiFetch<{ conversationId: string; participant: ThreadParticipant }>(`${base}/threads`, { method: "POST", body: { participantId } });

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface SupervisorSettingRow {
  key: string;
  value: unknown;
  category: string;
  description: string;
}

export interface SupervisorSettings {
  settings: SupervisorSettingRow[];
  permissions: { permission: string; label: string }[];
}

export const fetchSettings = () => apiFetch<SupervisorSettings>(`${base}/settings`);
