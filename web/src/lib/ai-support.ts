/**
 * The rule-based engine behind the AI Support Assistant.
 *
 * Deliberately local: nothing typed here is sent anywhere, so a person can
 * describe how they feel without it leaving the browser. It offers wording,
 * grounding and next steps - it never diagnoses, never assesses risk on its
 * own, and always steps aside for the emergency section when the language
 * turns to danger.
 */

export type AiReplyKind = "safety" | "support" | "action";

export interface AiAction {
  label: string;
  href: string;
}

export interface AiReply {
  text: string;
  kind: AiReplyKind;
  actions?: AiAction[];
}

export interface AiContext {
  /** Label of the concern the assessment settled on, e.g. "Anger". */
  concernLabel?: string | null;
  therapistName?: string | null;
}

export const AI_DISCLAIMER =
  "AI support offers guidance and wording only. It is not a therapist, does not give " +
  "diagnoses or treatment, and cannot respond in an emergency - use the urgent help " +
  "section when you need a person now.";

export const AI_SUGGESTIONS = [
  "I'm feeling angry today",
  "I don't know how to explain my feelings",
  "What should I discuss with my therapist?",
  "I want to update my mood",
];

/**
 * Language that means danger rather than distress. Anything here skips the
 * conversational rules entirely and points straight at human help.
 */
