/**
 * Seed questions for the two-part concern assessment.
 *
 * Test 1: PHQ-9-style (Patient Health Questionnaire-9) - Depression screening
 * Test 2: GAD-7-style (Generalized Anxiety Disorder-7) - Anxiety screening
 *
 * These are original practice questions written in the style of each instrument
 * so the flow can be exercised without importing a copyrighted clinical instrument.
 * Swap the wording for licensed items before using this for real clinical work.
 *
 * Two things are load-bearing:
 *
 * 1. `category` holds an `issues.key`, not free text. That join is what lets the
 *    deterministic scorer categorise answers with no model involved, which is
 *    what keeps matching working when the AI is unreachable.
 *
 * 2. For PHQ-9 style (Test 1): Uses 4-option Likert scale (0-3): Not at all, Several days, More than half the days, Nearly every day
 *    For GAD-7 style (Test 2): Uses same 4-option Likert scale
 */

const PHQ9_TIMEFRAME = "During the past 2 weeks, how often have you experienced the following?";

/* ------------------------------------------------------------------ */
/* Test 1 - PHQ-9-style (Depression screening) - 10 questions         */
/* ------------------------------------------------------------------ */

const TEST_ONE = [
  {
    position: 1,
    category: "DEPRESSION",
    prompt: `${PHQ9_TIMEFRAME}\n\nHave you had little interest or enjoyment in activities you normally like?`,
  },
  {
    position: 2,
    category: "DEPRESSION",
    prompt: `${PHQ9_TIMEFRAME}\n\nHave you felt sad, down, or emotionally low?`,
  },
  {
    position: 3,
    category: "SLEEP",
    prompt: `${PHQ9_TIMEFRAME}\n\nHave you had difficulty falling asleep, staying asleep, or sleeping too much?`,
  },
  {
    position: 4,
    category: "DEPRESSION",
    prompt: `${PHQ9_TIMEFRAME}\n\nHave you felt unusually tired or lacking energy?`,
  },
  {
    position: 5,
    category: "DEPRESSION",
    prompt: `${PHQ9_TIMEFRAME}\n\nHave you noticed a significant change in your appetite?`,
  },
  {
    position: 6,
    category: "SELF_ESTEEM",
    prompt: `${PHQ9_TIMEFRAME}\n\nHave you felt disappointed in yourself or felt that you were not good enough?`,
  },
  {
    position: 7,
    category: "DEPRESSION",
    prompt: `${PHQ9_TIMEFRAME}\n\nHave you had trouble concentrating on things such as studying, reading, or watching something?`,
  },
  {
    position: 8,
    category: "DEPRESSION",
    prompt: `${PHQ9_TIMEFRAME}\n\nHave you felt noticeably slowed down or unusually restless?`,
  },
  {
    position: 9,
    category: "DEPRESSION",
    prompt: `${PHQ9_TIMEFRAME}\n\nHave you had thoughts that life is not worth living or thoughts of hurting yourself?`,
  },
  {
    position: 10,
    category: "DEPRESSION",
    prompt: `${PHQ9_TIMEFRAME}\n\nHow much have these difficulties interfered with your work, studies, relationships, or daily activities?`,
  },
];

const GAD7_TIMEFRAME = "During the past 2 weeks, how often have you experienced the following?";

/* ------------------------------------------------------------------ */
/* Test 2 - GAD-7-style (Anxiety screening) - 10 questions            */
/* ------------------------------------------------------------------ */

