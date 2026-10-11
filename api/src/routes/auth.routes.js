import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db/index.js";
import {
  asyncHandler,
  badRequest,
  conflict,
  parse,
  unauthorized,
} from "../middleware/asyncHandler.js";
import { requireAuth, requireAuthAllowUnverified } from "../middleware/auth.js";
import { loginSchema, signupSchema } from "../lib/schemas.js";
import {
  ETHICS_VERSION,
  ROLE_PORTAL_NAMES,
  ROLE_REQUIRES_ETHICS,
} from "../lib/roles.js";
import { findUserByEmail, loadRoleProfile, nextStepFor, publicUser } from "../lib/users.js";
import { hashToken, signToken } from "../lib/tokens.js";

export const authRouter = Router();

const BCRYPT_ROUNDS = 10;

/** Issues a token and records its hash so the session stays revocable. */
async function issueSession(user) {
  const token = signToken(user);
  await query(
    `INSERT INTO auth_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '7 days')`,
    [hashToken(token), user.id]
  );
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
  return token;
}

authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { email, password, fullName, confirmPassword, role, ethicsAccepted } =
      parse(signupSchema, req.body);

    if (confirmPassword !== undefined && confirmPassword !== password) {
      throw badRequest("Passwords do not match");
    }

    // One email owns one account, so a second portal cannot claim it: the
    // person has to make the account with a different email.
    if (await findUserByEmail(email)) {
      throw conflict(
        "That email is already registered. Sign in instead, or use a different email.",
        { next: `/login/${role}` }
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const needsEthics = ROLE_REQUIRES_ETHICS[role];
    const ethicsAgreed = needsEthics && ethicsAccepted === true;
    // Signup opens the form, never the portal. Everyone starts at the profile
    // step so the account has something on it; the three professional portals
    // are handed to the admin for verification by the profile route, once the
    // form that they are meant to review has actually been filled in.
    const status = "pending_profile";

    // Signup sets the portal straight away, so each person lands in the right
    // portal instead of choosing later.
    const { rows } = await query(
      `INSERT INTO users (
         email, password_hash, full_name, role, status,
         terms_accepted_at, ethics_agreed_at, ethics_version, ethics_accepted
       )
       VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8)
       RETURNING id`,
      [
        email,
        passwordHash,
        fullName,
        role,
        status,
        ethicsAgreed ? new Date() : null,
        ethicsAgreed ? ETHICS_VERSION : null,
        ethicsAgreed,
      ]
    );

    const user = await publicUser(rows[0].id);
    const token = await issueSession(user);

    res.status(201).json({
      token,
      user,
      portal: role,
      next: nextStepFor(user),
    });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password, portal } = parse(loginSchema, req.body);

    // One account per email, so the portal it sits in is this row's role.
    const record = await findUserByEmail(email);

    // Always compare against a hash so timing does not reveal whether the
    // account exists.
    const fallback = "$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012";
    const ok = await bcrypt.compare(password, record?.password_hash ?? fallback);

    if (!record || !ok) {
      throw unauthorized("Incorrect email or password");
    }

    // The account belongs to another portal — say which one rather than a flat
    // failure. Only somebody who already holds a working password gets here.
    if (portal && record.role !== portal) {
      throw unauthorized(
        `That account belongs to the ${
          ROLE_PORTAL_NAMES[record.role] ?? "Kindred Tap"
        }. Sign in there, or create a ${ROLE_PORTAL_NAMES[portal]} account.`
      );
    }

    const user = await publicUser(record.id);
    const token = await issueSession(user);

    res.json({ token, user, next: nextStepFor(user) });
  })
);

/** Silent re-authentication on page load. Unverified accounts need this to
 *  render the waiting screen, so it runs on the permissive guard. */
authRouter.get(
  "/me",
  requireAuthAllowUnverified,
  asyncHandler(async (req, res) => {
    const user = await publicUser(req.user.id);
    const profile = await loadRoleProfile(user);
    res.json({ user, profile, next: nextStepFor(user) });
  })
);

authRouter.post(
  "/logout",
  requireAuthAllowUnverified,
  asyncHandler(async (req, res) => {
    const token = (req.get("authorization") || "").split(" ")[1];
    if (token) {
      await query("DELETE FROM auth_tokens WHERE token_hash = $1", [hashToken(token)]);
    }
    res.json({ ok: true });
  })
);

/**
 * POST /api/auth/change-password
 *
 * Requires the current password rather than trusting the session alone: a
 * stolen token must not be enough to lock the real owner out of their own
 * account. Changing it signs every other device out and keeps this one.
 */
authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = parse(
      z.object({
        currentPassword: z.string().min(1, "Enter your current password"),
        newPassword: z
          .string()
          .min(8, "Use at least 8 characters")
          .max(200, "That password is too long"),
      }),
      req.body
    );

    // Keyed by id: the session already names this account, so the lookup never
    // depends on an address that might have been changed meanwhile.
    const { rows } = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [req.user.id]);
    const record = rows[0];
    const ok = record && (await bcrypt.compare(currentPassword, record.password_hash));
    if (!ok) throw badRequest("Your current password is not correct");

    if (await bcrypt.compare(newPassword, record.password_hash)) {
      throw badRequest("Choose a password you are not already using here");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [
      req.user.id,
      passwordHash,
    ]);

    // Every other session dies with the old password; this one survives.
    const token = (req.get("authorization") || "").split(" ")[1];
    if (token) {
      await query(
        "DELETE FROM auth_tokens WHERE user_id = $1 AND token_hash <> $2",
        [req.user.id, hashToken(token)]
      );
    }

    res.json({ ok: true, message: "Password updated" });
  })
);

export default authRouter;
