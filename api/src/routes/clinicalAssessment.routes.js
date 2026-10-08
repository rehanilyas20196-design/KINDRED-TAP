/**
 * Concern assessment and current-concern endpoints.
 *
 * Everything here is scoped to the signed-in user. Assessments, answers and
 * results are sensitive records, so authorisation is enforced on each read and
 * write rather than trusting an id arriving from the browser.
 */

import { Router } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../db/index.js";
import {
  asyncHandler,
  badRequest,
  conflict,
  forbidden,
  notFound,
  parse,
} from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyTherapistsOfClient } from "../lib/notifications.js";
import { analyse, concernScore } from "../services/aiAnalysis.js";
import {
  assessmentAnswersSchema,
  completeAssessmentSchema,
  currentConcernSchema,
} from "../lib/schemas.js";

export const clinicalRouter = Router();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * The active issue vocabulary, straight from the table.
 *
 * Deliberately not an enum in the schema: categories are meant to be
 * configurable, so the API validates against data rather than hardcoding a list
 * that would drift out of sync with the database.
 */
async function activeIssues() {
  const { rows } = await query(
    `SELECT id, key, label, description, position
       FROM issues
      WHERE active = true
      ORDER BY position, label`
  );
  return rows;
}

/** True when `key` names a real, active issue. */
async function issueExists(key) {
  const row = await queryOne("SELECT id FROM issues WHERE key = $1 AND active = true", [key]);
  return Boolean(row);
}

/**
 * Loads an assessment and asserts the caller owns it.
 *
 * Returns the row; throws 404 for a missing one and 403 for someone else's.
 * A 403 rather than a 404 on the ownership failure is a deliberate tradeoff:
 * these ids are UUIDs, so it does not meaningfully help someone enumerate.
 */
async function ownedAssessment(assessmentId, userId) {
  const zod = z.string().uuid().safeParse(assessmentId);
  if (!zod.success) throw badRequest("That assessment id is not valid");

  const row = await queryOne(
    `SELECT id, user_id, status, type, started_at, completed_at
       FROM assessments
      WHERE id = $1`,
    [assessmentId]
  );
  if (!row) throw notFound("Assessment not found");
  if (row.user_id !== userId) throw forbidden("That assessment belongs to someone else");
  return row;
}

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

/**
 * GET /api/clinical/issues - powers every concern picker in the UI.
 */
clinicalRouter.get(
  "/issues",
  requireAuth,
  asyncHandler(async (req, res) => {
    const issues = await activeIssues();
    res.json({ issues, total: issues.length });
  })
);

/**
 * GET /api/clinical/questions?test=1
 *
 * `test` is optional. Omitting it returns both, which is what a resume flow
 * wants; the two-step screen passes it explicitly.
 */
clinicalRouter.get(
  "/questions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const test = req.query.test === undefined ? null : Number(req.query.test);
    if (test !== null && ![1, 2].includes(test)) {
      throw badRequest("test must be 1 or 2");
    }

    const params = [];
    let filter = "";
    if (test !== null) {
      params.push(test);
      filter = `AND test_number = $${params.length}`;
    }

    const { rows } = await query(
      `SELECT id, position, test_number, category, prompt, question_type,
              options, scoring_config, required
         FROM assessment_questions
        WHERE active = true
        ${filter}
        ORDER BY test_number, position`,
      params
    );

    // Options are per question and live in the database, so a new question needs
    // no code change. `reverse` is stripped out of what reaches the browser:
    // it is scoring metadata, and the UI has no business knowing which way an
    // item is keyed.
    const questions = rows.map((question) => ({
      id: question.id,
      position: question.position,
      testNumber: question.test_number,
      category: question.category,
      prompt: question.prompt,
      questionType: question.question_type,
      options: question.options,
      required: question.required,
    }));

    res.json({ questions, total: questions.length });
  })
);

/* ------------------------------------------------------------------ */
/* Assessment lifecycle                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /api/clinical/assessments
 *
 * Each call is a new sitting, so history accumulates instead of being
 * overwritten. Any earlier in-progress sitting is marked abandoned so the UI
 * cannot be left pointing at two.
 */
