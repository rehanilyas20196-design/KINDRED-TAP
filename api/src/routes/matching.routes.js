/**
 * Therapist matching.
 *
 * The matching rule lives here, in SQL, and is deliberately boring:
 *
 *   1. A therapist must hold the primary concern in therapist_specialties.
 *      This is a hard filter. Secondary concerns only ever reorder what
 *      survives it.
 *   2. Secondary concerns add to a score; they never admit someone who lacks
 *      the primary.
 *   3. Availability is filtered on the existing profile fields rather than a
 *      new booking table, so this does not duplicate the profile.
 *
 * No model is consulted. The AI decides which concerns apply; this decides who
 * to show. Keeping those apart is what makes the result explainable - we can
 * always say "matched because they specialise in anger".
 *
 * `findMatches` is exported because the Clinical Advisor's matching review
 * reuses exactly this rule: one implementation, two callers, so a advisor's
 * "recommended matches" can never drift from what the client is shown.
 */

import { Router } from "express";
import { query, queryOne, transaction } from "../db/index.js";
import {
  asyncHandler,
  badRequest,
  forbidden,
  notFound,
  parse,
} from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { currentConcernSchema, therapistSpecialtiesSchema } from "../lib/schemas.js";
import { screenForSafety } from "../services/aiAnalysis.js";
import { generateAndStoreTherapistEmbedding, generatePatientEmbedding, cosineSimilarity, getAllTherapistEmbeddings } from "../services/geminiMatching.js";
import { env } from "../env.js";

export const matchingRouter = Router();

/**
 * The therapist columns a search may return.
 *
 * Same privacy rule as the directory in support.routes.js: nothing here is a
 * contact detail, date of birth or registration number. Whatever is added to
 * this list becomes visible to any signed-in person who searches.
 */
const MATCH_COLUMNS = `
  u.id,
  u.full_name                           AS "fullName",
  p.discipline,
  p.bio,
  p.modalities,
  p.languages,
  p.session_modes                       AS "sessionModes",
  p.session_fee::float8                 AS "sessionFee",
  p.currency,
  p.years_experience                    AS "yearsExperience",
  p.accepting_new_cases                 AS "acceptingNewCases",
  p.registration_verified               AS "registrationVerified",
  p.registration_body                   AS "registrationBody",
  p.availability_hours_per_week         AS "availabilityHoursPerWeek"
`;

/**
 * Runs the search with semantic matching.
 *
 * @param primaryKey  issues.key of the primary concern
 * @param secondaryKeys issues.keys that would improve the ranking
 * @param userId      patient user ID (for generating patient embedding)
 * @returns therapists ordered best-first, each carrying `matchedSpecialties`
 */
export async function findMatches(primaryKey, secondaryKeys = [], userId = null) {
  const issue = await queryOne(
    `SELECT id, key, label, description
       FROM issues
      WHERE key = $1 AND active = true`,
    [primaryKey]
  );
  if (!issue) return { issue: null, therapists: [] };

  // Secondary keys are validated as a set, so a bogus value simply drops out
  // instead of poisoning the ranking.
  const cleanedSecondary = secondaryKeys.filter((key) => key !== primaryKey);

  const { rows: secondaryIssues } = cleanedSecondary.length
    ? await query(`SELECT id, key FROM issues WHERE key = ANY($1::text[]) AND active = true`, [
        cleanedSecondary,
      ])
    : { rows: [] };

  // Ordered by how many of the secondary concerns this therapist also holds.
  // A therapist with none still appears - they just rank lower.
  const secondaryOverlapExpr = secondaryIssues.length
    ? `(
         SELECT count(*)
           FROM therapist_specialties ts2
          WHERE ts2.therapist_id = u.id
            AND ts2.issue_id = ANY($2::uuid[])
       )`
    : "0";

  const orderByClause = secondaryIssues.length
    ? `${secondaryOverlapExpr} DESC,`
    : "";

  // Hard filter: verified, active, accepting patients, holds primary specialty
  const { rows } = await query(
    `SELECT ${MATCH_COLUMNS},
            ${secondaryOverlapExpr} AS "secondaryOverlap",
            COALESCE(
              (SELECT array_agg(i.label ORDER BY i.position)
                 FROM therapist_specialties ts3
                 JOIN issues i ON i.id = ts3.issue_id
                WHERE ts3.therapist_id = u.id),
              ARRAY[]::text[]
            ) AS "specialties"
       FROM users u
       JOIN therapist_profiles p ON p.user_id = u.id
       JOIN therapist_specialties ts
         ON ts.therapist_id = u.id AND ts.issue_id = $1
      WHERE u.status = 'active'
        AND p.accepting_new_cases = true
        AND COALESCE(p.availability_hours_per_week, 0) > 0
      ORDER BY ${orderByClause}
               p.registration_verified DESC,
               p.years_experience DESC NULLS LAST,
               u.full_name NULLS LAST
      LIMIT 50`,
    secondaryIssues.length ? [issue.id, secondaryIssues.map((i) => i.id)] : [issue.id]
  );

  // If Gemini is configured and we have a user, add semantic ranking
  let therapists = rows.map((therapist) => ({
    ...therapist,
    matchedSpecialties: therapist.specialties ?? [],
    matchedOn: issue.label,
  }));

  if (env.geminiApiKey && userId) {
    try {
      const patientResult = await generatePatientEmbedding(userId);
      if (patientResult.success && patientResult.embedding) {
        const therapistEmbeddings = await getAllTherapistEmbeddings();
        const embeddingMap = new Map(
          therapistEmbeddings.map((e) => [e.therapist_id, e.embedding])
        );

        therapists = therapists.map((t) => {
          const docEmbedding = embeddingMap.get(t.id);
          const semanticScore = docEmbedding ? cosineSimilarity(patientResult.embedding, docEmbedding) : 0;
          return { ...t, semanticScore: Number(semanticScore.toFixed(4)) };
        });

        // Re-rank: primary filter (specialty match) first, then semantic similarity
        therapists.sort((a, b) => {
          // Keep therapists with primary specialty match at top
          const aHasPrimary = a.matchedSpecialties?.includes(issue.label);
          const bHasPrimary = b.matchedSpecialties?.includes(issue.label);
          if (aHasPrimary && !bHasPrimary) return -1;
          if (!aHasPrimary && bHasPrimary) return 1;

          // Then by secondary overlap
          if (b.secondaryOverlap !== a.secondaryOverlap) {
            return b.secondaryOverlap - a.secondaryOverlap;
          }

          // Then by semantic similarity
          if (b.semanticScore !== a.semanticScore) {
            return b.semanticScore - a.semanticScore;
          }

          // Then by verification and experience
          if (b.registrationVerified !== a.registrationVerified) {
            return b.registrationVerified ? 1 : -1;
          }
          return (b.yearsExperience ?? 0) - (a.yearsExperience ?? 0);
        });
      }
    } catch (error) {
      console.error("[matching] Semantic ranking failed, falling back to keyword-only:", error.message);
    }
  }

  return { issue, therapists };
}

