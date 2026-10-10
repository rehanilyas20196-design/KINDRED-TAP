import bcrypt from "bcryptjs";
import { query, queryOne } from "../db/index.js";
import { env } from "../env.js";
import { hashToken, signAdminToken } from "./tokens.js";

const BCRYPT_ROUNDS = 10;

/**
 * Admin credentials.
 *
 * The admin is deliberately not a row in `users`: there is nothing for the
 * admin list to show, nothing for an approval flow to approve, and no password
 * hash sitting in a table the rest of the product reads. The identity lives in
 * the environment instead - ADMIN_EMAIL plus a bcrypt ADMIN_PASSWORD_HASH -
 * and sessions live in `admin_sessions`.
 */

/** Same decoy hash the user login compares against, so a miss costs the same as a hit. */
const DECOY_HASH =
  "$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012";

let cached = null;

/** Resolves the configured credentials once; bcrypt of a plain password is not free. */
async function credentials() {
  if (cached) return cached;

  const email = env.adminEmail ? env.adminEmail.trim().toLowerCase() : null;
  let passwordHash = env.adminPasswordHash || null;

  if (!passwordHash && env.adminPassword) {
    passwordHash = await bcrypt.hash(env.adminPassword, BCRYPT_ROUNDS);
  }

  cached = { email, passwordHash };
  return cached;
}

/** True when the environment actually names an admin. */
export async function adminConfigured() {
  const { email, passwordHash } = await credentials();
  return Boolean(email && passwordHash);
}

/**
 * Checks an attempt without revealing which half was wrong. Returns `null`
 * when no admin is configured at all, so the caller can fail closed with a
 * message that says what to set rather than pretending the password was bad.
 */
export async function verifyAdminCredentials(email, password) {
  const configured = await adminConfigured();
  if (!configured) return null;

  const creds = await credentials();
  const emailMatches =
    creds.email === String(email ?? "").trim().toLowerCase();

  const ok = await bcrypt.compare(
    String(password ?? ""),
    emailMatches ? creds.passwordHash : DECOY_HASH
  );

  return emailMatches && ok;
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