clinicalRouter.post(
  "/assessments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const assessment = await transaction(async (tx) => {
      await tx.query(
        `UPDATE assessments
            SET status = 'abandoned', updated_at = now()
          WHERE user_id = $1 AND status = 'in_progress'`,
        [req.user.id]
      );

      const { rows } = await tx.query(
        `INSERT INTO assessments (user_id, status, type)
         VALUES ($1, 'in_progress', 'initial')
         RETURNING id, status, type, started_at`,
        [req.user.id]
      );
      return rows[0];
    });

    res.status(201).json({ assessment });
  })
);

/**
 * PUT /api/clinical/assessments/:id/answers
 *
 * Upserts rather than replaces, so Test 1's answers survive while the person is
 * answering Test 2. Deliberately separate from completion.
 */
clinicalRouter.put(
  "/assessments/:id/answers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const assessment = await ownedAssessment(req.params.id, req.user.id);
    if (assessment.status !== "in_progress") {
      throw conflict("This assessment is already finished", { assessmentId: assessment.id });
    }

    const { answers } = parse(assessmentAnswersSchema, req.body);

    // Only accept answers to questions that actually exist and are active,
    // otherwise the stored row could never be scored.
    const { rows: questions } = await query(
      `SELECT id FROM assessment_questions
        WHERE id = ANY($1::uuid[]) AND active = true`,
      [answers.map((a) => a.questionId)]
    );
    const known = new Set(questions.map((q) => q.id));
    const rejected = answers.filter((a) => !known.has(a.questionId));
    if (rejected.length > 0) {
      throw badRequest(`${rejected.length} answer(s) refer to unknown questions`);
    }

    await transaction(async (tx) => {
      for (const answer of answers) {
        await tx.query(
          `INSERT INTO assessment_answers (assessment_id, question_id, answer_value, answer_text)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (assessment_id, question_id) DO UPDATE
             SET answer_value = EXCLUDED.answer_value,
                 answer_text  = EXCLUDED.answer_text`,
          [assessment.id, answer.questionId, answer.value, answer.answerText ?? null]
        );
      }
    });

    res.json({ saved: answers.length, assessmentId: assessment.id });
  })
);

/**
 * POST /api/clinical/assessments/:id/complete
 *
 * Categorises the answers, writes an immutable result row, and mirrors the
 * outcome into user_current_concerns so the matching screen has something to
 * filter on immediately.
 */
