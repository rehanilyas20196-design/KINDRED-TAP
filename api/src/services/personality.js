import { PERSONALITY_QUESTIONS, TRAITS } from "../data/personalityQuestions.js";

/**
 * Archetypes are matched by weighting the five trait scores. Weights are
 * relative, so only the pattern matters, not the scale.
 */
const ARCHETYPES = [
  {
    key: "steady_anchor",
    label: "The Steady Anchor",
    tagline: "Reliable, calm, the person others lean on.",
    description:
      "You follow through and you hold things together. In a group you are the one who makes things feel manageable, and under pressure you bounce back rather than break.",
    strengths: ["Reliability", "Emotional steadiness", "Practical judgement"],
    growth: ["Allowing yourself to rest", "Delegating earlier"],
    weights: { conscientiousness: 1, resilience: 0.85, agreeableness: 0.55, extraversion: 0.2, openness: 0.35 },
  },
  {
    key: "warm_connector",
    label: "The Warm Connector",
    tagline: "Empathetic, sociable, skilled at making people feel seen.",
    description:
      "You read rooms well and people trust you quickly. Empathy and conversation are your superpowers, and you are usually the bridge between people who are not speaking.",
    strengths: ["Empathy", "Communication", "Conflict de-escalation"],
    growth: ["Boundaries", "Saying no without guilt"],
    weights: { agreeableness: 1, extraversion: 0.8, resilience: 0.4, conscientiousness: 0.35, openness: 0.3 },
  },
  {
    key: "curious_explorer",
    label: "The Curious Explorer",
    tagline: "Imaginative, inventive, always asking why.",
    description:
      "You see possibilities others miss. You are comfortable with uncertainty, enjoy unfamiliar ground, and often invent a better way of doing something simply because the old way bored you.",
    strengths: ["Imagination", "Flexibility", "New perspectives"],
    growth: ["Finishing before starting again", "Routine as a support"],
    weights: { openness: 1, conscientiousness: 0.3, extraversion: 0.35, agreeableness: 0.35, resilience: 0.35 },
  },
  {
    key: "grounded_warrior",
    label: "The Grounded Warrior",
    tagline: "Resilient, decisive, unshaken by hard days.",
    description:
      "You recover fast and you keep perspective. Setbacks do not define you, which makes you a steady guide for people going through something difficult themselves.",
    strengths: ["Resilience", "Decisiveness", "Perspective"],
    growth: ["Pausing before acting", "Asking for support sooner"],
    weights: { resilience: 1, conscientiousness: 0.6, extraversion: 0.45, openness: 0.3, agreeableness: 0.25 },
  },
  {
    key: "thoughtful_architect",
    label: "The Thoughtful Architect",
    tagline: "Structured, reflective, good at turning ideas into plans.",
    description:
      "You think before you act and you build things that last. Reflection plus discipline is a rare combination that makes you an excellent planner, therapist or reviewer.",
    strengths: ["Planning", "Reflection", "Consistency"],
    growth: ["Trusting your own judgement", "Acting before you are certain"],
    weights: { conscientiousness: 0.9, openness: 0.75, agreeableness: 0.45, resilience: 0.4, extraversion: 0.25 },
  },
  {
    key: "quiet_guardian",
    label: "The Quiet Guardian",
    tagline: "Reflective, private, deeply loyal to a few people.",
    description:
      "You do your best work in small, trusted settings rather than on a stage. Quiet does not mean withdrawn: your attention to the people you care about is unusually steady.",
    strengths: ["Depth of focus", "Loyalty", "Self-awareness"],
    growth: ["Speaking up sooner", "Widening your circle"],
    weights: { openness: 0.7, conscientiousness: 0.7, agreeableness: 0.6, resilience: 0.6, extraversion: 0.05 },
  },
  {
    key: "motivating_mentor",
    label: "The Motivating Mentor",
    tagline: "Outgoing, purposeful, great at helping people commit.",
    description:
      "You bring energy and direction to a group. People leave conversations with you more confident and more willing to act, which makes you a natural mentor, advisor or group leader.",
    strengths: ["Motivation", "Leadership", "Optimism"],
    growth: ["Listening longer", "Choosing pace over volume"],
    weights: { extraversion: 1, conscientiousness: 0.65, resilience: 0.55, agreeableness: 0.5, openness: 0.45 },
  },
];

