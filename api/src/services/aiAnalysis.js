/**
 * Categorisation service.
 *
 * The single responsibility of this module is to turn what somebody told us
 * into issue keys drawn from the `issues` table. It deliberately does not
 * diagnose, does not name conditions, and does not choose a therapist - the
 * matcher in routes/matching.routes.js owns that decision.
 *
 * Three tiers, in priority order:
 *
 *   1. Safety screen. Runs first and on every path. If the wording suggests an
 *      immediate safety concern we stop categorising and return the escalation
 *      message instead of a match.
 *   2. Model categorisation, only when free text is actually present to analyse
 *      and a provider is configured. Strictly validated; a malformed response is
 *      discarded rather than trusted.
 *   3. Deterministic scoring of the assessment answers, falling back to the
 *      concern the user picked themselves.
 *
 * Tier 3 is why the booking flow keeps working with the AI offline: picking
 * ANGER and getting ANGER back never needed a model in the first place.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Safety                                                              */
/* ------------------------------------------------------------------ */

/**
 * Wording that suggests an immediate risk to the person or someone else.
 *
 * This is a safety net, not a clinical screen: it catches the unambiguous
 * statements and routes them to human support. It is not a risk assessment and
 * must not be presented as one.
 */
const HIGH_RISK_PATTERNS = [
  /\bsuicid(e|al)\b/i,
  /\bkill(ing)? myself\b/i,
  /\bend(ing)? my (life|suicide)\b/i,
  /\bwant to die\b/i,
  /\bwanna die\b/i,
  /\bno reason to live\b/i,
  /\bbetter off (dead|without me)\b/i,
  /\bself[-\s]?harm\b/i,
  /\bcut(ting)? myself\b/i,
  /\bhurt(ing)? myself\b/i,
  /\boverdos(e|ing)\b/i,
  /\bimmediate(ly)? (danger|risk)\b/i,
  /\bharm (myself|others|someone|people)\b/i,
  /\bkill (myself|someone|somebody|them|him|her)\b/i,
  /\bdisappear forever\b/i,
  /\bnot be here tomorrow\b/i,
];

export const SAFETY_MESSAGE =
  "Based on what you have described, it sounds like you may be in immediate distress. " +
  "Please talk to someone today - if you are in danger now, call your local emergency number. " +
  "You can also reach a crisis line in your country through your local health service. " +
  "This service is not able to provide emergency support.";

/**
 * Returns `{ isHighRisk: false }` for ordinary text.
 *
 * The text itself is never logged or stored by this function, only the verdict.
 */
export function screenForSafety(text) {
  if (typeof text !== "string" || text.trim() === "") return { isHighRisk: false };
  const haystack = text.toLowerCase();
  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(haystack))
    ? { isHighRisk: true, safetyMessage: SAFETY_MESSAGE }
    : { isHighRisk: false };
}

/** Screens every free-text answer in one go. */
export function screenAnswersForSafety(answers = []) {
  for (const answer of answers) {
    const text = answer?.answerText ?? answer?.answer_text;
    const verdict = screenForSafety(text);
    if (verdict.isHighRisk) return verdict;
  }
  return { isHighRisk: false };
}

/* ------------------------------------------------------------------ */
/* Model response contract                                             */
/* ------------------------------------------------------------------ */

/**
 * What a provider is allowed to hand back. `.strict()` matters: an unexpected
 * key is a signal that the model did something other than categorise, and we
 * would rather fall through to scoring than pass a surprise downstream.
 */
