import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../db/index.js";
import {
  asyncHandler,
  badRequest,
  HttpError,
  notFound,
  parse,
  unauthorized,
} from "../middleware/asyncHandler.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import {
  adminConfigured,
  issueAdminSession,
  revokeAdminSession,
  verifyAdminCredentials,
} from "../lib/admin.js";
import { hashToken } from "../lib/tokens.js";
import { loadRoleProfile, publicUser } from "../lib/users.js";
import { ROLES, ROLE_TABLES } from "../lib/roles.js";
import { AUDIT_ACTIONS, logAudit } from "../lib/audit.js";

export const adminRouter = Router();

/** Statuses a review can move an account between, in panel order. */
const STATUSES = [
  "pending_review",
  "pending_profile",
  "pending_portal",
  "active",
  "rejected",
  "suspended",
];

const idParam = z.object({ id: z.string().uuid("Unknown account") });

const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  role: z.enum(ROLES).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const LIST_COLUMNS = `
  id,
  email,
  full_name            AS "fullName",
  role,
  status,
  review_note          AS "reviewNote",
  reviewed_at          AS "reviewedAt",
  terms_accepted_at    AS "termsAcceptedAt",
  ethics_accepted      AS "ethicsAccepted",
  last_login_at        AS "lastLoginAt",
  created_at           AS "createdAt"`;

/* ------------------------------------------------------------------ */
/* Brute-force throttling for the admin login                          */
/* ------------------------------------------------------------------ */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map();

function attemptsFor(key) {
  const now = Date.now();
  const state = attempts.get(key);

  if (attempts.size > 5_000) attempts.clear();
  if (!state || now - state.startedAt > WINDOW_MS) {
    const fresh = { startedAt: now, count: 0 };
    attempts.set(key, fresh);
    return fresh;
  }
  return state;
}

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

adminRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = parse(
      z.object({
        email: z.string().trim().min(1, "Enter the admin email"),
        password: z.string().min(1, "Enter the admin password"),
      }),
      req.body
    );

    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const state = attemptsFor(key);
    state.count += 1;

    if (state.count > MAX_ATTEMPTS) {
      const waitMin = Math.ceil((WINDOW_MS - (Date.now() - state.startedAt)) / 60_000);
      throw badRequest(`Too many attempts. Try again in about ${waitMin} minute(s).`);
    }

    // Fail closed: with no admin configured there is nothing to log in to, and
    // saying "wrong password" would send somebody hunting for a typo that is
    // not there. A missing table is a schema problem, and is named as one
    // rather than being handed back as a generic 500.
    let result;
    try {
      result = await verifyAdminCredentials(email, password);
    } catch (error) {
      console.error("[admin] credential check failed:", error);
      throw new HttpError(
        500,
        "Admin login cannot check credentials: the admin tables are missing. Run the migrations against the database this API uses."
      );
    }

    if (result === null) {
      throw badRequest(
        "Admin access is not configured. Add a row to admin_accounts, or set ADMIN_EMAIL and ADMIN_PASSWORD_HASH in the environment."
      );
    }
    if (!result) {
      throw unauthorized("Incorrect admin email or password");
    }

    attempts.delete(key);

    let token;
    try {
      token = await issueAdminSession(email.trim().toLowerCase());
    } catch (error) {
      console.error("[admin] could not create the admin session:", error);
      throw new HttpError(
        500,
        "Admin credentials were accepted, but the session could not be created: the admin_sessions table is missing. Run the migrations against the database this API uses."
      );
    }
    await logAudit({
      actorRole: "admin",
      action: AUDIT_ACTIONS.ADMIN_LOGIN,
      targetType: "admin",
      result: "ok",
    });

    res.json({ token, email: email.trim().toLowerCase() });
  })
);

adminRouter.use(requireAdmin);

adminRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    res.json({ email: req.admin.email });
  })
);

adminRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = (req.get("authorization") || "").split(" ")[1];
    if (token) await revokeAdminSession(hashToken(token));
    res.json({ ok: true });
  })
);

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

adminRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const totals = await queryOne(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'pending_review')::int AS "pendingReview",
              count(*) FILTER (WHERE status = 'pending_profile')::int AS "pendingProfile",
              count(*) FILTER (WHERE status = 'active')::int AS active,
              count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
              count(*) FILTER (WHERE status = 'suspended')::int AS suspended
         FROM users`
    );

    const { rows } = await query(
      `SELECT role, count(*)::int AS count FROM users GROUP BY role ORDER BY count DESC`
    );

    const byRole = Object.fromEntries(
      rows.map((row) => [row.role ?? "unassigned", row.count])
    );

    // Per portal, how far each account has got. "On the platform" means
    // active; everything else is still working towards it.
    const { rows: statusRows } = await query(
      `SELECT role, status, count(*)::int AS count
         FROM users GROUP BY role, status`
    );

    const byRoleStatus = {};
    for (const row of statusRows) {
      const key = row.role ?? "unassigned";
      byRoleStatus[key] = { ...(byRoleStatus[key] ?? {}), [row.status]: row.count };
    }

    res.json({ ...totals, byRole, byRoleStatus, configured: await adminConfigured() });
  })
);

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

function buildFilters({ status, role, q }) {
  const clauses = [];
  const params = [];

  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (role) {
    params.push(role);
    clauses.push(`role = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    clauses.push(
      `(lower(email) LIKE $${params.length} OR lower(full_name) LIKE $${params.length})`
    );
  }

  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { status, role, q, page = 1, limit = 25 } = parse(listQuery, req.query);
    const { where, params } = buildFilters({ status, role, q });

    const countRow = await queryOne(
      `SELECT count(*)::int AS total FROM users ${where}`,
      params
    );

    const offset = (page - 1) * limit;
    const { rows } = await query(
      `SELECT ${LIST_COLUMNS}
         FROM users
         ${where}
         -- The verification queue is what the panel opens on, so pending
         -- accounts sort above everything else rather than by recency alone.
         ORDER BY (status = 'pending_review') DESC, created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ users: rows, total: countRow?.total ?? 0, page, limit });
  })
);

adminRouter.get(
  "/users/:id",
  asyncHandler(async (req, res, nextFn) => {
    const { id } = parse(idParam, req.params);

    const user = await queryOne(
      `SELECT ${LIST_COLUMNS},
              ethics_agreed_at   AS "ethicsAgreedAt",
              ethics_version     AS "ethicsVersion",
              onboarded_at       AS "onboardedAt",
              personality_type   AS "personalityType",
              personality_label  AS "personalityLabel",
              reviewed_by        AS "reviewedBy"
         FROM users WHERE id = $1`,
      [id]
    );
    if (!user) return nextFn(notFound("No account with that reference"));

    const profile = await loadRoleProfile(user);
    res.json({ user, profile });
  })
);

/**
 * Approves an account.
 *
 * Approval never skips onboarding: the account goes back to
 * `pending_profile` so the person still has to complete their portal profile,
 * which is the route that promotes them to `active`. An account that already
 * has a profile (a re-approval after a rejection) goes straight back to
 * `active`.
 */
adminRouter.post(
  "/users/:id/approve",
  asyncHandler(async (req, res, nextFn) => {
    const { id } = parse(idParam, req.params);

    const user = await queryOne(
      "SELECT id, email, role, status FROM users WHERE id = $1",
      [id]
    );
    if (!user) return nextFn(notFound("No account with that reference"));
    if (user.status === "active") {
      return nextFn(badRequest("That account is already approved"));
    }

    const table = user.role ? ROLE_TABLES[user.role] : null;
    const existing = table
      ? await queryOne(`SELECT 1 FROM ${table} WHERE user_id = $1`, [user.id])
      : null;
    const nextStatus = existing ? "active" : "pending_profile";

    await query(
      `UPDATE users
          SET status = $2,
              review_note = NULL,
              reviewed_at = now(),
              reviewed_by = $3,
              updated_at = now()
        WHERE id = $1`,
      [user.id, nextStatus, req.admin.email]
    );

    await logAudit({
      actorRole: "admin",
      action: AUDIT_ACTIONS.ACCOUNT_APPROVED,
      targetType: "user",
      targetId: user.id,
      detail: { role: user.role, from: user.status, to: nextStatus },
    });

    const updated = await publicUser(user.id);
    res.json({ user: updated, status: nextStatus });
  })
);

/**
 * Rejects an account. They keep their credentials so they can sign in and read
 * the reason, but every portal route stays closed until a later approval.
 */
adminRouter.post(
  "/users/:id/reject",
  asyncHandler(async (req, res, nextFn) => {
    const { id } = parse(idParam, req.params);
    const { note } = parse(
      z.object({
        note: z
          .string()
          .trim()
          .max(500, "Keep the note under 500 characters")
          .optional()
          .transform((value) => value || null),
      }),
      req.body
    );

    const user = await queryOne(
      "SELECT id, role, status FROM users WHERE id = $1",
      [id]
    );
    if (!user) return nextFn(notFound("No account with that reference"));
    if (user.status === "rejected") {
      return nextFn(badRequest("That account is already rejected"));
    }

    await query(
      `UPDATE users
          SET status = 'rejected',
              review_note = $2,
              reviewed_at = now(),
              reviewed_by = $3,
              updated_at = now()
        WHERE id = $1`,
      [user.id, note, req.admin.email]
    );

    await logAudit({
      actorRole: "admin",
      action: AUDIT_ACTIONS.ACCOUNT_REJECTED,
      targetType: "user",
      targetId: user.id,
      detail: { role: user.role, from: user.status, to: "rejected", note: Boolean(note) },
    });

    const updated = await publicUser(user.id);
    res.json({ user: updated, status: "rejected" });
  })
);

export default adminRouter;
