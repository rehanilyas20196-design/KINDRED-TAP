/**
 * Shared helpers for the Clinical Advisor API.
 *
 * Every advisor route answers to `checkAdvisor` first: the portal role is
 * read from the session, never from the URL, so a therapist who edits the
 * address bar still gets a 403.
 */

import { z } from "zod";
import { query } from "../db/index.js";
import { badRequest, forbidden } from "../middleware/asyncHandler.js";
import { notify } from "./notifications.js";
import { AUDIT_ACTIONS, logAudit } from "./audit.js";

export const ADVISOR_ROLE = "clinical_advisor";

/** Throws 403 unless the signed-in account is a clinical advisor. */
export function checkAdvisor(req) {
  if (req.user?.role !== ADVISOR_ROLE) {
    throw forbidden("Only clinical advisors can use clinical oversight tools");
  }
}

const uuidSchema = z.string().uuid();

/** Validates a UUID path parameter, answering 400 rather than letting SQL see it. */
export function uuidParam(value, label) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw badRequest(`${label} is not a valid id`);
  return parsed.data;
}

/** Optional free text that normalises an empty value to null. */
export const textOrNull = (max = 8000) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

/** `2026-10-05` style date, or null when cleared. */
export const dateOrNull = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .nullable()
  .optional();

/** Tells every clinical advisor about something that needs their attention. */
export async function notifyAdvisors(input) {
  try {
    const { rows } = await query(
      `SELECT id FROM users WHERE role = $1 AND status = 'active'`,
      [ADVISOR_ROLE]
    );
    for (const row of rows) {
      await notify({ ...input, userId: row.id });
    }
  } catch (err) {
    console.warn(`[notify] skipped advisor broadcast: ${err.message}`);
  }
}

/** How urgent one priority is relative to another. Used to raise, never lower. */
export const PRIORITY_ORDER = ["low", "medium", "high", "critical"];

export function higherPriority(current, requested) {
  const from = PRIORITY_ORDER.indexOf(current);
  const to = PRIORITY_ORDER.indexOf(requested);
  if (to < 0) return current;
  return PRIORITY_ORDER[Math.max(from < 0 ? 0 : from, to)];
}

/**
 * Reads a setting row as its plain value. Clinic settings are stored as JSONB,
 * so `"50"` arrives as the number 50 and the emergency procedure as a string.
 */
export async function readSetting(key, fallback = null) {
  try {
    const { rows } = await query(`SELECT value FROM clinic_settings WHERE key = $1`, [key]);
    if (!rows[0]) return fallback;
    return rows[0].value ?? fallback;
  } catch {
    return fallback;
  }
}

/** Integer settings are read far more often than they change. */
export async function readIntSetting(key, fallback) {
  const value = await readSetting(key, fallback);
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * A human-readable queue reference: `ESC-2026-483920`.
 *
 * Random rather than sequential so two escalations raised in the same second
 * cannot collide, and the column is UNIQUE so a collision is a failed insert
 * rather than a duplicate record.
 */
export function newEscalationReference() {
  const year = new Date().getFullYear();
  const suffix = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return `ESC-${year}-${suffix}`;
}

/**
 * Writes a safety escalation to the queue from wherever it was raised.
 *
 * Shared by the therapist and supporter escalate endpoints so there is exactly
 * one place that decides what an escalation record contains. Nothing here
 * interprets the report: what the practitioner typed is what gets stored.
 *
 * @param {{ source: "therapist"|"supporter"|"client"|"advisor",
 *           priority: "low"|"medium"|"high"|"critical",
 *           riskType?: string|null,
 *           reason: string,
 *           observations?: string|null,
 *           recommendedAction?: string|null,
 *           clientId?: string|null,
 *           clientAlias?: string|null,
 *           therapistId?: string|null,
 *           sessionId?: string|null,
 *           createdBy?: string|null }} input
 */
export async function recordEscalation(input) {
  const reference = newEscalationReference();

  const { rows } = await query(
    `INSERT INTO safety_escalations
       (reference, source, priority, status, risk_type, client_id, client_alias,
        therapist_id, session_id, reason, observations, recommended_action, created_by)
     VALUES ($1, $2, $3, 'new', $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, reference, priority, status, created_at`,
    [
      reference,
      input.source,
      input.priority,
      input.riskType ?? null,
      input.clientId ?? null,
      input.clientAlias ?? null,
      input.therapistId ?? null,
      input.sessionId ?? null,
      input.reason,
      input.observations ?? null,
      input.recommendedAction ?? null,
      input.createdBy ?? null,
    ]
  );
  const escalation = rows[0];

  await query(
    `INSERT INTO safety_escalation_events
       (escalation_id, actor_id, actor_role, action, detail, from_status, to_status)
     VALUES ($1, $2, $3, 'created', $4, NULL, 'new')`,
    [escalation.id, input.createdBy ?? null, input.source, input.reason]
  );

  await logAudit({
    actorId: input.createdBy ?? null,
    actorRole: input.source,
    action: AUDIT_ACTIONS.ESCALATION_CREATED,
    targetType: "safety_escalation",
    targetId: escalation.id,
    detail: { reference, priority: input.priority, source: input.source },
  });

  await notifyAdvisors({
    type: "safety_escalation",
    title: `New safety escalation ${reference}`,
    body: input.reason,
    link: `/portal/clinical-advisor/safety/${escalation.id}`,
    data: { escalationId: escalation.id },
    key: `escalation-created:${escalation.id}`,
  });

  return escalation;
}