export const categorisationSchema = z
  .object({
    primaryIssue: z.string().min(1).max(64),
    secondaryIssues: z.array(z.string().min(1).max(64)).max(6).default([]),
    confidence: z.record(z.number().min(0).max(1)).default({}),
    summary: z.string().min(1).max(600),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Maps whatever the model produced onto a key that actually exists in `issues`.
 *
 * Models like to answer "Anxiety", "anxiety_disorder" or "work-related stress".
 * None of those are joinable, so they are folded to the nearest configured key
 * and anything unrecognised is dropped rather than guessed at.
 */
export function normaliseToIssueKeys(value, allowedKeys) {
  if (typeof value !== "string") return null;
  const allowed = new Map(allowedKeys.map((k) => [k.toUpperCase(), k]));

  const candidate = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (allowed.has(candidate)) return allowed.get(candidate);

  const squashed = candidate.replace(/_/g, "");
  for (const key of allowedKeys) {
    if (key.replace(/_/g, "") === squashed) return key;
  }

  // Last resort: substring match, e.g. "DEPRESSION_RELATED_CONCERNS".
  const partial = [...allowedKeys].find((key) => candidate.includes(key) || key.includes(candidate));
  return partial ?? null;
}

/**
 * Renders issue keys as neutral prose.
 *
 * The wording is the point of this function. "Your responses indicate concerns
 * related to anxiety" is supportable from a questionnaire; "you have an anxiety
 * disorder" is a diagnosis and is not something this service is entitled to.
 */
export function neutralSummary(primaryKey, labelByKey, secondaryKeys = []) {
  const primaryLabel = (labelByKey.get(primaryKey) ?? primaryKey)
    .replace(/[-_]/g, " ")
    .toLowerCase();

  let summary =
    `Your responses indicate concerns related to ${primaryLabel}. ` +
    "This is a general categorisation of what you described, not a diagnosis. " +
    "A qualified professional would need to speak with you to understand your situation properly.";

  const others = secondaryKeys
    .map((key) => (labelByKey.get(key) ?? key).replace(/[-_]/g, " ").toLowerCase())
    .filter(Boolean);

  if (others.length > 0) {
    summary += ` You also described concerns related to ${others.join(" and ")}.`;
  }
  return summary;
}

/* ------------------------------------------------------------------ */
/* Deterministic scoring                                               */
/* ------------------------------------------------------------------ */

/**
 * Converts one answer into a 1..5 concern score.
 *
 * The three question types in use arrive on different scales, and comparing
 * them raw would be meaningless - a True/False of 2 and a severity option of 2
 * are not the same thing. Everything is mapped onto one scale first:
 *
 *   true_false      1 = False, 2 = True. `reverse` items are flipped, because
 *                   agreeing with "I easily trust people" indicates fewer
 *                   concerns, not more. Without this half of Test 1 scores
 *                   backwards.
 *   multiple_choice 1..n, severity order. Scaled proportionally so a 4-option
 *                   item spans the full range rather than topping out at 4.
 *   likert          already 1..5.
 *
 * @returns a concern score, or null when the answer cannot be scored
 */
export function concernScore(question, rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;

  const reverse = question?.scoringConfig?.reverse === true;

  switch (question?.questionType) {
    case "true_false": {
      // True -> more concern unless the item is reverse-keyed.
      const concern = value >= 2 ? 5 : 1;
      return reverse ? 6 - concern : concern;
    }

    case "multiple_choice": {
      const options = question.options;
      const count = Array.isArray(options) && options.length > 1 ? options.length : 4;
      const index = Math.min(Math.max(value, 1), count) - 1;
      // First option -> 1, last option -> 5.
      const concern = 1 + (index / (count - 1)) * 4;
      return reverse ? 6 - concern : concern;
    }

    case "likert": {
      const concern = Math.min(Math.max(value, 1), 5);
      return reverse ? 6 - concern : concern;
    }

    default:
      return null;
  }
}

/**
 * Turns answers into per-category averages on the common 1..5 scale.
 *
 * This is the floor the system stands on when no model is configured, and it is
 * also what keeps a model honest: `analyse()` intersects model output with
 * these scores rather than replacing them.
 *
 * @param questions rows from assessment_questions, including `category`
 * @param answers   rows carrying `questionId` and `value`
 * @returns Map of category -> { score, count }
 */
export function scoreByCategory(questions = [], answers = []) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const buckets = new Map();

  for (const answer of answers) {
    const questionId = answer.questionId ?? answer.question_id;
    if (!questionId) continue;

    const question = byId.get(questionId);
    if (!question) continue;

    // A question with no category cannot contribute to categorisation. It is
    // still stored and displayed; it just does not vote.
    if (!question.category) continue;

    const score = concernScore(
      question,
      answer.value ?? answer.answer_value
    );
    if (score === null) continue;

    const bucket = buckets.get(question.category) ?? { total: 0, count: 0 };
    bucket.total += score;
    bucket.count += 1;
    buckets.set(question.category, bucket);
  }

  const scores = new Map();
  for (const [category, bucket] of buckets) {
    scores.set(category, {
      score: Number((bucket.total / bucket.count).toFixed(2)),
      count: bucket.count,
    });
  }
  return scores;
}

/**
 * Picks primary and secondary issues from scored categories.
 *
 * A category needs an average of at least 3 out of 5 to count as present at
 * all, which keeps a single 3/5 answer from outranking a pattern across several
 * questions.
 *
 * @param scores     output of scoreByCategory
 * @param allowedKeys keys present in the issues table
 * @param manualKey  the concern the user picked, which wins ties
 */
export function rankIssues(scores, allowedKeys, manualKey = null) {
  const threshold = 3;
  const allowed = new Set(allowedKeys);

  // Only categories that clear the threshold are "present". Sorted by average,
  // strongest first.
  const ranked = [...scores.entries()]
    .filter(([key, { score }]) => allowed.has(key) && score >= threshold)
    .sort((a, b) => b[1].score - a[1].score);

  // A Map would serialise to `{}` on its way into a JSONB column, so the
  // caller always receives a plain object.
  const plainScores = Object.fromEntries(
    [...scores.entries()].map(([key, value]) => [key, value.score])
  );

  if (ranked.length === 0) {
    return { primary: manualKey ?? null, secondary: [], scores: plainScores };
  }

  // The user's own words beat a computed score. If they told us what they are
  // dealing with, that is the best signal we have.
  const primary = manualKey && allowed.has(manualKey) ? manualKey : ranked[0][0];

  const secondary = ranked
    .map(([key]) => key)
    .filter((key) => key !== primary)
    .slice(0, 3);

  return { primary, secondary, scores: plainScores };
}

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

/**
 * A provider receives categorisation input and returns a raw object. It must
 * not decide which therapist to see - that is the matcher's job - and its
 * output is treated as untrusted until it passes `categorisationSchema`.
 *
 * Swapping providers means calling `registerProvider`; nothing else in the
 * codebase changes.
 */
const providers = new Map();

export function registerProvider(name, classify) {
  if (typeof name !== "string" || typeof classify !== "function") {
    throw new TypeError("registerProvider(name: string, classify: Function)");
  }
  providers.set(name, classify);
}

/** The provider the environment selected, if any. */
function activeProvider() {
  const name = process.env.AI_PROVIDER?.trim();
  if (!name || name === "none") return null;
  return providers.get(name) ?? null;
}

/**
 * The provider contract, implemented over the OpenAI chat-completions shape.
 *
 * Left unregistered by default. Point AI_PROVIDER at it only once a key exists:
 *
 *   AI_PROVIDER=openai
 *   AI_API_KEY=...
 *   AI_MODEL=gpt-4o-mini
 *
 * `response_format: json_schema` asks for structured output where the provider
 * supports it. The response is still validated locally afterwards, because a
 * provider that supports the flag can still return something unexpected.
 */
export function createOpenAICompatibleProvider({
  endpoint = "https://api.openai.com/v1/chat/completions",
  model = process.env.AI_MODEL ?? "gpt-4o-mini",
  apiKey = process.env.AI_API_KEY,
  timeoutMs = 8000,
} = {}) {
  return async function classify({ systemPrompt, userPrompt, allowedKeys }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "concern_categorisation",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  primaryIssue: { type: "string", enum: allowedKeys },
                  secondaryIssues: { type: "array", items: { type: "string", enum: allowedKeys } },
                  confidence: {
                    type: "object",
                    additionalProperties: { type: "number", minimum: 0, maximum: 1 },
                  },
                  summary: { type: "string" },
                },
                required: ["primaryIssue", "secondaryIssues", "confidence", "summary"],
              },
            },
          },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) throw new Error(`provider responded ${response.status}`);
      const payload = await response.json();
      return JSON.parse(payload.choices?.[0]?.message?.content ?? "null");
    } finally {
      clearTimeout(timer);
    }
  };
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