clinicalRouter.post(
  "/assessments/:id/complete",
  requireAuth,
  asyncHandler(async (req, res) => {
    const assessment = await ownedAssessment(req.params.id, req.user.id);
    if (assessment.status === "completed") {
      throw conflict("This assessment is already finished", { assessmentId: assessment.id });
    }

    const { selectedConcerns, userDescription } = parse(completeAssessmentSchema, req.body);

    // Every concern named has to exist, so a typo cannot silently produce an
    // empty match list.
    for (const key of selectedConcerns) {
      if (!(await issueExists(key))) {
        throw badRequest(`"${key}" is not a recognised concern`);
      }
    }

    const [{ rows: questions }, { rows: answers }, issues] = await Promise.all([
      query(
        `SELECT id, test_number, category, prompt, question_type, options, scoring_config
           FROM assessment_questions
          WHERE active = true
          ORDER BY test_number, position`
      ),
      query(
        `SELECT question_id, answer_value, answer_text
           FROM assessment_answers
          WHERE assessment_id = $1`,
        [assessment.id]
      ),
      activeIssues(),
    ]);

    if (answers.length === 0) {
      throw badRequest("Answer at least one question before finishing");
    }

    const outcome = await analyse({
      questions: questions.map((question) => ({
        id: question.id,
        category: question.category,
        questionType: question.question_type,
        options: question.options,
        scoringConfig: question.scoring_config,
      })),
      answers: answers.map((a) => ({
        questionId: a.question_id,
        value: a.answer_value,
        answerText: a.answer_text,
      })),
      selectedMood: selectedConcerns[0] ?? null,
      selectedConcerns,
      userDescription: userDescription ?? "",
      issues,
    });

    await transaction(async (tx) => {
      // Per-question scores, so a later change to the weighting can be
      // recalculated without going back to the person. This stores the score
      // for the answer actually given, not the category average - an average
      // written onto each row would quietly overwrite the real signal and make
      // the data useless for reweighting.
      const questionById = new Map(
        questions.map((question) => [
          question.id,
          {
            questionType: question.question_type,
            options: question.options,
            scoringConfig: question.scoring_config,
          },
        ])
      );

      for (const answer of answers) {
        const question = questionById.get(answer.question_id);
        if (!question) continue;

        const score = concernScore(question, answer.answer_value);
        if (score === null) continue;

        await tx.query(
          `UPDATE assessment_answers
              SET score = $3
            WHERE assessment_id = $1 AND question_id = $2`,
          [assessment.id, answer.question_id, score]
        );
      }

      await tx.query(
        `UPDATE assessments
            SET status = 'completed', completed_at = now(), updated_at = now()
          WHERE id = $1`,
        [assessment.id]
      );

      await tx.query(
        `INSERT INTO assessment_results (
           assessment_id, user_id, primary_issue_key, secondary_issues, scores,
           selected_moods, user_description, summary, confidence, source,
           is_high_risk, safety_message
         ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9::jsonb, $10, $11, $12)`,
        [
          assessment.id,
          req.user.id,
          outcome.primaryIssue,
          JSON.stringify(outcome.secondaryIssues),
          JSON.stringify(outcome.scores),
          JSON.stringify(selectedConcerns),
          userDescription ?? null,
          outcome.summary,
          JSON.stringify(outcome.confidence),
          outcome.source,
          outcome.isHighRisk,
          outcome.safetyMessage,
        ]
      );

      // Mirror into the current concern so the matcher can read one place.
      // Only when we actually categorised something: a safety result has no
      // issue key, and inventing one would push a flagged person into a
      // therapist list.
      if (outcome.primaryIssue) {
        await tx.query(
          `INSERT INTO user_current_concerns (
             user_id, primary_issue_key, secondary_issues, user_description,
             summary, source, is_high_risk, safety_message
           ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)`,
          [
            req.user.id,
            outcome.primaryIssue,
            JSON.stringify(outcome.secondaryIssues),
            userDescription ?? null,
            outcome.summary,
            outcome.source,
            outcome.isHighRisk,
            outcome.safetyMessage,
          ]
        );
      }
    });

    // Every practitioner with a live relationship to this person hears about
    // the new result, so a completed assessment reaches the therapist who is
    // already working with them instead of waiting to be noticed.
    await notifyTherapistsOfClient(req.user.id, {
      type: "assessment_completed",
      title: "Assessment completed",
      body: `${req.user.fullName ?? "A client"} completed an assessment. It is ready to review.`,
      link: "/portal/therapist/assessments",
      data: { assessmentId: assessment.id },
      key: `assessment:${assessment.id}`,
    });

    res.json({
      assessmentId: assessment.id,
      primaryIssue: outcome.primaryIssue,
      secondaryIssues: outcome.secondaryIssues,
      summary: outcome.summary,
      source: outcome.source,
      isHighRisk: outcome.isHighRisk,
      safetyMessage: outcome.safetyMessage,
    });
  })
);

/** GET /api/clinical/assessments/:id - own assessment, with its answers. */
clinicalRouter.get(
  "/assessments/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const assessment = await ownedAssessment(req.params.id, req.user.id);

    const { rows: answers } = await query(
      `SELECT a.question_id, a.answer_value, a.answer_text, a.score,
              q.prompt, q.test_number, q.position
         FROM assessment_answers a
         JOIN assessment_questions q ON q.id = a.question_id
        WHERE a.assessment_id = $1
        ORDER BY q.test_number, q.position`,
      [assessment.id]
    );

    const { rows: results } = await query(
      `SELECT primary_issue_key, secondary_issues, scores, summary, source,
              is_high_risk, safety_message, created_at
         FROM assessment_results
        WHERE assessment_id = $1`,
      [assessment.id]
    );

    res.json({ assessment, answers, result: results[0] ?? null });
  })
);

/**
 * GET /api/clinical/history
 *
 * The person's own past sittings, newest first. Scoped by user_id in the WHERE
 * clause rather than filtered afterwards, so one person's history can never be
 * read by another.
 */
