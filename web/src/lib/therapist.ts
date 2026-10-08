/**
 * Shapes and fetchers for the therapist portal.
 *
 * Every function here maps to one endpoint under /api/therapist; nothing is
 * computed in the browser that the API could answer, so a page is a thin
 * rendering of server state rather than a second implementation of it.
 */

import { apiFetch } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

export type SessionStatus = "scheduled" | "completed" | "cancelled";
export type SessionMode = "online" | "phone" | "in_person";
export type NoteStatus = "draft" | "final";
export type PlanStatus = "draft" | "active" | "completed" | "archived";
export type GoalStatus = "not_started" | "in_progress" | "completed" | "dropped";
export type CaseStatus = "active" | "paused" | "completed" | "archived";
export type HomeworkStatus = "assigned" | "in_progress" | "completed" | "skipped";

/** `Mon`..`Sun`, exactly as the settings endpoint expects them. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface DashboardStats {
  todaySessions: number;
  sessionsThisWeek: number;
  activeClients: number;
  pendingAssessments: number;
  pendingRequests: number;
  unreadNotifications: number;
}

export interface TherapistSession {
  id: string;
  clientId: string;
  therapistId: string;
  scheduledAt: string;
  durationMinutes: number;
  mode: SessionMode;
  status: SessionStatus;
  cancelReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  clientName: string | null;
  clientAvatar: string | null;
  noteId: string | null;
  noteStatus: NoteStatus | null;
  noteSessionDate: string | null;
}

export interface ActivityEvent {
  type: "session" | "assessment" | "message" | "treatment_plan" | "homework";
  title: string;
  clientId: string | null;
  clientName: string | null;
  at: string;
  link: string | null;
}

export interface NotificationRow {
  id: string;
  type:
    | "appointment_request"
    | "session_updated"
    | "new_message"
    | "assessment_completed"
    | "session_reminder"
    | "treatment_plan_reminder"
    | "homework_completed";
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface TherapistDashboard {
  stats: DashboardStats;
  todaySessions: TherapistSession[];
  upcoming: TherapistSession[];
  activity: ActivityEvent[];
  notifications: NotificationRow[];
  clientCount: number;
}

/* ------------------------------------------------------------------ */
/* Caseload                                                            */
/* ------------------------------------------------------------------ */

export interface CaseloadClient {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  preferredLanguage: string | null;
  status: CaseStatus;
  openedAt: string | null;
  concernKey: string | null;
  concernSummary: string | null;
  nextSessionAt: string | null;
  lastSessionAt: string | null;
  lastSessionStatus: SessionStatus | null;
  assessmentStatus: string | null;
  lastReviewedAt: string | null;
  progressPercent: number | null;
  activePlans: number;
  lastActivity: string | null;
}

export interface ClientStats {
  totalSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
  notesFinal: number;
  notesTotal: number;
  homeworkTotal: number;
  homeworkCompleted: number;
  assessmentsInProgress: number;
}

export interface AssessmentSummary {
  id: string;
  assessmentId: string | null;
  primaryIssueKey: string | null;
  secondaryIssues: string[] | null;
  scores: Record<string, number> | null;
  summary: string | null;
  source: string | null;
  isHighRisk: boolean | null;
  reviewedAt: string | null;
  completedAt: string | null;
  type: string;
  totalScore: number;
  scored: number;
  /** `total / (scored * 5)` as a percentage of answered items. */
  percent: number | null;
}

export interface ClientDetail {
  client: {
    id: string;
    fullName: string;
    email: string;
    joinedAt: string;
    avatarUrl: string | null;
    preferredLanguage: string | null;
    supportStatus: string | null;
    consentedToDataSharing: boolean | null;
    whatBroughtYouHere: string | null;
    therapyStatus: CaseStatus;
    concernKey: string | null;
    concernSecondary: string[] | null;
    concernDescription: string | null;
    concernSummary: string | null;
    concernAt: string | null;
    isHighRisk: boolean;
  };
  stats: ClientStats;
  initialAssessment: AssessmentSummary | null;
  latestAssessment: AssessmentSummary | null;
  plan: TreatmentPlan | null;
  sessions: TherapistSession[];
  activity: ActivityEvent[];
  homework: HomeworkItem[];
  /** Null when nobody has written yet - the profile can open a thread. */
  conversationId: string | null;
}