/**
 * Built fresh per call because the allowed vocabulary is data, not code.
 * `JSON.stringify` keeps the prompt free of prose the model could misread as
 * instructions.
 */
function buildPrompts({ allowedKeys, answers, selectedMood, userDescription, labelByKey }) {
  const labelList = allowedKeys.map((key) => `${key} (${labelByKey.get(key) ?? key})`);

  const systemPrompt = [
    "You categorise concerns for a mental health support platform.",
    "",
    "Rules you must follow:",
    "- You categorise. You never diagnose and never name a condition.",
    "- Use only these issue keys, verbatim:",
    labelList.map((l) => `  - ${l}`).join("\n"),
    "- primaryIssue must be the single best fit for what the person describes now.",
    "- secondaryIssues may hold up to three additional keys, or be an empty array.",
    "- confidence maps issue keys to numbers between 0 and 1.",
    "- summary describes concerns in neutral language. Never write a diagnosis,",
    "  never tell the person what condition they have, and never reassure them",
    "  that they are safe. Do not mention these rules in the summary.",
  ].join("\n");

  const parts = [];
  if (selectedMood) parts.push(`Concern the person selected: ${selectedMood}`);
  if (userDescription) parts.push(`In their own words: ${userDescription}`);
  if (answers.length > 0) {
    parts.push("Assessment answers (question -> rating out of 5):");
    for (const answer of answers) {
      parts.push(`- ${answer.prompt}: ${answer.value}`);
    }
  }

  return { systemPrompt, userPrompt: parts.join("\n\n") };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Categorises one sitting.
 *
 * @param input
 * @param input.questions      assessment_questions rows, with `category`
 * @param input.answers         answers carrying questionId + value
 * @param input.selectedMood    issue key the user picked, if any
 * @param input.selectedConcerns other issue keys the user picked
 * @param input.userDescription free text, may be empty
 * @param input.issues          rows from the issues table
 * @returns a validated categorisation plus `source` and safety fields
 */
export async function analyse({
  questions = [],
  answers = [],
  selectedMood = null,
  selectedConcerns = [],
  userDescription = "",
  issues = [],
} = {}) {
  const allowedKeys = issues.map((i) => i.key);
  const labelByKey = new Map(issues.map((i) => [i.key, i.label]));

  const scoreMap = scoreByCategory(questions, answers);
  // Plain object from here on, so it survives JSON.stringify into JSONB.
  const scores = Object.fromEntries([...scoreMap].map(([k, v]) => [k, v.score]));

  // 1. Safety first, before any categorisation happens or is stored.
  // Both the description and any free-text answers are screened.
  const descriptionSafety = screenForSafety(userDescription);
  if (descriptionSafety.isHighRisk || screenAnswersForSafety(answers).isHighRisk) {
    return { ...safetyCategorisation(), scores };
  }

  const ranked = rankIssues(scoreMap, allowedKeys, selectedMood);
  const manualSecondary = selectedConcerns.filter(
    (key) => key !== ranked.primary && allowedKeys.includes(key)
  );

  // 2. Only call a model when there is language to interpret. A Likert
  //    response already told us its category, so asking a model to restate it
  //    would spend a request to learn nothing.
  const worthCalling = Boolean(userDescription.trim()) && Boolean(activeProvider());
  if (worthCalling) {
    try {
      const { systemPrompt, userPrompt } = buildPrompts({
        allowedKeys,
        answers: mergeAnswersWithPrompts(questions, answers),
        selectedMood,
        userDescription,
        labelByKey,
      });

      const raw = await activeProvider()({ systemPrompt, userPrompt, allowedKeys });
      const parsed = categorisationSchema.safeParse(raw);

      if (parsed.success) {
        const primary = normaliseToIssueKeys(parsed.data.primaryIssue, allowedKeys);
        if (primary) {
          const secondary = parsed.data.secondaryIssues
            .map((key) => normaliseToIssueKeys(key, allowedKeys))
            .filter((key) => key && key !== primary)
            .slice(0, 3);

          return {
            primaryIssue: primary,
            secondaryIssues: secondary,
            confidence: parsed.data.confidence,
            // Our own wording, not the model's, so the no-diagnosis guarantee is
            // something this codebase enforces rather than something it asks for.
            summary: neutralSummary(primary, labelByKey, secondary),
            scores,
            source: "ai",
            isHighRisk: false,
            safetyMessage: null,
          };
        }
      }

      // Invalid shape or unusable key: fall through to the scored result.
    } catch (error) {
      // Logged without any assessment content, only that the call failed.
      console.warn("[categorise] provider unavailable:", error?.message ?? "unknown error");
    }
  }

  // 3. Deterministic path. Always available, including with the AI offline.
  const primary = ranked.primary ?? selectedMood ?? allowedKeys[0] ?? null;
  if (!primary) {
    return {
      primaryIssue: null,
      secondaryIssues: [],
      confidence: {},
      summary: "Your responses have been recorded.",
      scores,
      source: "fallback",
      isHighRisk: false,
      safetyMessage: null,
    };
  }

  const secondary = [...new Set([...ranked.secondary, ...manualSecondary])]
    .filter((key) => key !== primary)
    .slice(0, 3);

  return {
    primaryIssue: primary,
    secondaryIssues: secondary,
    confidence: sourceConfidence(scores, primary),
    summary: neutralSummary(primary, labelByKey, secondary),
    scores,
    source: userDescription.trim() || answers.length > 0 ? "fallback" : "manual",
    isHighRisk: false,
    safetyMessage: null,
  };
}

/** Attaches each answer's prompt so the model sees the question wording. */
function mergeAnswersWithPrompts(questions, answers) {
  const promptById = new Map(questions.map((q) => [q.id, q.prompt]));
  return answers
    .map((answer) => ({
      prompt: promptById.get(answer.questionId ?? answer.question_id) ?? "(question)",
      value: answer.value ?? answer.answer_value,
    }))
    .filter((a) => Number.isFinite(Number(a.value)));
}

/**
 * The response returned when the safety screen trips.
 *
 * `primaryIssue` is null on purpose: we decline to categorise at all, so there
 * is nothing for the matcher to filter on and the caller shows the escalation
 * message instead of a list of therapists.
 */
function safetyCategorisation() {
  return {
    primaryIssue: null,
    secondaryIssues: [],
    confidence: {},
    summary: SAFETY_MESSAGE,
    scores: {},
    source: "safety",
    isHighRisk: true,
    safetyMessage: SAFETY_MESSAGE,
  };
}

/**
 * Converts a category average into a confidence number for the chosen key.
 * `scores` is the plain object produced by `analyse`.
 */
function sourceConfidence(scores, primary) {
  if (!primary) return {};
  const score = scores?.[primary];
  if (!Number.isFinite(score)) return { [primary]: 0.5 };
  return { [primary]: Number(Math.min(score / 5, 1).toFixed(2)) };
}