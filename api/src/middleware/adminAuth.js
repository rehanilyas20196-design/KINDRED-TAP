import { adminSessionByTokenHash } from "../lib/admin.js";
import { hashToken, verifyToken } from "../lib/tokens.js";

/**
 * Guards every /api/admin route.
 *
 * Three independent checks have to pass: the token is a valid JWT, it was
 * signed as an admin session (`kind: "admin"`), and its hash is still a live
 * row in `admin_sessions`. A user token fails the second check and an expired
 * or revoked one fails the third.
 */
export async function requireAdmin(req, res, next) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    const message = err.name === "TokenExpiredError" ? "Session expired" : "Invalid token";
    return res.status(401).json({ error: message });
  }

  if (payload.kind !== "admin") {
    return res.status(401).json({ error: "Admin session required" });
  }

  const session = await adminSessionByTokenHash(hashToken(token));
  if (!session) {
    return res.status(401).json({ error: "Session expired, please sign in again" });
  }

  req.admin = { email: session.email };
  return next();
}
