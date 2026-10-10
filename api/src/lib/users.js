import { query, queryOne } from "../db/index.js";
import { ROLE_TABLES } from "./roles.js";

/**
 * Every user row that leaves the API goes through these aliases, so the web
 * app always sees camelCase no matter which helper loaded the row.
 */
export const PUBLIC_USER_COLUMNS = [
  "id",
  "email",
  'full_name          AS "fullName"',
  "role",
  "status",
  'terms_accepted_at  AS "termsAcceptedAt"',
  'ethics_agreed_at   AS "ethicsAgreedAt"',
  'ethics_version     AS "ethicsVersion"',
  'ethics_accepted    AS "ethicsAccepted"',
  'test_completed     AS "testCompleted"',
  'personality_type   AS "personalityType"',
  'personality_label  AS "personalityLabel"',
  'personality_scores AS "personalityScores"',
  'onboarded_at       AS "onboardedAt"',
  'last_login_at      AS "lastLoginAt"',
  'review_note        AS "reviewNote"',
  'reviewed_at        AS "reviewedAt"',
  'created_at         AS "createdAt"',
];

const columnsFor = (prefix = "") => PUBLIC_USER_COLUMNS.map((c) => `${prefix}${c}`).join(",\n  ");

/**
 * Finds an account by email. One email owns exactly one account (see the
 * unique index on lower(email)), so the portal it belongs to shows up as the
 * row's role.
 */
export async function findUserByEmail(email) {
  const { rows } = await query("SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1", [
    email,
  ]);
  return rows[0] ?? null;
}

export async function publicUser(id) {
  const { rows } = await query(`SELECT ${columnsFor()} FROM users WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/**
 * Resolves a live session to its owner in one round trip. Used by requireAuth
 * so the shape matches `publicUser` exactly.
 */
export async function sessionUserByTokenHash(tokenHash) {
  return queryOne(
    `SELECT ${columnsFor("u.")}
       FROM auth_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1
        AND t.expires_at > now()`,
    [tokenHash]
  );
}

export async function loadRoleProfile(user) {
  const table = ROLE_TABLES[user?.role];
  if (!table) return null;

  const { rows } = await query(`SELECT * FROM ${table} WHERE user_id = $1 LIMIT 1`, [user.id]);
  if (!rows[0]) return null;

  const { user_id: _id, created_at: createdAt, updated_at: updatedAt, ...rest } = rows[0];
  return { ...rest, userId: user.id, createdAt, updatedAt };
}

/**
 * Where the person should be sent next. The API returns this with every auth
 * response so the web app never has to reimplement the rules.
 */
export function nextStepFor(user) {
  if (!user) return "/login";
  if (!user.role) return "/choose-portal";
  // Waiting on, or refused by, the admin: nowhere in the portal yet.
  if (user.status === "pending_review") return "/verification/pending";
  if (user.status === "rejected") return "/verification/rejected";
  if (user.status !== "active") return `/portal/${user.role}/profile`;
  return `/portal/${user.role}`;
}