const TEST_TWO = [
  {
    position: 11,
    category: "ANXIETY",
    prompt: `${GAD7_TIMEFRAME}\n\nHave you felt nervous, worried, or on edge?`,
  },
  {
    position: 12,
    category: "ANXIETY",
    prompt: `${GAD7_TIMEFRAME}\n\nHave you found it difficult to stop or control your worrying?`,
  },
  {
    position: 13,
    category: "ANXIETY",
    prompt: `${GAD7_TIMEFRAME}\n\nHave you worried excessively about several different things?`,
  },
  {
    position: 14,
    category: "ANXIETY",
    prompt: `${GAD7_TIMEFRAME}\n\nHave you found it difficult to relax?`,
  },
  {
    position: 15,
    category: "ANXIETY",
    prompt: `${GAD7_TIMEFRAME}\n\nHave you felt restless or unable to sit comfortably?`,
  },
  {
    position: 16,
    category: "ANXIETY",
    prompt: `${GAD7_TIMEFRAME}\n\nHave you become easily irritated or frustrated?`,
  },
  {
    position: 17,
    category: "ANXIETY",
    prompt: `${GAD7_TIMEFRAME}\n\nHave you been afraid that something bad might happen?`,
  },
  {
    position: 18,
    category: "ANXIETY",
    prompt: `${GAD7_TIMEFRAME}\n\nHave you found that worry makes it difficult to concentrate?`,
  },
  {
    position: 19,
    category: "ANXIETY",
    prompt: `${GAD7_TIMEFRAME}\n\nHave your worries affected your sleep?`,
  },
  {
    position: 20,
    category: "ANXIETY",
    prompt: `${GAD7_TIMEFRAME}\n\nHow much have these anxiety-related difficulties interfered with your daily life, work, studies, or relationships?`,
  },
];

/**
 * The concern vocabulary.
 *
 * Seeded so a fresh install is usable, and extendable by an administrator:
 * `key` is the stable join value the scorer and matcher both use, so adding a
 * category is a data change. Nothing in the application hardcodes these.
 */
export const DEFAULT_ISSUES = [
  { key: "ANGER", label: "Anger", description: "Reacting quickly to frustration, or feeling persistently angry." },
  { key: "ANXIETY", label: "Anxiety", description: "Worry, on-edge feelings, or difficulty settling." },
  { key: "STRESS", label: "Stress", description: "Feeling overwhelmed or stretched beyond what you can manage." },
  {
    key: "DEPRESSION",
    label: "Depression-related concerns",
    description: "Low mood, reduced interest, or feeling hopeless.",
  },
  {
    key: "RELATIONSHIP",
    label: "Relationship problems",
    description: "Difficulties with partners, family, friends or colleagues.",
  },
  { key: "SELF_ESTEEM", label: "Self-esteem", description: "Difficulties with self-worth and confidence." },
  { key: "SLEEP", label: "Sleep problems", description: "Difficulty sleeping, or sleeping badly." },
  { key: "GRIEF", label: "Grief", description: "Loss, bereavement, or endings that are hard to adjust to." },
  {
    key: "WORK_STRESS",
    label: "Work stress",
    description: "Pressure, burnout, or difficulty coping at work or study.",
  },
  {
    key: "EMOTIONAL_REGULATION",
    label: "Emotional regulation",
    description: "Finding it hard to manage strong feelings when they arise.",
  },
  {
    key: "OTHER",
    label: "Something else",
    description: "None of the above describes what you are dealing with.",
  },
];

/**
 * PHQ-9 and GAD-7 both use a 4-point Likert scale:
 * 0 = Not at all, 1 = Several days, 2 = More than half the days, 3 = Nearly every day
 * The database stores values 1-4 (1=Not at all, 2=Several days, 3=More than half the days, 4=Nearly every day)
 * The frontend will show the labels and map to 1-4 values.
 */
const LIKERT_OPTIONS = [
  "Not at all",
  "Several days",
  "More than half the days",
  "Nearly every day",
];

/** Exported for the seed script and tests. */
export const ASSESSMENT_QUESTIONS = [
  ...TEST_ONE.map((q) => ({
    ...q,
    testNumber: 1,
    questionType: "likert",
    options: LIKERT_OPTIONS,
    required: true,
    active: true,
    scoringConfig: { reverse: false },
  })),
  ...TEST_TWO.map((q) => ({
    ...q,
    testNumber: 2,
    questionType: "likert",
    options: LIKERT_OPTIONS,
    required: true,
    active: true,
    scoringConfig: { reverse: false },
  })),
];