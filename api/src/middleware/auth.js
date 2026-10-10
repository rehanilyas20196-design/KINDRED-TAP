import { hashToken, verifyToken } from "../lib/tokens.js";
import { sessionUserByTokenHash } from "../lib/users.js";

/**
 * Where an unverified account is sent while it waits for the admin.
 * `code` lets the web app pick a screen without re-deriving the rule.
 */
const UNVERIFIED = {
  pending_review: {
    code: "verification_required",
    error: "Your account is awaiting admin verification",
    next: "/verification/pending",
  },
  rejected: {
    code: "account_rejected",
    error: "Your account was not approved",
    next: "/verification/rejected",
  },
};

async function resolveSession(req, res, next, { allowUnverified }) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  try {
    verifyToken(token);
  } catch (err) {
    const message = err.name === "TokenExpiredError" ? "Session expired" : "Invalid token";
    return res.status(401).json({ error: message });
  }

  // One lookup covers both the live-session check and the user load.
  const user = await sessionUserByTokenHash(hashToken(token));

  if (!user) return res.status(401).json({ error: "Session expired, please sign in again" });
  if (user.status === "suspended") {
    return res.status(403).json({ error: "This account is suspended" });
  }

  // Everything except the "who am I" routes stays shut until the admin has
  // decided. The me routes opt in so the waiting screen can still render.
  const hold = allowUnverified ? null : UNVERIFIED[user.status];
  if (hold) {
    return res
      .status(403)
      .json({ error: hold.error, code: hold.code, next: hold.next });
  }

  req.user = user;
  return next();
}

export async function requireAuth(req, res, next) {
  return resolveSession(req, res, next, { allowUnverified: false });
}

/**
 * Same session checks, but an account waiting on (or refused by) the admin
 * still gets through. Only the routes that render those waiting screens use
 * this; every route that reads or writes portal data keeps `requireAuth`.
 */
export async function requireAuthAllowUnverified(req, res, next) {
  return resolveSession(req, res, next, { allowUnverified: true });
}

/**
 * Guards the onboarding order: personality test -> role -> role profile.
 * `next` in the response tells the web app exactly where to send the user.
 */
export function requireStep({ testCompleted, role, status } = {}) {
  return (req, res, next) => {
    const user = req.user;

    if (testCompleted === true && !user.testCompleted) {
      return res
        .status(403)
        .json({ error: "Complete the personality test first", next: "/personality-test" });
    }
    if (testCompleted === false && user.testCompleted) {
      return res
        .status(409)
        .json({ error: "Personality test already completed", next: "/choose-role" });
    }
    if (role && user.role !== role) {
      return res.status(403).json({
        error: `This account is registered as ${user.role}`,
        next: "/dashboard",
      });
    }
    if (role && user.status !== "active") {
      return res
        .status(403)
        .json({ error: `Complete your ${user.role} profile first`, next: `/signup/${user.role}` });
    }
    if (status && user.status !== status) {
      return res.status(403).json({ error: `Account must be ${status}` });
    }
    return next();
  };
}
