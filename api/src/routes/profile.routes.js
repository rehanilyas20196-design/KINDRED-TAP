import { Router } from "express";
import { query, transaction } from "../db/index.js";
import { asyncHandler, badRequest, parse } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { profileSchemas, toColumns } from "../lib/schemas.js";
import { ROLE_LABELS, ROLE_REQUIRES_ADMIN_APPROVAL, ROLE_TABLES } from "../lib/roles.js";
import { loadRoleProfile, nextStepFor, publicUser } from "../lib/users.js";
import { grantDefaultPermissions } from "../lib/permissions.js";
import {
  grantDefaultSupervisorPermissions,
  SUPERVISOR_ROLE,
} from "../lib/supervisor.js";
import {
  CLINIC_ROLE,
  ensurePartnerOrganization,
  grantDefaultClinicPermissions,
} from "../lib/clinic.js";
import { generateAndStoreTherapistEmbedding } from "../services/geminiMatching.js";

export const profileRouter = Router();

profileRouter.use(requireAuth);

/**
 * Saves the details unique to a portal. One route, six schemas, chosen by the
 * role captured at signup.
 *
 * This is also the gate: the save either opens the portal (`active`) or hands
 * the filled-in form to the admin (`pending_review`), never both at once. The
 * `next` in the response says which happened, so the web app never re-derives
 * it.
 *
 * No personality-test guard here on purpose. The profile is what decides an
 * account's standing, so guarding it behind the test strands anyone who took
 * the test before filling in their profile: the test can never be undone, so
 * they would be locked out permanently. The test stays optional context.
 */
profileRouter.put(
  "/:role",
  asyncHandler(async (req, res, nextFn) => {
    const { role } = req.params;
    const table = ROLE_TABLES[role];
    const schema = profileSchemas[role];

    if (!table || !schema) return nextFn(badRequest(`Unknown portal "${role}"`));

    // A person cannot write into a portal they did not sign up for.
    if (req.user.role && req.user.role !== role) {
      return nextFn(
        badRequest(
          `Your account belongs to the ${ROLE_LABELS[req.user.role]} portal, not ${ROLE_LABELS[role]}.`
        )
      );
    }

    const data = parse(schema, req.body);
    const { columns, values } = toColumns(role, data);

    // The admin reviews a filled-in form, not an empty record, so a portal
    // that needs verification only enters the queue on this save - which is
    // the first moment there is anything to review. An account that is
    // already active is somebody editing their own profile, and editing
    // never demotes them back into the queue.
    const nextStatus =
      req.user.status === "pending_profile" && ROLE_REQUIRES_ADMIN_APPROVAL[role]
        ? "pending_review"
        : "active";

    await transaction(async (tx) => {
      await tx.query(
        `UPDATE users
            SET role = $2,
                status = $3,
                onboarded_at = COALESCE(onboarded_at, now()),
                updated_at = now()
          WHERE id = $1`,
        [req.user.id, role, nextStatus]
      );

      const placeholders = columns.map((_, i) => `$${i + 2}`).join(", ");
      const assignments = columns.map((c, i) => `${c} = $${i + 2}`).join(", ");

      await tx.query(
        `INSERT INTO ${table} (user_id, ${columns.join(", ")}, updated_at)
         VALUES ($1, ${placeholders}, now())
         ON CONFLICT (user_id) DO UPDATE SET ${assignments}, updated_at = now()`,
        [req.user.id, ...values]
      );
    });

    // Generate/update embedding for therapists when profile changes
    if (role === "therapist") {
      generateAndStoreTherapistEmbedding(req.user.id).catch((err) => {
        console.error("[profile] Embedding generation failed:", err.message);
      });
    }

    // An advisor starts with the default permission set. Idempotent, so
    // re-saving the profile never duplicates a grant or revokes one that was
    // deliberately changed later.
    if (role === "clinical_advisor") {
      await grantDefaultPermissions(req.user.id, req.user.id);
    }

    // A clinic supervisor starts with the supervisor permission set. This is
    // separate from the advisor grant above: the two roles hold different
    // permissions, and a supervisor must never receive advisor rows (or vice
    // versa) just because the profile route is shared.
    if (role === SUPERVISOR_ROLE) {
      await grantDefaultSupervisorPermissions(req.user.id, req.user.id);
    }

    // A partner clinic starts with the collaborative clinic permission set, and
    // with its own organization row plus membership. The organization is what
    // every other query in the portal filters on, so it is created here - at the
    // moment the profile is completed - rather than lazily on first request.
    if (role === CLINIC_ROLE) {
      await grantDefaultClinicPermissions(req.user.id, req.user.id);
      await ensurePartnerOrganization(req.user.id);
    }

    const user = await publicUser(req.user.id);
    const profile = await loadRoleProfile(user);
    res.json({ user, profile, next: nextStepFor(user) });
  })
);

profileRouter.get(
  "/:role",
  asyncHandler(async (req, res, nextFn) => {
    const { role } = req.params;
    if (!ROLE_TABLES[role]) return nextFn(badRequest(`Unknown portal "${role}"`));
    if (req.user.role !== role) {
      return nextFn(
        badRequest(`Your account belongs to the ${ROLE_LABELS[req.user.role]} portal.`)
      );
    }

    const profile = await loadRoleProfile({ role, id: req.user.id });
    if (!profile) return nextFn(badRequest("Complete your portal profile first"));
    res.json({ profile });
  })
);

export default profileRouter;
