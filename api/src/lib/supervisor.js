/**
 * Clinic Supervisor permissions and shared helpers.
 *
 * Same two rules the Clinical Advisor portal follows, applied to a separate
 * role and a separate table:
 *
 *  1. A permission is a row, not a role assumption. Holding the
 *     `clinical_supervisor` role gets you the portal; what you may do inside
 *     it comes from `supervisor_permissions`.
 *  2. Nothing here is granted by accident. `DEFAULT_SUPERVISOR_PERMISSIONS`
 *     is the operational set a new supervisor starts with. Unlike the advisor
 *     set there is no permission-handing permission in this role, so the
 *     default set is the whole set.
 *
 * Supervision is minimum-necessary: routes read what supervision needs and no
 * more. Private therapist notes are reachable only through the one audited,
 * permission-gated session-review endpoint.
 */

import { z } from "zod";
import { query } from "../db/index.js";
import { badRequest, forbidden } from "../middleware/asyncHandler.js";
import { notify } from "./notifications.js";

export const SUPERVISOR_ROLE = "clinical_supervisor";

/** Every permission the Clinic Supervisor portal understands (spec order). */
export const SUPERVISOR_PERMISSIONS = [
  "supervisor.dashboard.view",

  "safety.view",
  "safety.review",
  "safety.manage",

  "escalations.view",
  "escalations.create",
  "escalations.review",
  "escalations.manage",
  "escalations.escalate",

  "therapists.view",
  "therapists.supervise",
  "therapists.manage",

  "supporters.view",
  "supporters.supervise",

  "clients.view",
  "clients.case_review",

  "supervision.view",
  "supervision.create",
  "supervision.manage",

  "case_reviews.view",
  "case_reviews.create",
  "case_reviews.manage",

  "session_reviews.view",
  "session_reviews.manage",

  "interventions.view",
  "interventions.create",
  "interventions.manage",

  "performance.view",

  "workload.view",
  "workload.manage",

  "messages.view",
  "messages.send",

  "reports.view",
  "reports.generate",

  "clinical_oversight.view",
  "clinical_oversight.manage",

  "ethical_oversight.view",
  "ethical_oversight.manage",
];

export const SUPERVISOR_PERMISSION_LABELS = {
  "supervisor.dashboard.view": "View the supervisor dashboard",
  "safety.view": "View safety concerns",
  "safety.review": "Raise safety concerns",
  "safety.manage": "Act on safety concerns",
  "escalations.view": "View escalations",
  "escalations.create": "Raise escalations",
  "escalations.review": "Review escalations",
  "escalations.manage": "Act on escalations",
  "escalations.escalate": "Escalate to the Clinical Advisor",
  "therapists.view": "View therapists",
  "therapists.supervise": "Supervise therapists",
  "therapists.manage": "Manage therapist status",
  "supporters.view": "View supporters",
  "supporters.supervise": "Supervise supporters",
  "clients.view": "View client overviews",
  "clients.case_review": "Open client case reviews",
  "supervision.view": "View supervision records",
  "supervision.create": "Schedule supervision",
  "supervision.manage": "Record and complete supervision",
  "case_reviews.view": "View case reviews",
  "case_reviews.create": "Open case reviews",
  "case_reviews.manage": "Act on case reviews",
  "session_reviews.view": "View session documentation reviews",
  "session_reviews.manage": "Review session documentation",
  "interventions.view": "View interventions",
  "interventions.create": "Create interventions",
  "interventions.manage": "Manage interventions",
  "performance.view": "View team performance indicators",
  "workload.view": "View team workload",
  "workload.manage": "Reassign cases",
  "messages.view": "Read supervisor messages",
  "messages.send": "Send supervisor messages",
  "reports.view": "View reports",
  "reports.generate": "Generate reports",
  "clinical_oversight.view": "View clinical oversight indicators",
  "clinical_oversight.manage": "Record clinical oversight actions",
  "ethical_oversight.view": "View ethical oversight",
  "ethical_oversight.manage": "Record ethical oversight actions",
};

/**
 * What a new clinic supervisor starts with: the operational set. Every item
 * in the portal is reachable, and none of it hands out permissions.
 */
export const DEFAULT_SUPERVISOR_PERMISSIONS = [...SUPERVISOR_PERMISSIONS];

