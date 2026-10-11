"use client";

import { useCallback, useState } from "react";
import { AI_SUGGESTIONS, aiReply, type AiContext, type AiReply } from "@/lib/ai-support";
import {
  askPlatformAssistant,
  staysInBrowser,
  type AssistantCitation,
  type AssistantKind,
  type AssistantTurn,
} from "@/lib/assistant";

/**
 * The assistant conversation itself, shared by the support page and the
 * floating widget.
 *
 * Both face the same choice on every message - does this go to the browser
 * engine or to the documentation - and both owe the person the same
 * disclosure about which one answered. Keeping that here rather than in each
 * surface is why the safety pattern and the source badges cannot drift apart:
 * there is one copy, and both surfaces inherit it.
 *
 * The two surfaces differ only in what they can offer afterwards, so the
 * differences are parameters: `context` lets the support page name the
 * person's concern and therapist, and `unreachable` lets it point at the
 * ticket form where the widget instead points back at this file's other home.
 */

/**
 * Where a reply came from. Shown on every answer, never hidden.
 *
 * Three states rather than two, because "the server said it" is not one
 * answer: a cited passage and a plain conversation are different claims and
 * the badge has to be able to say which one was made.
 */
export type ReplySource = "browser" | "documentation" | "conversation";

/**
 * The six states the assistant drives, with the words shown under Cubee.
 *
 * Its own list rather than `CubeeMood`, because Cubee also serves forms,
 * which speak a different vocabulary. Exhaustive over exactly what the
 * assistant can set, so a missing label is still a build error.
 */
export type AssistantMood = "idle" | "listening" | "thinking" | "happy" | "confused" | "sad";

export interface ChatLine {
  role: "you" | "assistant";
  text: string;
  kind: AiReply["kind"] | "documentation";
  actions?: AiReply["actions"];
  citations?: AssistantCitation[];
  source?: ReplySource;
  /** The server's own classification, kept so the mood can follow it. */
  answerKind?: AssistantKind;
}

export const MOOD_LABEL: Record<AssistantMood, string> = {
  idle: "Ready when you are",
  listening: "Listening",
  thinking: "Thinking about that",
  happy: "Happy to help",
  confused: "I don't have that one",
  sad: "That one needs a person",
};

export const OPENING_LINE =
  "I can help you put words to how you feel, prepare for a session, or find the right part of the app. What has today been like?";

export const SUGGESTIONS = AI_SUGGESTIONS;

const DEFAULT_UNREACHABLE =
  "I could not reach the server just now, so that question went unanswered. Try again in a moment.";

export interface AssistantChatOptions {
  /** Lets a reply name the person's concern and therapist. */
  context?: AiContext;
  /** What to say when the server cannot be reached. */
  unreachable?: string;
}

export interface AssistantChat {
  lines: ChatLine[];
  mood: AssistantMood;
  busy: boolean;
  /** Sends a message. Ignored when empty or while a reply is pending. */
  send: (raw: string) => Promise<void>;
  /** Call on every keystroke so Cubee listens while the person types. */
  typing: (value: string) => void;
  /** Starts a new conversation: clears the transcript and the server memory. */
  reset: () => void;
}

export function useAssistantChat({
  context,
  unreachable = DEFAULT_UNREACHABLE,
}: AssistantChatOptions = {}): AssistantChat {
  const [lines, setLines] = useState<ChatLine[]>([
    { role: "assistant", kind: "support", text: OPENING_LINE, source: "browser" },
  ]);
  const [mood, setMood] = useState<AssistantMood>("idle");
  const [busy, setBusy] = useState(false);
  /**
   * The server holds the authoritative transcript once it has created a
   * conversation; until then these two carry it. Only turns that went to the
   * server are recorded here, so a private line answered in the browser can
   * never ride along in somebody else's request.
   */
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<AssistantTurn[]>([]);

  const append = useCallback((line: ChatLine) => {
    setLines((current) => [...current, line]);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || busy) return;

      append({ role: "you", text: trimmed, kind: "support" });

      if (staysInBrowser(trimmed)) {
        const reply = aiReply(trimmed, context);
        append({
          role: "assistant",
          kind: reply.kind,
          text: reply.text,
          actions: reply.actions,
          source: "browser",
        });
        setMood(reply.kind === "safety" ? "sad" : "happy");
        return;
      }

      setBusy(true);
      setMood("thinking");

      try {
        const result = await askPlatformAssistant(trimmed, { conversationId, history });

        const cited = (result.citations?.length ?? 0) > 0;
        const source: ReplySource = cited ? "documentation" : "conversation";

        append({
          role: "assistant",
          kind: result.safety ? "safety" : "documentation",
          text: result.answer,
          citations: result.citations,
          source,
          answerKind: result.kind,
        });

        setConversationId(result.conversationId ?? conversationId);
        setHistory((current) =>
          [
            ...current,
            { role: "user" as const, content: trimmed },
            { role: "assistant" as const, content: result.answer },
          ].slice(-20)
        );

        setMood(result.safety ? "sad" : result.insufficient ? "confused" : "happy");
      } catch {
        append({
          role: "assistant",
          kind: "support",
          text: unreachable,
          source: "conversation",
        });
        setMood("confused");
      } finally {
        setBusy(false);
      }
    },
    [busy, context, conversationId, history, unreachable, append]
  );

  const typing = useCallback(
    (value: string) => {
      if (!busy) setMood(value ? "listening" : "idle");
    },
    [busy]
  );

  const reset = useCallback(() => {
    setLines([{ role: "assistant", kind: "support", text: OPENING_LINE, source: "browser" }]);
    setConversationId(null);
    setHistory([]);
    setMood("idle");
  }, []);

  return { lines, mood, busy, send, typing, reset };
}

/**
 * One line of the conversation, with its source badge and any citations.
 *
 * Shared so the badge wording - the thing that tells a person whether their
 * words left the browser - is written once and shown identically in both
 * surfaces.
 */
export function ChatBubble({ line, assistantName }: { line: ChatLine; assistantName: string }) {
  const mine = line.role === "you";

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <span className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
        {mine ? "You" : assistantName}
      </span>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-5 ${
          line.kind === "safety"
            ? "bg-rose-600 text-white"
            : mine
              ? "bg-teal-700 text-white"
              : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        }`}
      >
        {line.text}
      </div>

      {mine ? null : (
        <span
          className={`mt-1.5 px-1 text-[10px] leading-4 ${
            line.source === "documentation"
              ? "text-teal-700 dark:text-teal-300"
              : "text-slate-500 dark:text-slate-500"
          }`}
        >
          {line.source === "documentation"
            ? "Answered from our documentation"
            : line.source === "conversation"
              ? "Answered by Ask Cube"
              : "Answered in this browser - nothing you typed was sent anywhere"}
        </span>
      )}

      {line.citations?.length ? (
        <ul className="mt-2 space-y-1 px-1">
          {line.citations.map((citation) => (
            <li
              key={citation.source}
              className="text-[11px] leading-4 text-slate-500 dark:text-slate-400"
            >
              Source: {citation.title}
              {citation.section ? ` - ${citation.section}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {line.actions?.length ? (
        <div className="mt-2 flex flex-wrap gap-2 px-1">
          {line.actions.map((action) => (
            <a key={action.label} href={action.href} className="btn btn-secondary btn-sm">
              {action.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