/** Which traits tend to suit each portal. */
const ROLE_FIT = {
  user: { openness: 0.8, resilience: 0.7, agreeableness: 0.5, extraversion: 0.4, conscientiousness: 0.3 },
  supporter: { agreeableness: 1, extraversion: 0.8, resilience: 0.6, conscientiousness: 0.35, openness: 0.3 },
  therapist: { resilience: 0.9, openness: 0.8, agreeableness: 0.8, conscientiousness: 0.75, extraversion: 0.3 },
  clinical_advisor: { conscientiousness: 0.9, openness: 0.8, resilience: 0.7, agreeableness: 0.6, extraversion: 0.3 },
  clinical_supervisor: { conscientiousness: 1, agreeableness: 0.8, resilience: 0.8, extraversion: 0.5, openness: 0.4 },
  collaborative_clinic: { conscientiousness: 0.9, extraversion: 0.7, openness: 0.6, agreeableness: 0.6, resilience: 0.6 },
};

const round = (n) => Math.round(n * 10) / 10;

function normaliseAnswers(questions, answers) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const ordered = [...answers].sort((a, b) => a.questionId - b.questionId);

  return ordered.map((answer) => {
    const question = byId.get(answer.questionId);
    if (!question) {
      throw Object.assign(new Error(`Unknown question id ${answer.questionId}`), { status: 400 });
    }
    if (!Number.isInteger(answer.value) || answer.value < 1 || answer.value > 5) {
      throw Object.assign(new Error(`Answer for question ${question.position} must be 1-5`), {
        status: 400,
      });
    }
    const raw = question.reverse ? 6 - answer.value : answer.value;
    return {
      questionId: question.id,
      position: question.position,
      trait: question.trait,
      reverse: question.reverse,
      value: answer.value,
      score: round(((raw - 1) / 4) * 100),
    };
  });
}

function scoreTraits(scored) {
  const scores = {};
  const detail = {};

  for (const trait of TRAITS) {
    const items = scored.filter((s) => s.trait === trait.key);
    const raw = items.reduce((sum, s) => sum + s.score, 0);
    const average = items.length ? raw / items.length : 0;
    scores[trait.key] = round(average);
    detail[trait.key] = {
      label: trait.label,
      description: trait.description,
      score: round(average),
      band: average >= 70 ? "high" : average >= 45 ? "moderate" : "low",
    };
  }

  return { scores, detail };
}

function matchArchetype(scores) {
  let best = null;
  let runnerUp = null;

  for (const archetype of ARCHETYPES) {
    let total = 0;
    let maxWeight = 0;
    for (const [trait, weight] of Object.entries(archetype.weights)) {
      total += (scores[trait] ?? 0) * weight;
      maxWeight += 100 * weight;
    }
    const match = maxWeight ? total / maxWeight : 0;
    if (!best || match > best.match) {
      runnerUp = best;
      best = { ...archetype, match: round(match * 100) };
    } else if (!runnerUp || match > runnerUp.match) {
      runnerUp = { ...archetype, match: round(match * 100) };
    }
  }

  return { primary: best, secondary: runnerUp };
}

function matchRoles(scores) {
  return Object.entries(ROLE_FIT)
    .map(([role, weights]) => {
      let total = 0;
      let maxWeight = 0;
      for (const [trait, weight] of Object.entries(weights)) {
        total += (scores[trait] ?? 0) * weight;
        maxWeight += 100 * weight;
      }
      return { role, match: round(maxWeight ? (total / maxWeight) * 100 : 0) };
    })
    .sort((a, b) => b.match - a.match);
}

export function scorePersonality(questions, answers) {
  const scored = normaliseAnswers(questions, answers);
  const { scores, detail } = scoreTraits(scored);
  const { primary, secondary } = matchArchetype(scores);

  return {
    archetype: {
      key: primary.key,
      label: primary.label,
      tagline: primary.tagline,
      description: primary.description,
      strengths: primary.strengths,
      growth: primary.growth,
      match: primary.match,
    },
    secondaryArchetype: secondary
      ? { key: secondary.key, label: secondary.label, match: secondary.match }
      : null,
    traits: detail,
    scores,
    roleFit: matchRoles(scores),
    answers: scored,
    suggestedType: primary.label,
  };
}

export const questionCount = PERSONALITY_QUESTIONS.length;