/* ------------------------------------------------------------------ */
/* Assessments                                                         */
/* ------------------------------------------------------------------ */

export interface AssessmentRow {
  id: string;
  clientId: string;
  clientName: string;
  type: string;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string | null;
  completedAt: string | null;
  primaryIssueKey: string | null;
  secondaryIssues: string[] | null;
  scores: Record<string, number> | null;
  summary: string | null;
  source: string | null;
  isHighRisk: boolean | null;
  safetyMessage: string | null;
  reviewedAt: string | null;
  totalScore: number;
  scored: number;
  percent: number | null;
}

export interface AssessmentAnswer {
  questionId: string;
  prompt: string;
  testNumber: number;
  position: number;
  category: string;
  questionType: string;
  answerValue: number | null;
  answerText: string | null;
  score: number | null;
}

export interface AssessmentDetailResponse {
  assessment: AssessmentRow;
  answers: AssessmentAnswer[];
  previous: AssessmentRow | null;
}

/* ------------------------------------------------------------------ */
/* Treatment plans                                                     */
/* ------------------------------------------------------------------ */

export interface TreatmentObjective {
  id: string;
  title: string;
  interventions: string[];
  status: GoalStatus;
  targetDate: string | null;
  position: number;
}

export interface TreatmentGoal {
  id: string;
  title: string;
  notes: string | null;
  status: GoalStatus;
  targetDate: string | null;
  progressPercent: number;
  position: number;
  objectives: TreatmentObjective[];
}

export interface TreatmentPlan {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  summary: string | null;
  status: PlanStatus;
  startDate: string | null;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
  goalCount: number;
  goalsCompleted: number;
  progressPercent: number | null;
  goals: TreatmentGoal[];
}

/* ------------------------------------------------------------------ */
/* Notes, homework, progress                                           */
/* ------------------------------------------------------------------ */

export interface SessionNote {
  id: string;
  sessionId: string;
  clientId: string;
  status: NoteStatus;
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
  createdAt: string;
  updatedAt: string;
}

export interface NoteEditorPayload {
  status: NoteStatus;
  sessionDate?: string;
  sessionNumber?: number | null;
  sharedWithClient?: boolean;
  sessionType?: string | null;
  presentation?: string | null;
  discussion?: string | null;
  interventions?: string | null;
  clientResponse?: string | null;
  progressNotes?: string | null;
  homework?: string | null;
  nextSessionPlan?: string | null;
  privateNotes?: string | null;
  clientSummary?: string | null;
}

export interface NotesResponse {
  session: {
    id: string;
    clientId: string;
    therapistId: string;
    scheduledAt: string;
    durationMinutes: number;
    mode: SessionMode;
    status: SessionStatus;
    cancelReason: string | null;
    confirmedAt: string | null;
    createdAt: string;
    updatedAt: string;
    clientName: string | null;
    therapistName: string | null;
    noteId: string | null;
  };
  note: SessionNote | null;
  suggestedSessionNumber: number;
}

export interface HomeworkItem {
  id: string;
  clientId: string;
  sessionId: string | null;
  title: string;
  details: string | null;
  status: HomeworkStatus;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  clientName: string | null;
}