/** Records a search so dashboards can show what was offered, and why. */
async function recordSearch(userId, { concernId, assessmentId, primaryKey, secondaryKeys, count }) {
  await query(
    `INSERT INTO therapist_searches
       (user_id, concern_id, assessment_id, primary_issue_key, secondary_issues, result_count)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [userId, concernId ?? null, assessmentId ?? null, primaryKey, JSON.stringify(secondaryKeys), count]
  );
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

/**
 * POST /api/matching/therapists
 *
 * Explicit search: the person sends the concern they want looked into.
 */
matchingRouter.post(
  "/therapists",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { primaryIssueKey, secondaryIssues, userDescription } = parse(
      currentConcernSchema,
      req.body
    );

    // Checked before anything else. If the description raises a safety
    // concern, the answer is the escalation message, not a shortlist.
    const safety = screenForSafety(userDescription ?? "");
    if (safety.isHighRisk) {
      return res.json({
        isHighRisk: true,
        safetyMessage: safety.safetyMessage,
        primaryIssue: null,
        therapists: [],
        total: 0,
      });
    }

    const { issue, therapists } = await findMatches(primaryIssueKey, secondaryIssues, req.user.id);

    if (!issue) {
      throw badRequest(`"${primaryIssueKey}" is not a recognised concern`);
    }

    await recordSearch(req.user.id, {
      primaryKey: primaryIssueKey,
      secondaryKeys: secondaryIssues,
      count: therapists.length,
    });

    res.json({
      primaryIssue: issue,
      secondaryIssues,
      therapists,
      total: therapists.length,
      // Deliberately factual: these were matched on specialism and
      // availability, not chosen for the person by a model.
      matchedBecause: `Therapists who specialise in ${issue.label.toLowerCase()} and are available now.`,
    });
  })
);

/**
 * GET /api/matching/therapists/current
 *
 * Re-runs the search against the stored current concern, so a returning user
 * can go straight back to their results.
 */
matchingRouter.get(
  "/therapists/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    const concern = await queryOne(
      `SELECT id, primary_issue_key, secondary_issues, summary, created_at
         FROM user_current_concerns
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [req.user.id]
    );

    if (!concern) {
      return res.json({
        hasCurrentConcern: false,
        therapists: [],
        total: 0,
      });
    }

    // A safety result is stored with no usable issue key, so there is nothing
    // to match on and the client shows the escalation message instead.
    if (!concern.primary_issue_key) {
      const flagged = await queryOne(
        `SELECT safety_message FROM user_current_concerns WHERE id = $1`,
        [concern.id]
      );
      return res.json({
        hasCurrentConcern: true,
        isHighRisk: true,
        safetyMessage: flagged?.safety_message ?? null,
        therapists: [],
        total: 0,
      });
    }

    const { issue, therapists } = await findMatches(
      concern.primary_issue_key,
      concern.secondary_issues ?? [],
      req.user.id
    );

    res.json({
      hasCurrentConcern: true,
      concern: {
        id: concern.id,
        primaryIssueKey: concern.primary_issue_key,
        secondaryIssues: concern.secondary_issues,
        summary: concern.summary,
        createdAt: concern.created_at,
      },
      primaryIssue: issue,
      therapists,
      total: therapists.length,
    });
  })
);