/** Throws 403 unless the signed-in account is a clinic supervisor. */
export function checkSupervisor(req) {
  if (req.user?.role !== SUPERVISOR_ROLE) {
    throw forbidden("Only clinic supervisors can use supervision tools");
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

/** How urgent one priority is relative to another. Used to raise, never lower. */
export const PRIORITY_ORDER = ["low", "medium", "high", "critical"];

export function higherPriority(current, requested) {
  const from = PRIORITY_ORDER.indexOf(current);
  const to = PRIORITY_ORDER.indexOf(requested);
  if (to < 0) return current;
  return PRIORITY_ORDER[Math.max(from < 0 ? 0 : from, to)];
}

/** Permissions held by one user, as a Set for O(1) checks. */
export async function supervisorPermissionsFor(userId) {
  const { rows } = await query(
    "SELECT permission FROM supervisor_permissions WHERE user_id = $1",
    [userId]
  );
  return new Set(rows.map((row) => row.permission));
}

export async function hasSupervisorPermission(userId, permission) {
  const { rows } = await query(
    "SELECT 1 AS held FROM supervisor_permissions WHERE user_id = $1 AND permission = $2",
    [userId, permission]
  );
  return Boolean(rows[0]);
}

/** Seeds the default set. Safe to call more than once. */
export async function grantDefaultSupervisorPermissions(userId, grantedBy = null) {
  for (const permission of DEFAULT_SUPERVISOR_PERMISSIONS) {
    await query(
      `INSERT INTO supervisor_permissions (user_id, permission, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [userId, permission, grantedBy]
    );
  }
}

/**
 * Route middleware: 403 unless the signed-in account is a clinic supervisor
 * who holds `permission`. The role is checked before any permission row is
 * read, so a URL can never grant this portal to a therapist. The message
 * says what was needed, never whether the resource behind it exists.
 */
export function requireSupPermission(permission, message) {
  return async (req, res, next) => {
    try {
      if (req.user?.role !== SUPERVISOR_ROLE) {
        throw forbidden("Only clinic supervisors can use supervision tools");
      }
      const held = await hasSupervisorPermission(req.user.id, permission);
      if (!held) {
        throw forbidden(
          message ??
            `You do not have permission to ${SUPERVISOR_PERMISSION_LABELS[permission] ?? permission}.`
        );
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Same guard, for a route where any one of several permissions unlocks it. */
export function requireAnySupPermission(permissions, message) {
  return async (req, res, next) => {
    try {
      if (req.user?.role !== SUPERVISOR_ROLE) {
        throw forbidden("Only clinic supervisors can use supervision tools");
      }
      const held = await supervisorPermissionsFor(req.user.id);
      if (!permissions.some((permission) => held.has(permission))) {
        throw forbidden(message ?? "You do not have permission to view this record.");
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Tells every clinic supervisor about something that needs their attention. */
export async function notifySupervisors(input) {
  try {
    const { rows } = await query(
      `SELECT id FROM users WHERE role = $1 AND status = 'active'`,
      [SUPERVISOR_ROLE]
    );
    for (const row of rows) {
      await notify({ ...input, userId: row.id });
    }
  } catch (err) {
    console.warn(`[notify] skipped supervisor broadcast: ${err.message}`);
  }
}

/**
 * A human-readable queue reference: `CON-2026-483920`, `CR-...`, `INT-...`.
 *
 * Random rather than sequential so two records raised in the same second
 * cannot collide; the column is UNIQUE so a collision is a failed insert
 * rather than a duplicate record.
 */
export function newReference(prefix) {
  const year = new Date().getFullYear();
  const suffix = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return `${prefix}-${year}-${suffix}`;
}

/**
 * Writes one line on a record's activity trail. Fire-and-forget from the
 * caller's perspective: the action already happened, so a failed trail write
 * logs a warning instead of failing the request.
 */
export async function recordActivity(input) {
  try {
    await query(
      `INSERT INTO supervisor_activity
         (domain, target_id, action, detail, from_status, to_status, actor_id, actor_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.domain,
        input.targetId,
        input.action,
        input.detail ?? null,
        input.fromStatus ?? null,
        input.toStatus ?? null,
        input.actorId ?? null,
        input.actorRole ?? null,
      ]
    );
  } catch (err) {
    console.warn(`[activity] skipped ${input.domain}/${input.action}: ${err.message}`);
  }
}