export interface ProgressClient {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  assessmentSeries: {
    id: string;
    completedAt: string | null;
    totalScore: number;
    scored: number;
    percent: number | null;
    primaryIssueKey: string | null;
    label: string;
  }[];
  goals: { total: number; completed: number; progress: number | null };
  sessions: {
    scheduled: number;
    completed: number;
    cancelled: number;
    attendanceRate: number;
  };
  homework: { total: number; completed: number; percent: number };
  overallPercent: number;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface TherapistSettings {
  user: { id: string; email: string; fullName: string | null; role: string };
  profile: {
    avatarUrl: string | null;
    bio: string | null;
    discipline: string | null;
    registrationNumber: string | null;
    registrationBody: string | null;
    registrationCountry: string | null;
    registrationVerified: boolean;
    yearsExperience: number | null;
    sessionFee: number | null;
    currency: string;
    acceptingNewCases: boolean;
    availabilityHoursPerWeek: number | null;
    availabilityDays: string[];
    availabilityHours: string | null;
    notificationPrefs: {
      appointments: boolean;
      messages: boolean;
      assessments: boolean;
      reminders: boolean;
    };
    modalities: string[];
    clinicalAreas: string[];
    languages: string[];
    consentedToDataSharing: boolean;
  };
}

export interface SettingsPatch {
  fullName?: string;
  bio?: string | null;
  availabilityDays?: string[];
  availabilityHours?: string | null;
  availabilityHoursPerWeek?: number | null;
  acceptingNewCases?: boolean;
  notificationPrefs?: Partial<TherapistSettings["profile"]["notificationPrefs"]>;
}

/* ------------------------------------------------------------------ */
/* Intake queue (existing endpoint)                                    */
/* ------------------------------------------------------------------ */

export interface IntakeCase {
  id: string;
  clientAlias: string;
  age: number;
  primaryConcern: string;
  matchedScore: number;
  aiRecommendationReason: string;
  preferredMode: string;
  urgency: string;
  assignedAt: string;
  status: "pending_acceptance" | "accepted";
}

/* ------------------------------------------------------------------ */
/* Fetchers                                                            */
/* ------------------------------------------------------------------ */

const base = "/api/therapist";

export const fetchDashboard = () => apiFetch<TherapistDashboard>(`${base}/dashboard`);

export interface ClientsQuery {
  search?: string;
  status?: string;
  sort?: string;
  progress?: string;
}

export function fetchClients(query: ClientsQuery = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ clients: CaseloadClient[]; total: number }>(`${base}/clients${suffix}`);
}

export const fetchClient = (clientId: string) =>
  apiFetch<ClientDetail>(`${base}/clients/${clientId}`);

export const patchClientStatus = (clientId: string, status: CaseStatus) =>
  apiFetch<{ status: CaseStatus }>(`${base}/clients/${clientId}`, {
    method: "PATCH",
    body: { status },
  });

export interface SessionsQuery {
  status?: string;
  from?: string;
  to?: string;
}

export function fetchSessions(query: SessionsQuery = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ sessions: TherapistSession[]; total: number; counts: Record<string, number> }>(
    `${base}/sessions${suffix}`
  );
}

export const confirmSession = (sessionId: string) =>
  apiFetch<{ session: TherapistSession }>(`${base}/sessions/${sessionId}/confirm`, {
    method: "POST",
    body: {},
  });

export const fetchNotes = (sessionId: string) =>
  apiFetch<NotesResponse>(`${base}/sessions/${sessionId}/notes`);

export const saveNotes = (sessionId: string, payload: NoteEditorPayload) =>
  apiFetch<{ note: SessionNote; message: string }>(`${base}/sessions/${sessionId}/notes`, {
    method: "PUT",
    body: payload,
  });

export interface AssessmentsQuery {
  clientId?: string;
  status?: string;
}

export function fetchAssessments(query: AssessmentsQuery = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ assessments: AssessmentRow[]; total: number; pending: number }>(
    `${base}/assessments${suffix}`
  );
}

export const fetchAssessment = (assessmentId: string) =>
  apiFetch<AssessmentDetailResponse>(`${base}/assessments/${assessmentId}`);

export const reviewAssessment = (assessmentId: string) =>
  apiFetch<{ ok: boolean; reviewedAt: string }>(`${base}/assessments/${assessmentId}/review`, {
    method: "POST",
    body: {},
  });

export const fetchPlans = (clientId?: string) =>
  apiFetch<{ plans: TreatmentPlan[]; total: number }>(
    clientId ? `${base}/treatment-plans?clientId=${clientId}` : `${base}/treatment-plans`
  );

export const fetchPlan = (planId: string) =>
  apiFetch<{ plan: TreatmentPlan }>(`${base}/treatment-plans/${planId}`);