clinicalRouter.get(
  "/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT r.assessment_id, r.primary_issue_key, r.secondary_issues,
              r.summary, r.source, r.is_high_risk, r.created_at,
              a.type, a.completed_at
         FROM assessment_results r
         JOIN assessments a ON a.id = r.assessment_id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC
        LIMIT 50`,
      [req.user.id]
    );

    res.json({ history: rows, total: rows.length });
  })
);

/* ------------------------------------------------------------------ */
/* Current concern - the returning-user path                           */
/* ------------------------------------------------------------------ */

/**
 * POST /api/clinical/current-concern
 *
 * "What are you dealing with today?" This is a new row every time, so an old
 * assessment cannot silently override what somebody needs now.
 */
clinicalRouter.post(
  "/current-concern",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { primaryIssueKey, secondaryIssues, userDescription } = parse(
      currentConcernSchema,
      req.body
    );

    if (!(await issueExists(primaryIssueKey))) {
      throw badRequest(`"${primaryIssueKey}" is not a recognised concern`);
    }
    for (const key of secondaryIssues) {
      if (!(await issueExists(key))) {
        throw badRequest(`"${key}" is not a recognised concern`);
      }
    }

    const issues = await activeIssues();

    const outcome = await analyse({
      questions: [],
      answers: [],
      // The manual pick is the primary signal here; the description is only
      // there to be screened for safety and, if a provider is configured,
      // to refine the categorisation.
      selectedMood: primaryIssueKey,
      selectedConcerns: secondaryIssues,
      userDescription: userDescription ?? "",
      issues,
    });

    // A safety result never becomes the current concern: matching a flagged
    // person into a booking list is the wrong next step, whatever they picked.
    // Stored with a NULL primary key so the matcher cannot filter on it - the
    // database CHECK constraint enforces that a row is either a real concern or
    // a safety escalation.
    const { rows } = await query(
      `INSERT INTO user_current_concerns (
         user_id, primary_issue_key, secondary_issues, user_description,
         summary, source, is_high_risk, safety_message
       ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
       RETURNING id,
                 primary_issue_key                 AS "primaryIssueKey",
                 secondary_issues                 AS "secondaryIssues",
                 user_description                 AS "userDescription",
                 summary,
                 source,
                 is_high_risk                     AS "isHighRisk",
                 safety_message                   AS "safetyMessage",
                 created_at                       AS "createdAt"`,
      [
        req.user.id,
        outcome.isHighRisk ? null : primaryIssueKey,
        JSON.stringify(outcome.isHighRisk ? [] : secondaryIssues),
        userDescription ?? null,
        outcome.summary,
        outcome.isHighRisk ? "safety" : outcome.source,
        outcome.isHighRisk,
        outcome.safetyMessage,
      ]
    );

    const concern = rows[0];

    // Flags are also lifted to the top level: the client needs to branch on
    // safety before it decides whether to show a therapist list at all, and
    // making it reach into a nested object invites the wrong thing happening
    // quietly.
    res.json({
      concern,
      isHighRisk: concern.isHighRisk,
      safetyMessage: concern.safetyMessage,
    });
  })
);

/** GET /api/clinical/current-concern - the latest one, for resuming a search. */
clinicalRouter.get(
  "/current-concern",
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = await queryOne(
      `SELECT id,
              primary_issue_key  AS "primaryIssueKey",
              secondary_issues  AS "secondaryIssues",
              user_description  AS "userDescription",
              summary,
              source,
              is_high_risk      AS "isHighRisk",
              safety_message    AS "safetyMessage",
              created_at        AS "createdAt"
         FROM user_current_concerns
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [req.user.id]
    );

    if (!row) return res.json({ hasCurrentConcern: false, concern: null });
    res.json({ hasCurrentConcern: true, concern: row, isHighRisk: row.isHighRisk, safetyMessage: row.safetyMessage });
  })
);

/** GET /api/clinical/current-concern/history - past concerns, newest first. */
clinicalRouter.get(
  "/current-concern/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, primary_issue_key, secondary_issues, summary, created_at
         FROM user_current_concerns
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.user.id]
    );
    res.json({ history: rows, total: rows.length });
  })
);

export default clinicalRouter;