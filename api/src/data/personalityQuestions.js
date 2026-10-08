/**
 * The 10 questions of the Kindred Tap personality check.
 *
 * Each question maps to one Big-Five style trait. Half of the questions are
 * reverse scored so that answering "always" is not automatically the "best"
 * answer, which keeps results honest.
 *
 * `trait` must stay in sync with the CHECK constraint on
 * personality_questions.trait.
 */
export const TRAITS = [
  { key: "openness", label: "Openness", description: "Curiosity, imagination and appetite for new ideas." },
  { key: "conscientiousness", label: "Conscientiousness", description: "Reliability, structure and follow-through." },
  { key: "extraversion", label: "Extraversion", description: "Energy gained from people and stimulation." },
  { key: "agreeableness", label: "Agreeableness", description: "Empathy, warmth and cooperation." },
  { key: "resilience", label: "Resilience", description: "Recovery after setbacks and emotional steadiness." },
];

export const LIKERT_OPTIONS = [
  { value: 1, label: "Strongly disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly agree" },
];

export const PERSONALITY_QUESTIONS = [
  {
    position: 1,
    trait: "openness",
    reverse: false,
    prompt: "I am drawn to ideas, art or theories that sit far outside my own experience.",
    hint: "Novelty and imagination",
  },
  {
    position: 2,
    trait: "openness",
    reverse: true,
    prompt: "I would rather rely on proven methods than explore ideas that are untested.",
    hint: "Preference for the familiar",
  },
  {
    position: 3,
    trait: "conscientiousness",
    reverse: false,
    prompt: "I finish what I start, even after the initial motivation fades.",
    hint: "Follow-through",
  },
  {
    position: 4,
    trait: "conscientiousness",
    reverse: true,
    prompt: "My files, notes and to-do lists are usually in a state of organised chaos.",
    hint: "Approach to order",
  },
  {
    position: 5,
    trait: "extraversion",
    reverse: false,
    prompt: "Being around a lot of people gives me energy rather than draining it.",
    hint: "Where you recharge",
  },
  {
    position: 6,
    trait: "extraversion",
    reverse: true,
    prompt: "After a busy social day I need long stretches of quiet in order to recover.",
    hint: "Social recovery",
  },
  {
    position: 7,
    trait: "agreeableness",
    reverse: false,
    prompt: "I try to understand a person's point of view before I react to it.",
    hint: "Perspective taking",
  },
  {
    position: 8,
    trait: "agreeableness",
    reverse: true,
    prompt: "Winning an argument matters more to me than keeping the peace.",
    hint: "Conflict style",
  },
  {
    position: 9,
    trait: "resilience",
    reverse: true,
    prompt: "A setback knocks me down for a long time.",
    hint: "Recovery speed",
  },
  {
    position: 10,
    trait: "resilience",
    reverse: false,
    prompt: "I get my energy back quickly after a hard day.",
    hint: "Emotional recovery",
  },
];
