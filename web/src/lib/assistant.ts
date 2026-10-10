import { apiPost } from "@/lib/api";

export interface AssistantCitation {
  title: string;
  section: string | null;
  source: string;
}

export interface AssistantAnswer {
  answer: string;
  citations: AssistantCitation[];
  insufficient: boolean;
  safety?: boolean;
  disclaimer: string;
}

/**
 * Asks the server-side assistant, which answers only from the documentation
 * the admin team has indexed.
 *
 * This is deliberately not the default path. `lib/ai-support.ts` answers how
 * a person feels without the words ever leaving the browser, and that promise
 * is the reason the emotional engine stays local. This function is used only
 * when the question is plainly about the app, and the chat labels which of the
 * two answered so nobody has to guess where a reply came from.
 */
export function askPlatformAssistant(question: string): Promise<AssistantAnswer> {
  return apiPost<AssistantAnswer>("/api/assistant/ask", { question });
}

/**
 * Nouns that mean "this is about the product rather than about me".
 *
 * A message has to satisfy all three conditions to leave the browser: it reads
 * as a question, it mentions something in the app, and it does not open with a
 * feeling. Anything ambiguous stays local, because the cost of guessing wrong
 * is sending a private sentence to a server.
 */
const APP_NOUN =
  /\b(account|password|sign\s?up|signup|log\s?in|login|verif\w*|approv\w*|reject\w*|session|appointment|book\w*|cancel\w*|reschedul\w*|invoice|bill\w*|pay\w*|refund\w*|subscription|therap\w*|match\w*|consent|privacy|your\s+data|ticket|support\s+request|portal|profile|dashboard|settings?|notification|email|clinic|supervisor|advisor|documentation)\b/i;

const OPENS_WITH_A_QUESTION =
  /^(how|what|why|when|where|who|which|can|could|should|would|is|are|was|were|do|does|did|will)\b/i;

const OPENS_WITH_A_FEELING =
  /^(i\s+feel|i['’]m\s+feeling|i\s+am\s+feeling|feeling|my\s+mood|today\s+(has\s+been|was)|i['’]m\s+so|i\s+am\s+so|i['’]ve\s+been|been\s+feeling|sad|anxious|angry|hopeless|numb|lonely|scared|overwhelmed|exhausted|lost|empty)\b/i;

export function isPlatformQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (OPENS_WITH_A_FEELING.test(trimmed)) return false;
  return OPENS_WITH_A_QUESTION.test(trimmed) && APP_NOUN.test(trimmed);
}
