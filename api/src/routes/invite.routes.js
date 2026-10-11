import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { queryOne, query } from "../db/index.js";
import {
  asyncHandler,
  badRequest,
  conflict,
  forbidden,
  notFound,
  parse,
} from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { hashToken, newSessionToken, signToken } from "../lib/tokens.js";
import { findUserByEmail, publicUser } from "../lib/users.js";
import { notify } from "../lib/notifications.js";

/**
 * QR-code portal invites.
 *
 * A signed-in member of the Collaborative Clinic or the Supporter Portal
 * generates a one-time QR code, prints, downloads or shares it, and whoever
 * scans it lands on the join page. The scan itself grants nothing: the person
 * asking still has to say who they are, and the request appears on the
 * owner's account. Only the owner's Accept can turn the scan into a session;
 * Declining ends the attempt with "authentication failed" on the joiner's
 * screen.
 */
export const inviteRouter = Router();

const CODE_BYTES = 24;

/** Unguessable public code; base64url so it survives print and share. */
function newInviteCode() {
  return crypto.randomBytes(CODE_BYTES).toString("base64url");
}

const inviteColumns = `
  i.id,
  i.code,
  i.role,
  i.status,
  i.joiner_email      AS "joinerEmail",
  i.joiner_full_name  AS "joinerFullName",
  i.joiner_note       AS "joinerNote",
  i.requested_at      AS "requestedAt",
  i.decision_at       AS "decisionAt",
  i.expires_at        AS "expiresAt",
  i.created_at        AS "createdAt"
`;

/* ------------------------------------------------------------------ */
/* Public scanner routes (no session - the person just scanned a print) */
/* ------------------------------------------------------------------ */

const scanner = Router();

const scanSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  note: z.string().trim().max(500).optional(),
  device: z.string().max(200).optional(),
});

/**
 * The scanner side loads internals too: `ownerId` drives the notification and
 * `joinerTokenHash` is the one-time session slot `claim` spends. Neither ever
 * leaves the API - `scannerView` picks only what a stranger may see.
 */
async function loadByCode(code) {
  const invite = await queryOne(
    `SELECT ${inviteColumns},
            i.owner_id          AS "ownerId",
            i.joiner_user_id    AS "joinerUserId",
            i.joiner_token_hash AS "joinerTokenHash"
       FROM portal_invites i
      WHERE i.code = $1 LIMIT 1`,
    [code]
  );
  return invite ?? null;
}

const PUBLIC_STATES = ["pending", "approved", "declined", "used", "revoked"];

/** Map a row's status to what the join page may show a stranger. */
function scannerView(invite) {
  // 'pending' with nobody having scanned yet is just "waiting for scan";
  // 'pending' with joiner details is "waiting for the owner's decision".
  const waiting = invite.status === "pending" && Boolean(invite.joinerEmail);
  return {
    code: invite.code,
    role: invite.role,
    state: waiting ? "awaiting_decision" : invite.status,
    // Shown on the waiting screen, so the person knows who they asked as.
    email: invite.joinerEmail,
    decisionAt: invite.decisionAt,
  };
}

/**
 * GET /api/invites/:code/status
 * What the join page shows while the owner decides. No credentials: the
 * capability is the invite code itself.
 */
scanner.get(
  "/:code/status",
  asyncHandler(async (req, res) => {
    const invite = await loadByCode(req.params.code);
    if (!invite) throw notFound("This QR code is not recognised");
    res.json(scannerView(invite));
  })
);

/**
 * POST /api/invites/:code/scan
 * The person scanned the code and filled the join form. This records who
 * they are and notifies the owner; nothing has been granted yet.
 */
