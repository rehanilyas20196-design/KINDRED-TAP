import { apiFetch } from "@/lib/api";

/**
 * Types and helpers for the two-part concern assessment.
 *
 * Question shape is driven by the database, not by this file. `options` and
 * `questionType` arrive from `assessment_questions`, so adding an instrument or
 * re-ordering an item needs no change here - only the server data and this
 * rendering logic.
 */

export interface Issue {
  key: string;
  label: string;
  description?: string | null;
}

export interface AssessmentQuestion {
  id: string;
  position: number;
  testNumber: number;
  prompt: string;
  questionType: "true_false" | "multiple_choice" | "likert";
  options: string[] | null;
  required: boolean;
}

export interface Assessment {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  type: string;
}

export interface AnalysisOutcome {
  assessmentId: string;
  primaryIssue: string | null;
  secondaryIssues: string[];
  summary: string;
  source: string;
  isHighRisk: boolean;
  safetyMessage: string | null;
}

export interface CurrentConcern {
  id: string;
  primaryIssueKey: string | null;
  secondaryIssues: string[];
  userDescription: string | null;
  summary: string | null;
  source: string | null;
  isHighRisk: boolean;
  safetyMessage: string | null;
  createdAt: string;
}

export interface CurrentConcernResponse {
  hasCurrentConcern: boolean;
  concern: CurrentConcern | null;
  isHighRisk?: boolean;
  safetyMessage?: string | null;
}

/** POST returns the stored concern directly, without the `hasCurrentConcern` wrapper. */
export interface SubmitConcernResponse {
  concern: CurrentConcern;
  isHighRisk: boolean;
  safetyMessage: string | null;
}

export interface MatchedTherapist {
  id: string;
  fullName: string;
  discipline: string;
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
  specialties: string[];
  matchedSpecialties: string[];
  matchedOn: string;
  secondaryOverlap: number;
}

export interface CurrentMatches {
  hasCurrentConcern: boolean;
  concern: {
    id: string;
    primaryIssueKey: string | null;
    secondaryIssues: string[];
    summary: string | null;
    createdAt: string;
  } | null;
  primaryIssue: Issue | null;
  therapists: MatchedTherapist[];
  total: number;
}

export function fetchIssues(): Promise<{ issues: Issue[] }> {
  return apiFetch<{ issues: Issue[] }>("/api/clinical/issues", { method: "GET" });
}

export function fetchQuestions(testNumber: number): Promise<{ questions: AssessmentQuestion[] }> {
  return apiFetch<{ questions: AssessmentQuestion[] }>(
    `/api/clinical/questions?test=${testNumber}`,
    { method: "GET" }
  );
}

export function startAssessment(): Promise<{ assessment: Assessment }> {
  return apiFetch<{ assessment: Assessment }>("/api/clinical/assessments", {
    method: "POST",
    body: {},
  });
}

export function saveAnswers(
  assessmentId: string,
  answers: { questionId: string; value: number }[]
): Promise<{ assessmentId: string; saved: number }> {
  return apiFetch<{ assessmentId: string; saved: number }>(
    `/api/clinical/assessments/${assessmentId}/answers`,
    { method: "PUT", body: { answers } }
  );
}

export function completeAssessment(
  assessmentId: string,
  payload: { selectedConcerns: string[]; userDescription?: string }
): Promise<AnalysisOutcome> {
  return apiFetch<AnalysisOutcome>(`/api/clinical/assessments/${assessmentId}/complete`, {
    method: "POST",
    body: payload,
  });
}

export function fetchCurrentConcern(): Promise<CurrentConcernResponse> {
  return apiFetch<CurrentConcernResponse>("/api/clinical/current-concern", { method: "GET" });
}

export function submitCurrentConcern(payload: {
  primaryIssueKey: string;
  secondaryIssues: string[];
  description?: string;
}): Promise<SubmitConcernResponse> {
  return apiFetch<SubmitConcernResponse>("/api/clinical/current-concern", {
    method: "POST",
    body: {
      primaryIssueKey: payload.primaryIssueKey,
      secondaryIssues: payload.secondaryIssues,
      userDescription: payload.description,
    },
  });
}

export function fetchMatches(): Promise<CurrentMatches> {
  return apiFetch<CurrentMatches>("/api/matching/therapists/current", { method: "GET" });
}

/** Human label for an issue key, falling back to the raw key. */
export function issueLabel(issues: Issue[], key: string | null | undefined): string {
  if (!key) return "Not specified";
  return issues.find((issue) => issue.key === key)?.label ?? key;
}

/* ------------------------------------------------------------------ */
/* Support tickets                                                     */
/* ------------------------------------------------------------------ */

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  category: string;
  subject: string;
  description: string;
  priority: "normal" | "urgent";
  status: "open" | "in_progress" | "resolved" | "closed";
  adminResponse: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface SupportTicketMessage {
  id: string;
  senderId: string;
  senderRole: "user" | "admin" | "therapist";
  body: string;
  createdAt: string;
}

export const TICKET_CATEGORIES = [
  { value: "account_problem", label: "Account problem" },
  { value: "therapist_problem", label: "Therapist problem" },
  { value: "cant_contact_therapist", label: "Can't contact therapist" },
  { value: "video_call_problem", label: "Video call problem" },
  { value: "appointment_problem", label: "Appointment/session problem" },
  { value: "ai_matching_concern", label: "AI matching concern" },
  { value: "technical_problem", label: "Technical problem" },
  { value: "privacy_concern", label: "Privacy concern" },
  { value: "other", label: "Other" },
] as const;

export function fetchSupportTickets(): Promise<{ tickets: SupportTicket[] }> {
  return apiFetch<{ tickets: SupportTicket[] }>("/api/support/tickets", { method: "GET" });
}

export function createSupportTicket(data: {
  category: string;
  subject: string;
  description: string;
  priority: "normal" | "urgent";
}): Promise<{ ticket: SupportTicket }> {
  return apiFetch<{ ticket: SupportTicket }>("/api/support/tickets", {
    method: "POST",
    body: data,
  });
}

export function fetchSupportTicket(id: string): Promise<{ ticket: SupportTicket; messages: SupportTicketMessage[] }> {
  return apiFetch<{ ticket: SupportTicket; messages: SupportTicketMessage[] }>(`/api/support/tickets/${id}`, { method: "GET" });
}

export function addSupportTicketMessage(id: string, body: string): Promise<{ message: SupportTicketMessage }> {
  return apiFetch<{ message: SupportTicketMessage }>(`/api/support/tickets/${id}/messages`, {
    method: "POST",
    body: { body },
  });
}

/* ------------------------------------------------------------------ */
/* Matched therapist                                                   */
/* ------------------------------------------------------------------ */

export function fetchMatchedTherapist(): Promise<{ therapist: MatchedTherapist | null; concern: CurrentMatches["concern"] | null }> {
  return fetchMatches().then((data) => {
    const therapist = data.therapists[0] ?? null;
    return { therapist, concern: data.concern };
  });
}