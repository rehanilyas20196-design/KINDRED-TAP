/**
 * Clinical Advisor permissions.
 *
 * Two rules:
 *
 *  1. A permission is a row, not a role assumption. Holding the
 *     `clinical_advisor` role gets you the portal; what you may do inside it
 *     comes from `advisor_permissions`.
 *  2. Nothing here is granted by accident. `DEFAULT_ADVISOR_PERMISSIONS` is
 *     what a new advisor starts with and it deliberately excludes
 *     `permissions.manage`, which is the permission that hands out permissions.
 *
 * Route handlers never query the table directly: they call `hasPermission`
 * or mount `requirePermission`, so every decision goes through one place.
 */

import { query, queryOne } from "../db/index.js";
import { asyncHandler, forbidden } from "../middleware/asyncHandler.js";
import { ADVISOR_ROLE } from "./advisor.js";

/** Every permission the Clinical Advisor portal understands. */
export const PERMISSIONS = [
  "clinical_standards.view",
  "clinical_standards.manage",
  "supervision.view",
  "supervision.manage",
  "safety_escalations.view",
  "safety_escalations.manage",
  "ethics.view",
  "ethics.manage",
  "therapists.view",
  "therapists.manage",
  "clients.view",
  "matching.manage",
  "appointments.manage",
  "assessments.view",
  "outcomes.view",
  "reports.generate",
  "clinic_settings.manage",
  "announcements.manage",
  "audit.view",
  "permissions.manage",
];

export const PERMISSION_LABELS = {
  "clinical_standards.view": "View clinical standards",
  "clinical_standards.manage": "Edit and review clinical standards",
  "supervision.view": "View supervision records",
  "supervision.manage": "Record supervision",
  "safety_escalations.view": "Review safety escalations",
  "safety_escalations.manage": "Act on safety escalations",
  "ethics.view": "View ethical guidelines",
  "ethics.manage": "Maintain ethical guidelines",
  "therapists.view": "View therapists",
  "therapists.manage": "Manage therapist status",
  "clients.view": "View client overviews",
  "matching.manage": "Decide matches",
  "appointments.manage": "Manage appointments",
  "assessments.view": "Review assessments",
  "outcomes.view": "Review clinical outcomes",
  "reports.generate": "Generate reports",
  "clinic_settings.manage": "Change clinic settings",
  "announcements.manage": "Publish clinic announcements",
  "audit.view": "Read the audit log",
  "permissions.manage": "Grant and revoke advisor permissions",
};

/**
 * What a new clinical advisor starts with. Everything the portal is built to
 * do, minus the ability to change who may do it.
 */
export const DEFAULT_ADVISOR_PERMISSIONS = PERMISSIONS.filter(
  (permission) => permission !== "permissions.manage"
);

/** Permissions held by one user, as a Set for O(1) checks. */
export async function permissionsFor(userId) {
  const { rows } = await query(
    "SELECT permission FROM advisor_permissions WHERE user_id = $1",
    [userId]
  );
  return new Set(rows.map((row) => row.permission));
}

export async function hasPermission(userId, permission) {
  const row = await queryOne(
    "SELECT 1 AS held FROM advisor_permissions WHERE user_id = $1 AND permission = $2",
    [userId, permission]
  );
  return Boolean(row);
}

/** Seeds the default set. Safe to call more than once. */
export async function grantDefaultPermissions(userId, grantedBy = null) {
  for (const permission of DEFAULT_ADVISOR_PERMISSIONS) {
    await query(
      `INSERT INTO advisor_permissions (user_id, permission, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [userId, permission, grantedBy]
    );
  }
}

/**
 * Route middleware: 403 unless the signed-in account is a clinical advisor
 * who holds `permission`.
 *
 * The role is checked first, before any permission row is read, so the URL
 * can never grant a portal to a therapist who happens to have been given a
 * permission row by mistake. The message is deliberately generic: it says
 * what was needed, never whether the resource behind it exists.
 */
export function requirePermission(permission, message) {
  return asyncHandler(async (req, res, next) => {
    if (req.user?.role !== ADVISOR_ROLE) {
      return next(forbidden("Only clinical advisors can use clinical oversight tools"));
    }
    const held = await hasPermission(req.user.id, permission);
    if (!held) {
      return next(
        forbidden(
          message ??
            `You do not have permission to ${PERMISSION_LABELS[permission] ?? permission}.`
        )
      );
    }
    return next();
  });
}

/** Same guard, for a route where any one of several permissions unlocks it. */
export function requireAnyPermission(permissions, message) {
  return asyncHandler(async (req, res, next) => {
    if (req.user?.role !== ADVISOR_ROLE) {
      return next(forbidden("Only clinical advisors can use clinical oversight tools"));
    }
    const held = await permissionsFor(req.user.id);
    if (!permissions.some((permission) => held.has(permission))) {
      return next(forbidden(message ?? "You do not have permission to view this record."));
    }
    return next();
  });
}
