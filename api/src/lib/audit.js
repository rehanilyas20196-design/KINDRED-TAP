/**
 * Audit log.
 *
 * Clinical oversight actions have to be attributable afterwards: who changed
 * the standard, who acknowledged the escalation, which report was generated.
 *
 * Two constraints apply to every caller:
 *
 *  1. Record the fact, not the content. `detail` is for short, non-sensitive
 *     labels (a status name, a version, a row count). Clinical narrative
 *     belongs in the record it came from, never duplicated in here.
 *  2. An audit failure never fails the action. The action already happened;
 *     losing the log line is logged itself rather than turning a 200 into a
 *     500.
 */

import { query } from "../db/index.js";

/** Canonical action names. Free text is allowed, but these cover the portal. */
export const AUDIT_ACTIONS = {
  STANDARD_CREATED: "standard.created",
  STANDARD_UPDATED: "standard.updated",
  STANDARD_REVIEWED: "standard.reviewed",
  STANDARD_ARCHIVED: "standard.archived",
  SUPERVISION_CREATED: "supervision.created",
  ESCALATION_CREATED: "escalation.created",
  ESCALATION_ACTION: "escalation.action",
  ETHICS_UPDATED: "ethics.updated",
  ETHICS_ACKNOWLEDGED: "ethics.acknowledged",
  THERAPIST_STATUS_CHANGED: "therapist.status_changed",
  MATCH_DECISION: "match.decision",
  APPOINTMENT_CHANGED: "appointment.changed",
  ASSESSMENT_REVIEWED: "assessment.reviewed",
  REPORT_GENERATED: "report.generated",
  SETTINGS_CHANGED: "settings.changed",
  ANNOUNCEMENT_PUBLISHED: "announcement.published",
  PERMISSIONS_CHANGED: "permissions.changed",
  SENSITIVE_READ: "sensitive.read",
  CONCERN_CREATED: "concern.created",
  CONCERN_ACTION: "concern.action",
  CASE_REVIEW_CREATED: "case_review.created",
  CASE_REVIEW_ACTION: "case_review.action",
  CASE_REASSIGNED: "case.reassigned",
  SESSION_REVIEWED: "session.reviewed",
  INTERVENTION_CREATED: "intervention.created",
  INTERVENTION_ACTION: "intervention.action",
  SUPERVISION_COMPLETED: "supervision.completed",
  CALENDAR_EVENT_CHANGED: "calendar.event_changed",
  OVERSIGHT_STATUS: "oversight.status_changed",
  // Collaborative Clinic portal. Referral and commission actions carry a
  // reference and a status transition in `detail`, never clinical content.
  REFERRAL_CREATED: "referral.created",
  REFERRAL_RECEIVED: "referral.received",
  REFERRAL_ACCEPTED: "referral.accepted",
  REFERRAL_DECLINED: "referral.declined",
  REFERRAL_UPDATED: "referral.updated",
  REFERRAL_NOTE_ADDED: "referral.note_added",
  REFERRAL_ACTION: "referral.action",
  CLIENT_REFERRAL_ACCESSED: "client.referral_accessed",
  SERVICE_PROMOTED: "service.promoted",
  REFERRAL_LINK_CREATED: "referral_link.created",
  COMMISSION_VIEWED: "commission.viewed",
  COMMISSION_DISPUTED: "commission.disputed",
  COMMISSION_ACTION: "commission.action",
  PAYOUT_VIEWED: "payout.viewed",
  PARTNERSHIP_UPDATED: "partnership.updated",
  DOCUMENT_ACCESSED: "document.accessed",
  PARTNER_MESSAGE_SENT: "partner_message.sent",
};

/**
 * @param {{ actorId?: string|null,
 *           actorRole?: string|null,
 *           action: string,
 *           targetType?: string|null,
 *           targetId?: string|null,
 *           result?: string|null,
 *           detail?: Record<string, unknown> }} input
 */
export async function logAudit(input) {
  try {
    await query(
      `INSERT INTO audit_log (actor_id, actor_role, action, target_type, target_id, result, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.actorId ?? null,
        input.actorRole ?? null,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        input.result ?? "ok",
        JSON.stringify(input.detail ?? {}),
      ]
    );
  } catch (err) {
    console.warn(`[audit] skipped ${input.action}: ${err.message}`);
  }
}