/**
 * GET /api/matching/therapists/:id
 *
 * A single matched therapist, with the specialisms behind the match. Scoped so
 * a therapist id from the URL cannot be used to read someone's assessment.
 */
matchingRouter.get(
  "/therapists/:therapistId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { therapistId } = req.params;

    const therapist = await queryOne(
      `SELECT ${MATCH_COLUMNS},
              COALESCE(
                (SELECT array_agg(i.label ORDER BY i.position)
                   FROM therapist_specialties ts
                   JOIN issues i ON i.id = ts.issue_id
                  WHERE ts.therapist_id = u.id),
                ARRAY[]::text[]
              ) AS "specialties"
         FROM users u
         JOIN therapist_profiles p ON p.user_id = u.id
        WHERE u.id = $1
          AND u.status = 'active'
          AND u.role = 'therapist'`,
      [therapistId]
    );

    if (!therapist) throw notFound("Therapist not found");

    // Which of the caller's current concerns this person covers. Lets the page
    // say "matches your concern about anger" without the client guessing.
    const concern = await queryOne(
      `SELECT primary_issue_key, secondary_issues
         FROM user_current_concerns
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [req.user.id]
    );

    let covers = [];
    if (concern) {
      const keys = [concern.primary_issue_key, ...(concern.secondary_issues ?? [])].filter(Boolean);
      const { rows } = await query(
        `SELECT i.key, i.label
           FROM therapist_specialties ts
           JOIN issues i ON i.id = ts.issue_id
          WHERE ts.therapist_id = $1
            AND i.key = ANY($2::text[])`,
        [therapistId, keys]
      );
      covers = rows;
    }

    res.json({
      therapist: { ...therapist, specialties: therapist.specialties ?? [] },
      coversYourConcern: covers,
      available: therapist.acceptingNewCases === true,
    });
  })
);

/* ------------------------------------------------------------------ */
/* Therapist-side management                                           */
/* ------------------------------------------------------------------ */

/**
 * GET /api/matching/specialties
 *
 * The full configurable vocabulary with the caller's current selections marked,
 * which is exactly what a multi-select needs to render.
 */
matchingRouter.get(
  "/specialties",
  requireAuth,
  asyncHandler(async (req, res, next) => {
    if (req.user.role !== "therapist") {
      return next(forbidden("Only therapists have specialties"));
    }

    const { rows } = await query(
      `SELECT i.key, i.label, i.description,
              (ts.id IS NOT NULL) AS selected
         FROM issues i
         LEFT JOIN therapist_specialties ts
                ON ts.issue_id = i.id AND ts.therapist_id = $1
        WHERE i.active = true
        ORDER BY i.position, i.label`,
      [req.user.id]
    );

    res.json({ specialties: rows, total: rows.length });
  })
);

/**
 * PUT /api/matching/specialties
 *
 * Replaces the whole set. Keys rather than ids so the payload stays readable
 * and matches the vocabulary the rest of the API uses.
 */
matchingRouter.put(
  "/specialties",
  requireAuth,
  asyncHandler(async (req, res, next) => {
    if (req.user.role !== "therapist") {
      return next(forbidden("Only therapists have specialties"));
    }

    const { issueKeys } = parse(therapistSpecialtiesSchema, req.body);

    const { rows: issues } = await query(
      `SELECT id, key FROM issues WHERE key = ANY($1::text[]) AND active = true`,
      [issueKeys]
    );

    const unknown = issueKeys.filter((key) => !issues.some((i) => i.key === key));
    if (unknown.length > 0) {
      throw badRequest(`Not a recognised specialty: ${unknown.join(", ")}`);
    }

    // Delete-then-insert inside one transaction: a partial failure must not
    // leave a therapist with no specialties at all.
    await transaction(async (tx) => {
      await tx.query("DELETE FROM therapist_specialties WHERE therapist_id = $1", [req.user.id]);
      for (const issue of issues) {
        await tx.query(
          `INSERT INTO therapist_specialties (therapist_id, issue_id) VALUES ($1, $2)`,
          [req.user.id, issue.id]
        );
      }
    });

    // Generate/update embedding after specialties change (async, non-blocking)
    generateAndStoreTherapistEmbedding(req.user.id).catch((err) => {
      console.error("[matching] Embedding generation failed:", err.message);
    });

    res.json({ saved: issues.length, specialties: issues });
  })
);

export default matchingRouter;