scanner.post(
  "/:code/scan",
  asyncHandler(async (req, res) => {
    const invite = await loadByCode(req.params.code);
    if (!invite) throw notFound("This QR code is not recognised");

    if (invite.status !== "pending") {
      throw conflict(
        "This QR code has already been used. Ask for a fresh code from the person who shared it."
      );
    }
    if (new Date(invite.expiresAt) < new Date()) {
      throw conflict("This QR code has expired. Ask for a fresh one.");
    }

    const { email, fullName, note, device } = parse(scanSchema, req.body);

    // One scan in flight at a time per invite; whoever scanned last wins so
    // a mistyped email can simply be re-submitted before the owner decides.
    await query(
      `UPDATE portal_invites
          SET joiner_email = $2,
              joiner_full_name = $3,
              joiner_note = $4,
              joiner_device = $5,
              requested_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [invite.id, email.toLowerCase(), fullName, note ?? null, device ?? null]
    );

    await notify({
      userId: invite.ownerId,
      type: "appointment_request",
      title: "QR authentication request",
      body: `${fullName} (${email}) scanned your QR code and is waiting for your decision.`,
      key: `invite-scan-${invite.id}`,
    });

    res.status(202).json({ ok: true, ...scannerView({ ...invite, joinerEmail: email }) });
  })
);/**
 * POST /api/invites/:code/claim
 * Called by the joiner's device after the owner accepts. One-time: the first
 * claim takes the session token out of its single-use slot and the invite is
 * closed for good, so a saved copy of the QR can never mint a second session.
 */
scanner.post(
  "/:code/claim",
  asyncHandler(async (req, res) => {
    const invite = await loadByCode(req.params.code);
    if (!invite) throw notFound("This QR code is not recognised");

    if (invite.status !== "used" || !invite.joinerUserId) {
      throw conflict("The owner has not approved this request yet.");
    }

    // The acceptance inserted a single session for this scan. Claiming it
    // clears the joiner link: whichever device wins gets in, and nobody else
    // can pull the same session out of the code again.
    const claimed = await query(
      `UPDATE portal_invites
          SET joiner_token_hash = NULL
        WHERE id = $1
          AND joiner_token_hash IS NOT NULL`,
      [invite.id]
    );
    // RETURNING would give the new (NULL) value; the guard row count is what
    // proves this device is the first claimer. The slot value itself was read
    // with the invite above.
    if (claimed.rowCount === 0 || !invite.joinerTokenHash) {
      throw conflict("This QR code's access has already been claimed.");
    }

    // If the joiner already has an account it keeps its own portal; an
    // invited newcomer goes to the inviting portal's profile step.
    const account = await publicUser(invite.joinerUserId);
    const token = signToken(account);
    await query(
      `INSERT INTO auth_tokens (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + interval '7 days')`,
      // The session row must match the bearer token just handed out; the
      // joiner_token_hash slot only served as the one-time claim flag.
      [hashToken(token), account.id]
    );

    await query("UPDATE users SET last_login_at = now() WHERE id = $1", [account.id]);

    res.json({
      ok: true,
      token,
      user: account,
      // The owner's acceptance is the join: the scanner goes straight to
      // their portal's profile page to add their information.
      next: `/portal/${account.role}/profile`,
    });
  })
);

inviteRouter.use(scanner);

/* ------------------------------------------------------------------ */
/* Owner routes (session required)                                     */
/* ------------------------------------------------------------------ */

const owner = Router();
owner.use(requireAuth);

const generateSchema = z.object({
  role: z.enum(["collaborative_clinic", "supporter"]),
});

async function loadOwned(id, ownerId) {
  const invite = await queryOne(
    `SELECT ${inviteColumns} FROM portal_invites i WHERE i.id = $1 AND i.owner_id = $2 LIMIT 1`,
    [id, ownerId]
  );
  if (!invite) throw notFound("Invite not found");
  return invite;
}

/**
 * POST /api/invites/generate
 * Creates the one-time QR invite for the signed-in account. The response
 * carries everything the card needs: the code, the join URL the QR encodes
 * and the message making the one-time nature explicit.
 */
owner.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const { role } = parse(generateSchema, req.body);

    if (!["collaborative_clinic", "supporter"].includes(role)) {
      throw forbidden("This portal cannot generate QR invites.");
    }
    if (req.user.role !== role) {
      throw forbidden("This QR code can only be generated from your own portal.");
    }

    // One live invite per account: a stale code is revoked so the previously
    // printed copy can never be used after a new one is issued.
    await query(
      `UPDATE portal_invites
          SET status = 'revoked', updated_at = now()
        WHERE owner_id = $1 AND status = 'pending'`,
      [req.user.id]
    );

    const code = newInviteCode();
    const { rows } = await query(
      `INSERT INTO portal_invites (owner_id, code, role)
       VALUES ($1, $2, $3)
       RETURNING id, code, role, status,
                 expires_at AS "expiresAt", created_at AS "createdAt"`,
      [req.user.id, code, role]
    );

    res.status(201).json({
      invite: rows[0],
      // Path the QR image is generated from; contains no credentials.
      joinUrl: `/invite/${code}`,
      qrPayload: code,
      message:
        "This QR code is one-time — save it now. Print or download it, then share it securely. Only one person can use it, and they still need your approval to get in.",
    });
  })
);

/** GET /api/invites — the account's invites, newest first. */
owner.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ${inviteColumns} FROM portal_invites i
        WHERE i.owner_id = $1
        ORDER BY i.created_at DESC`,
      [req.user.id]
    );
    res.json({ invites: rows });
  })
);

