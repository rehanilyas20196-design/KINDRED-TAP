import bcrypt from "bcryptjs";
import { query, queryOne } from "../db/index.js";
import { env } from "../env.js";
import { hashToken, signAdminToken } from "./tokens.js";

const BCRYPT_ROUNDS = 10;

/**
 * Admin credentials.
 *
 * Two sources, checked in this order:
 *
 *   1. The environment - ADMIN_EMAIL plus a bcrypt ADMIN_PASSWORD_HASH. When
 *      both are set they win outright, which is useful for a one-off login
 *      without touching the database.
 *   2. The `admin_accounts` table, for when the environment says nothing.
 *
 * Either way the admin is deliberately not a row in `users`: there is nothing
 * for the admin list to show, nothing for an approval flow to approve, and no
 * password hash sitting in a table the rest of the product reads. Sessions
 * live in `admin_sessions`.
 */

/** Same decoy hash the user login compares against, so a miss costs the same as a hit. */
const DECOY_HASH =
  "$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012";

let envCache = null;

/** Resolves the environment credentials once; bcrypt of a plain password is not free. */
async function envCredentials() {
  if (envCache) return envCache;

  const email = env.adminEmail ? env.adminEmail.trim().toLowerCase() : null;
  let passwordHash = env.adminPasswordHash || null;

  if (!passwordHash && env.adminPassword) {
    passwordHash = await bcrypt.hash(env.adminPassword, BCRYPT_ROUNDS);
  }

  envCache = { email, passwordHash };
  return envCache;
}

/** True when either source actually names an active admin. */
export async function adminConfigured() {
  const fromEnv = await envCredentials();
  if (fromEnv.email && fromEnv.passwordHash) return true;

  const row = await queryOne(
    "SELECT 1 AS found FROM admin_accounts WHERE is_active LIMIT 1"
  );
  return Boolean(row);
}

/** Active database admin, matched the same way a login attempt would. */
async function databaseAdmin(email) {
  return queryOne(
    `SELECT id, email, password_hash
       FROM admin_accounts
      WHERE is_active AND lower(email) = lower($1)`,
    [String(email ?? "").trim()]
  );
}

/**
 * bcrypt throws on a hash it cannot parse. A mangled paste into
 * `admin_accounts.password_hash` is a data problem, not a server fault, so it
 * answers as a failed login - and says so in the log, where somebody can see
 * which of the two it was.
 */
async function comparePassword(password, storedHash) {
  try {
    return await bcrypt.compare(String(password ?? ""), storedHash);
  } catch (error) {
    console.error(
      "[admin] Stored password hash is not valid bcrypt; treating the attempt as failed:",
      error.message
    );
    return false;
  }
}

/**
 * Checks an attempt without revealing which half was wrong. Returns `null`
 * when no admin is configured at all, so the caller can fail closed with a
 * message that says what to set rather than pretending the password was bad.
 */
export async function verifyAdminCredentials(email, password) {
  const configured = await adminConfigured();
  if (!configured) return null;

  const fromEnv = await envCredentials();
  if (fromEnv.email && fromEnv.passwordHash) {
    const emailMatches =
      fromEnv.email === String(email ?? "").trim().toLowerCase();
    const ok = await comparePassword(
      password,
      emailMatches ? fromEnv.passwordHash : DECOY_HASH
    );
    return emailMatches && ok;
  }

  const row = await databaseAdmin(email);
  const ok = await comparePassword(password, row?.password_hash || DECOY_HASH);
  if (ok && row) {
    await query("UPDATE admin_accounts SET last_login_at = now() WHERE id = $1", [
      row.id,
    ]);
  }
  return ok;
}

/** Issues a revocable admin session and records its hash. */
export async function issueAdminSession(email) {
  const token = signAdminToken(email);
  await query(
    `INSERT INTO admin_sessions (token_hash, email, expires_at)
     VALUES ($1, $2, now() + interval '7 days')`,
    [hashToken(token), email]
  );
  // Opportunistic cleanup: nobody has to schedule a job for expired rows.
  await query("DELETE FROM admin_sessions WHERE expires_at < now()");
  return token;
}

/** Live session lookup used by requireAdmin. */
export async function adminSessionByTokenHash(tokenHash) {
  return queryOne(
    `SELECT email, expires_at FROM admin_sessions
      WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash]
  );
}

export async function revokeAdminSession(tokenHash) {
  await query("DELETE FROM admin_sessions WHERE token_hash = $1", [tokenHash]);
}
