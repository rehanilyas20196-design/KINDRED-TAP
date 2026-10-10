import { Router } from "express";
import { z } from "zod";
import { query } from "../db/index.js";
import { asyncHandler, parse } from "../middleware/asyncHandler.js";
import { requireAuth, requireAuthAllowUnverified } from "../middleware/auth.js";
import { loadRoleProfile, nextStepFor, publicUser } from "../lib/users.js";
import {
  ALL_ROLE_META,
  ETHICS_VERSION,
  OPTIONS,
} from "../lib/roles.js";
import { LIKERT_OPTIONS, TRAITS } from "../data/personalityQuestions.js";

export const meRouter = Router();

/**
 * "Who am I" has to answer for an account that is still waiting on the admin,
 * otherwise the waiting screen has nothing to show. Writing to the account
 * stays behind the strict guard.
 */
meRouter.get(
  "/",
  requireAuthAllowUnverified,
  asyncHandler(async (req, res) => {
    const user = await publicUser(req.user.id);
    const profile = await loadRoleProfile(user);
    res.json({ user, profile, next: nextStepFor(user) });
  })
);

meRouter.patch(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { fullName } = parse(
      z.object({
        fullName: z
          .string()
          .trim()
          .min(2, "Full name must be at least 2 characters")
          .max(120, "Full name must be 120 characters or fewer"),
      }),
      req.body
    );

    await query("UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1", [
      req.user.id,
      fullName,
    ]);

    const user = await publicUser(req.user.id);
    res.json({ user, profile: await loadRoleProfile(user), next: nextStepFor(user) });
  })
);

/**
 * The six portals, their journeys and every option list used by the signup
 * forms. Keeping this on the server means the picker and the forms can never
 * drift from the validation rules.
 */
export const metaRouter = Router();

metaRouter.get("/portals", (req, res) => {
  res.json({ portals: ALL_ROLE_META, ethicsVersion: ETHICS_VERSION });
});

metaRouter.get("/options", (req, res) => {
  res.json({ options: OPTIONS, likert: LIKERT_OPTIONS, traits: TRAITS });
});

export default meRouter;