/**
 * GET /api/invites/pending — the authentication inbox: scans waiting for
 * the owner's accept or reject.
 */
owner.get(
  "/pending",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ${inviteColumns} FROM portal_invites i
        WHERE i.owner_id = $1 AND i.status = 'pending' AND i.joiner_email IS NOT NULL
        ORDER BY i.requested_at DESC`,
      [req.user.id]
    );
    res.json({ requests: rows });
  })
);

/**
 * POST /api/invites/:id/accept
 * The owner's approval is the only path from scan to session. It links (or
 * creates) the joiner's account in this portal and leaves the invite in the
 * `used` state, which the joiner's device claims to receive its session.
 */
owner.post(
  "/:id/accept",
  asyncHandler(async (req, res) => {
    const invite = await loadOwned(req.params.id, req.user.id);

    if (invite.status !== "pending" || !invite.joinerEmail) {
      throw conflict("This request has already been handled or is still waiting for a scan.");
    }

    const email = invite.joinerEmail;

    // An existing account keeps its role: a scan must never change what
    // somebody's account is. A newcomer is created straight in this portal.
    let account = await findUserByEmail(email);
    if (!account) {
      const { rows } = await query(
        `INSERT INTO users (email, password_hash, full_name, role, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING id`,
        [
          email,
          //nologin: an unguessable password nobody was ever given, so the
          // account is reachable only through the invites it was accepted by.
          await bcrypt.hash(newSessionToken(), 10),
          invite.joinerFullName ?? email.split("@")[0],
          invite.role,
        ]
      );
      account = { id: rows[0].id };
    }

    await query(
      `UPDATE portal_invites
          SET status = 'used',
              joiner_user_id = $2,
              decision_at = now(),
              joiner_token_hash = $3,
              updated_at = now()
        WHERE id = $1`,
      [invite.id, account.id, hashToken(newSessionToken())]
    );

    await notify({
      userId: req.user.id,
      type: "session_updated",
      title: "QR invite accepted",
      body: `${email} was approved and can now use ${invite.role === "supporter" ? "the Supporter Portal" : "the Collaborative Clinic Portal"}.`,
      key: `invite-approved-${invite.id}`,
    });

    res.json({ ok: true, invite: { ...invite, status: "used" } });
  })
);

/** POST /api/invites/:id/decline — "authentication failed" for the scanner. */
owner.post(
  "/:id/decline",
  asyncHandler(async (req, res) => {
    const invite = await loadOwned(req.params.id, req.user.id);

    if (invite.status !== "pending" || !invite.joinerEmail) {
      throw conflict("This request has already been handled or is still waiting for a scan.");
    }

    await query(
      `UPDATE portal_invites
          SET status = 'declined', decision_at = now(), updated_at = now()
        WHERE id = $1`,
      [invite.id]
    );

    await notify({
      userId: req.user.id,
      type: "session_updated",
      title: "QR invite declined",
      body: `${invite.joinerEmail} was not approved.`,
      key: `invite-declined-${invite.id}`,
    });

    res.json({ ok: true, invite: { ...invite, status: "declined" } });
  })
);

/** POST /api/invites/:id/revoke — retire a printed code before it expires. */
owner.post(
  "/:id/revoke",
  asyncHandler(async (req, res) => {
    const invite = await loadOwned(req.params.id, req.user.id);
    if (["used", "declined", "revoked"].includes(invite.status)) {
      throw conflict("This invite is already closed.");
    }
    await query(
      `UPDATE portal_invites
          SET status = 'revoked', updated_at = now()
        WHERE id = $1`,
      [invite.id]
    );
    res.json({ ok: true, invite: { ...invite, status: "revoked" } });
  })
);

inviteRouter.use(owner);

export default inviteRouter;
