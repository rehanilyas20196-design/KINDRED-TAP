import { Router } from "express";
import { query } from "../db/index.js";
import { asyncHandler, badRequest, conflict, parse } from "../middleware/asyncHandler.js";
import { requireAuth, requireStep } from "../middleware/auth.js";
import { personalitySubmissionSchema } from "../lib/schemas.js";
import { LIKERT_OPTIONS, TRAITS } from "../data/personalityQuestions.js";
import { scorePersonality } from "../services/personality.js";
import { nextStepFor, publicUser } from "../lib/users.js";

export const personalityRouter = Router();

personalityRouter.get(
  "/questions",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, position, prompt, hint, trait
         FROM personality_questions
        WHERE active = true
        ORDER BY position`
    );

    res.json({ questions: rows, options: LIKERT_OPTIONS, traits: TRAITS, total: rows.length });
  })
);

/** Scoring runs server side so a result can never be edited in the browser. */
personalityRouter.post(
  "/submit",
  requireAuth,
  requireStep({ testCompleted: false }),
  asyncHandler(async (req, res) => {
    const { answers } = parse(personalitySubmissionSchema, req.body);

    const { rows: questions } = await query(
      `SELECT id, position, trait, reverse
         FROM personality_questions
        WHERE active = true
        ORDER BY position`
    );

    const seen = new Set();
    for (const answer of answers) {
      if (seen.has(answer.questionId)) throw badRequest("Duplicate answer submitted");
      seen.add(answer.questionId);
    }

    const result = scorePersonality(questions, answers);

    await query(
      `UPDATE users
          SET test_completed     = true,
              personality_type   = $2,
              personality_label  = $3,
              personality_scores = $4,
              personality_answers = $5,
              updated_at         = now()
        WHERE id = $1`,
      [
        req.user.id,
        result.archetype.key,
        result.archetype.label,
        JSON.stringify({
          traits: result.traits,
          scores: result.scores,
          roleFit: result.roleFit,
          archetype: result.archetype,
          secondaryArchetype: result.secondaryArchetype,
        }),
        JSON.stringify(answers.map((a) => ({ questionId: a.questionId, value: a.value }))),
      ]
    );

    const user = await publicUser(req.user.id);
    res.json({ result, user, next: nextStepFor(user) });
  })
);

personalityRouter.get(
  "/result",
  requireAuth,
  requireStep({ testCompleted: true }),
  asyncHandler(async (req, res) => {
    const user = await publicUser(req.user.id);
    if (!user?.personalityType) throw conflict("No personality result stored yet");

    res.json({
      type: user.personalityType,
      label: user.personalityLabel,
      result: user.personalityScores,
    });
  })
);

export default personalityRouter;