export interface PlanInput {
  clientId: string;
  title: string;
  summary?: string | null;
  status?: PlanStatus;
  startDate?: string | null;
  targetDate?: string | null;
  goals?: {
    id?: string;
    title: string;
    notes?: string | null;
    status?: GoalStatus;
    targetDate?: string | null;
    progressPercent?: number;
    objectives?: {
      id?: string;
      title: string;
      interventions?: string[];
      status?: GoalStatus;
      targetDate?: string | null;
    }[];
  }[];
}

export const createPlan = (payload: PlanInput) =>
  apiFetch<{ plan: TreatmentPlan }>(`${base}/treatment-plans`, {
    method: "POST",
    body: payload,
  });

export const updatePlan = (planId: string, payload: Partial<PlanInput>) =>
  apiFetch<{ plan: TreatmentPlan }>(`${base}/treatment-plans/${planId}`, {
    method: "PATCH",
    body: payload,
  });

export const deletePlan = (planId: string) =>
  apiFetch<{ ok: boolean }>(`${base}/treatment-plans/${planId}`, { method: "DELETE" });

/** The goal editor submits the whole tree; the API rewrites it in one transaction. */
export const savePlanStructure = (planId: string, goals: PlanInput["goals"]) =>
  apiFetch<{ plan: TreatmentPlan }>(`${base}/treatment-plans/${planId}/structure`, {
    method: "PUT",
    body: { goals },
  });

export const setGoalProgress = (
  planId: string,
  goalId: string,
  payload: { progressPercent?: number; status?: GoalStatus }
) =>
  apiFetch<{ plan: TreatmentPlan }>(`${base}/treatment-plans/${planId}/goals/${goalId}`, {
    method: "PATCH",
    body: payload,
  });

export const fetchProgress = () =>
  apiFetch<{ clients: ProgressClient[]; total: number }>(`${base}/progress`);

export const fetchNotifications = () =>
  apiFetch<{ notifications: NotificationRow[]; total: number; unread: number }>(
    `${base}/notifications`
  );

export const markNotificationRead = (id: string) =>
  apiFetch<{ ok: boolean }>(`${base}/notifications/${id}/read`, { method: "POST", body: {} });

export const markAllNotificationsRead = () =>
  apiFetch<{ ok: boolean }>(`${base}/notifications/read-all`, { method: "POST", body: {} });

export const fetchSettings = () => apiFetch<TherapistSettings>(`${base}/settings`);

export const saveSettings = (payload: SettingsPatch) =>
  apiFetch<{ ok: boolean; message: string }>(`${base}/settings`, {
    method: "PATCH",
    body: payload,
  });

export const fetchHomework = (clientId?: string) =>
  apiFetch<{ homework: HomeworkItem[]; total: number }>(
    clientId ? `${base}/homework?clientId=${clientId}` : `${base}/homework`
  );

export interface HomeworkInput {
  clientId: string;
  sessionId?: string | null;
  title: string;
  details?: string | null;
  dueDate?: string | null;
}

export const createHomework = (payload: HomeworkInput) =>
  apiFetch<{ homework: HomeworkItem }>(`${base}/homework`, { method: "POST", body: payload });

export const updateHomework = (
  id: string,
  payload: Partial<Omit<HomeworkInput, "clientId">> & { status?: HomeworkStatus }
) =>
  apiFetch<{ homework: HomeworkItem }>(`${base}/homework/${id}`, {
    method: "PATCH",
    body: payload,
  });

export const fetchIntakeCases = () =>
  apiFetch<{ cases: IntakeCase[]; aiMatchingEngineStatus: string }>(`${base}/cases`);

export const acceptIntakeCase = (caseId: string) =>
  apiFetch<{ success: boolean; message: string }>(`${base}/cases/${caseId}/accept`, {
    method: "POST",
    body: {},
  });

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

export function sessionModeLabel(mode: SessionMode): string {
  if (mode === "phone") return "Phone";
  if (mode === "in_person") return "In person";
  return "Video";
}

export function sessionStatusLabel(status: SessionStatus): string {
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Scheduled";
}

/** Band shown next to a score. Descriptive only - never a diagnosis. */
export function scoreBand(percent: number | null): string | null {
  if (percent === null || percent === undefined) return null;
  if (percent < 30) return "Low band";
  if (percent < 50) return "Mild band";
  if (percent < 70) return "Moderate band";
  return "Elevated band";
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

export function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
