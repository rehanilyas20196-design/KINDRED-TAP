import { apiPost } from "@/lib/api";

export interface AssistantCitation {
  title: string;
  section: string | null;
  source: string;
}

/** One turn of the transcript the server sees, so a follow-up has a referent. */
export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export type AssistantKind = "documented" | "conversation" | "refused" | "safety" | "unavailable";

export interface AssistantAnswer {
  answer: string;
  citations: AssistantCitation[];
  insufficient: boolean;
  safety?: boolean;
  disclaimer: string;
  kind?: AssistantKind;
  conversationId?: string | null;
}

export interface AskOptions {
  /** The stored conversation this turn continues, when there is one. */
  conversationId?: string | null;
  /** Turns not yet stored - the browser's copy for the first few exchanges. */
  history?: AssistantTurn[];
}

/**
 * Asks Ask Cube on the server.
 *
 * This is deliberately not the default path. `lib/ai-support.ts` answers how
 * a person feels without the words ever leaving the browser, and that promise
 * is the reason the emotional engine stays local. Anything else - a question
 * about the platform, an ordinary factual question, a greeting, a follow-up -
 * goes here, because deciding what counts as "about the product" needs the
 * whole conversation and belongs in one place rather than in every caller.
 *
 * The server routes from there: it searches the knowledge base when the
 * message is about the site, and talks to the language model when it is not.
 */
export function askPlatformAssistant(
  question: string,
  { conversationId, history }: AskOptions = {}
): Promise<AssistantAnswer> {
  return apiPost<AssistantAnswer>("/api/assistant/ask", {
    question,
    ...(conversationId ? { conversationId } : {}),
    ...(history && history.length > 0 ? { history } : {}),
  });
}

/**
 * Nouns that mean "this is about the product rather than about me".
 *
 * Retained because it is also the fastest honest answer to "should this
 * sentence leave the browser at all": anything matching is certainly safe to
 * send, and the server re-derives its own answer from the conversation.
 */
const APP_NOUN =
  /\b(account|password|sign\s?up|signup|log\s?in|login|verif\w*|approv\w*|reject\w*|session|appointment|book\w*|cancel\w*|reschedul\w*|invoice|bill\w*|pay\w*|refund|subscription|therap\w*|match\w*|consent|privacy|your\s+data|ticket|support\s+request|portal|profile|dashboard|settings?|notification|email|clinic|supervisor|advisor|documentation)\b/i;

const OPENS_WITH_A_QUESTION =
  /^(how|what|why|when|where|who|which|can|could|should|would|is|are|was|were|do|does|did|will)\b/i;

const OPENS_WITH_A_FEELING =
  /^(i\s+feel|i['’]m\s+feeling|i\s+am\s+feeling|feeling|my\s+mood|today\s+(has\s+been|was)|i['’]m\s+so|i\s+am\s+so|i['’]ve\s+been|been\s+feeling|sad|anxious|angry|hopeless|numb|lonely|scared|overwhelmed|exhausted|lost|empty)\b/i;

/**
 * Danger rather than a product question. Kept here as well as on the server
 * so a person in crisis never has their words transmitted in order to be
 * answered by a fixed script the browser already has.
 */
const SAFETY =
  /\b(suicid\w*|kill\s*myself|end\s*(my|it\s*all)|want\s*to\s*die|do(?:n't| not)\s+want\s+to\s+(live|be\s+here)|self[-\s]?harm|hurt\s*myself|take\s+my\s+own\s+life|no\s+reason\s+to\s+live|better\s*off\s*dead)\b/i;

const GREETING =
  /^(hi+|hello+|hey+|yo+|howdy|good\s+(morning|afternoon|evening|day)|thanks(?:\s+a\s+lot)?|thank\s+you|ty+|cheers|ok(?:ay)?|cool|sure|yes|yeah|no|nope|bye+|goodbye|who\s+are\s+you|what\s+(?:are|is)\s+your\s+name|are\s+you\s+(?:a\s+)?(?:bot|human|ai|real)|what\s+can\s+you\s+do|help(?:\s+me)?(?:\s+please)?)$/i;

/**
 * Whether a message should be answered by the browser instead of the server.
 *
 * Feelings and danger stay here because sending them would break the promise
 * shown under every local reply. Greetings stay here because a round trip to
 * say "hello" buys nothing. Everything else goes to Ask Cube, which has the
 * conversation history needed to make sense of a follow-up.
 */
export function staysInBrowser(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (SAFETY.test(trimmed)) return true;
  if (OPENS_WITH_A_FEELING.test(trimmed)) return true;
  if (trimmed.length <= 40 && GREETING.test(trimmed)) return true;
  return false;
}

export function isPlatformQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || staysInBrowser(trimmed)) return false;
  return OPENS_WITH_A_QUESTION.test(trimmed) && APP_NOUN.test(trimmed);
}
