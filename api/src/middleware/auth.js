import { hashToken, verifyToken } from "../lib/tokens.js";
import { sessionUserByTokenHash } from "../lib/users.js";

export async function requireAuth(req, res, next) {
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

  req.user = user;
  return next();
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
