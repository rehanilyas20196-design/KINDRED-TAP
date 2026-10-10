import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export function signToken(user) {
  // `jwtid` gives every token its own payload. Without it two logins in the
  // same second for the same person produce byte-identical tokens, and the
  // second insert into auth_tokens would collide on the primary key.
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role ?? null },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, jwtid: crypto.randomUUID() }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

/**
 * Admin session token. The `kind` claim is what separates it from a user
 * token: requireAdmin refuses anything without it, and requireAuth looks the
 * token up in `auth_tokens`, where an admin token never appears.
 */
export function signAdminToken(email) {
  return jwt.sign(
    { sub: "admin", email, kind: "admin" },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, jwtid: crypto.randomUUID() }
  );
}

/** Opaque, revocable token. Tokens are hashed before being stored. */
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}