const SAFETY_PATTERN =
  /\b(suicid\w*|kill\s*myself|end\s*(my|it\s*all)|want\s*to\s*die|do(?:n't| not)\s*want\s*to\s*(live|be here)|self[-\s]?harm|hurt\s*myself|take\s*my\s*own\s*life|no\s*reason\s*to\s*live|better\s*off\s*dead)\b/i;

const has = (text: string, pattern: RegExp) => pattern.test(text);

/** Honorifics are not names: "Dr Jane Okafor" should read as Jane, not Dr. */
const TITLE_PATTERN = /^(dr|mr|mrs|ms|miss|prof|professor|rev)\.?$/i;

/** First names only: the assistant should feel like part of the app, not a stranger. */
function firstName(name?: string | null): string | null {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const first = parts.find((part) => !TITLE_PATTERN.test(part));
  return first ? first : null;
}

export function aiReply(rawInput: string, context: AiContext = {}): AiReply {
  const input = rawInput.trim();
  const text = input.toLowerCase();

  if (SAFETY_PATTERN.test(input)) {
    return {
      kind: "safety",
      text:
        "Thank you for saying that out loud - that takes something. What you are describing " +
        "is an emergency rather than something an assistant can help with, so please talk to a " +
        "person now: contact your local emergency number, a crisis line, or someone you trust " +
        "who can stay with you.",
      actions: [
        { label: "Open urgent help", href: "#urgent" },
        { label: "Contact your therapist", href: "#therapist" },
      ],
    };
  }

  if (has(text, /(what|which).*(discuss|talk|bring|cover|ask).*(therapist|session)|prepare.*(session|therapy)/)) {
    const concern = context.concernLabel ? context.concernLabel.toLowerCase() : null;
    return {
      kind: "action",
      text:
        `Start with what changed since you last spoke: what has been better, what has been worse, ` +
        `and one moment this week that got to you. ` +
        (concern
          ? `Your assessment settled on ${concern}, so you could also bring a recent example of it and what you tried.`
          : `You could also bring a recent example of what you are dealing with and what you tried.`),
      actions: [
        { label: "See your sessions", href: "#sessions" },
        { label: "Message your therapist", href: "#therapist" },
      ],
    };
  }

  if (has(text, /(can'?t|cannot|don'?t know how|struggle).*(explain|put|int|describe|word)|find the words|don'?t know what to say/)) {
    return {
      kind: "support",
      text:
        "You do not need to explain it well - a few plain sentences are enough. Try: " +
        "'It comes in waves', 'It is worst in the mornings', 'It started when…'. " +
        "Write three bullet points before your next session and read them out if the words " +
        "go missing; that is a normal way to start, and your therapist will take it from there.",
      actions: [{ label: "Practise it in the assessment", href: "/portal/user/assessment" }],
    };
  }

  if (has(text, /(update|change|log|record|track).*(mood|feeling)|how i feel today|mood check/)) {
    return {
      kind: "action",
      text:
        "Your mood is recorded through the assessment, which is what matching and your " +
        "therapist read from. Re-run it with how things are right now and the results update " +
        "straight away.",
      actions: [{ label: "Update how I feel", href: "/portal/user/assessment" }],
    };
  }

  if (has(text, /book|reschedule|appointment|book session|when.*session|cancel.*session/)) {
    return {
      kind: "action",
      text: "Sessions live in your diary. You can book a new one, move it or call it off there.",
      actions: [{ label: "Open my sessions", href: "#sessions" }],
    };
  }

  if (has(text, /\bangry\b|\brage\b|\bfurious\b|\birritat\w*\b|\birked\b|lost my temper|so annoyed/)) {
    return {
      kind: "support",
      text:
        "Anger is usually a signal that something matters to you, not a fault in you. Try " +
        "slowing the exhale - a long out-breath for twice as long as the in-breath - then name " +
        "the feeling once ('I am angry because…') before deciding anything. Anger also tends " +
        "to peak and pass within minutes if you give it that time.",
      actions: [{ label: "What to discuss with your therapist", href: "#ai" }],
    };
  }

  if (has(text, /\banxious\b|\banxiety\b|\bpanic\b|\bpanick|\bworried\b|\boverwhelm\w*\b|\bracing\b/)) {
    return {
      kind: "support",
      text:
        "That restless, braced feeling is your body running the alarm early. Try naming five " +
        "things you can see, four you can feel, three you can hear - it pulls attention out of " +
        "the loop and back into the room. Then shrink the next step to something you can finish " +
        "in ten minutes rather than the whole day.",
      actions: [],
    };
  }

  if (has(text, /\bsad\b|\blow\b|\bdown\b|\bdepress\w*|\blonely\b|\bhopeless\b|\bnumb\b|\bcry\w*\b/)) {
    return {
      kind: "support",
      text:
        "Heavy days are worth saying plainly rather than pushing through. Do the smallest kind " +
        "thing available - water, daylight, one message to someone - and notice that the feeling " +
        "is a state, not a verdict. If it has been flat for weeks rather than days, that is worth " +
        "naming in your next session.",
      actions: [],
    };
  }

  if (has(text, /\btired\b|\bexhaust\w*\b|\bsleep\b|\binsomni\w*\b|\bwake\w*\b/)) {
    return {
      kind: "support",
      text:
        "Sleep tends to follow a routine more than it follows effort: same wake time, daylight " +
        "early, no screens for the last half hour. If nights are racing rather than quiet, write " +
        "the next day's worries down before bed so your head does not have to hold them.",
      actions: [],
    };
  }

  if (has(text, /\bthank\b|\bthanks\b|\bhelpful\b|\bappreciate\b/)) {
    return {
      kind: "support",
      text: "Any time. Nothing you type here is stored or shown to anyone else.",
      actions: [],
    };
  }

  if (has(text, /\bwho are you\b|\bare you a (therapist|doctor|human)\b|\breal person\b/)) {
    const therapist = firstName(context.therapistName);
    return {
      kind: "support",
      text:
        "I am a support assistant built into the app - a set of prompts and next steps, not a " +
        "clinician and not a person. " +
        (therapist
          ? `${therapist} is the professional in your corner; I can help you get ready for that conversation.`
          : "Your matched therapist is the professional in your corner."),
      actions: [{ label: "About privacy", href: "#privacy" }],
    };
  }

  return {
    kind: "support",
    text:
      "I can help you put words to it, prepare for a session, or find the right part of the app. " +
      "If you would rather start somewhere concrete: what has today actually been like?",
    actions: [
      { label: "My sessions", href: "#sessions" },
      { label: "Support request", href: "#tickets" },
    ],
  };
}
