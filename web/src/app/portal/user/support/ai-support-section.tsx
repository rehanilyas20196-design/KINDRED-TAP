"use client";

import { useState } from "react";
import { AI_DISCLAIMER, AI_SUGGESTIONS } from "@/lib/ai-support";
import { Cubee } from "@/components/cubee";
import {
  ChatBubble,
  MOOD_LABEL,
  useAssistantChat,
} from "@/components/assistant/chat-engine";
import { NoteTone, SupportSection, inputClass } from "./parts";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * The support assistant.
 *
 * Two engines, and the split is the point. Anything about how a person feels
 * is answered on this machine by `lib/ai-support.ts` - those words never
 * leave the browser, and the badge on the reply says so. A plain question
 * about how the app works goes to the server, which answers only from the
 * documentation the admin team has indexed, and cites the page it used.
 *
 * The conversation itself lives in `components/assistant/chat-engine.tsx`,
 * shared with the floating widget, so the routing rule, the safety pattern
 * and the source badges are written once. What is specific to this page is
 * the context it can supply - the person's concern and therapist - and the
 * layout around the conversation.
 */
export function AiSupportSection({
  concernLabel,
  therapistName,
}: {
  concernLabel: string | null;
  therapistName: string | null;
}) {
  const { lines, mood, busy, send, typing } = useAssistantChat({
    context: { concernLabel, therapistName },
    unreachable:
      "I could not reach the server just now, so that question went unanswered. Try again in a moment, or raise a support request below and a person will pick it up.",
  });
  const [input, setInput] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = input;
    setInput("");
    typing("");
    void send(text);
  }

  function handleInput(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setInput(value);
    typing(value);
  }

  return (
    <SupportSection
      id="ai"
      icon={<Icon name="assistant" className="h-5 w-5" />}
      title="AI support assistant"
      intro="Guidance and wording between sessions - not a replacement for a therapist."
    >
      <div className="space-y-4">
        <NoteTone tone="warning">{AI_DISCLAIMER}</NoteTone>

        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
          <Cubee mood={mood} size={84} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">Cubee</p>
            <p
              role="status"
              aria-live="polite"
              className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400"
            >
              {MOOD_LABEL[mood]}
            </p>
            <p className="mt-1.5 text-[11px] leading-4 text-slate-500 dark:text-slate-500">
              How you feel stays in this browser. Questions about the app are answered from our
              documentation.
            </p>
          </div>
        </div>

        <div
          role="log"
          aria-label="Conversation with the AI support assistant"
          className="h-72 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white/60 p-4 dark:border-slate-800 dark:bg-slate-900/40"
        >
          {lines.map((line, index) => (
            <ChatBubble
              key={`${line.role}-${index}`}
              line={line}
              assistantName="AI assistant"
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {AI_SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void send(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={input}
            onChange={handleInput}
            disabled={busy}
            placeholder="Write how you feel, or ask what the app can do..."
            aria-label="Message the AI support assistant"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy ? "Thinking..." : "Send"}
          </Button>
        </form>
      </div>
    </SupportSection>
  );
}
