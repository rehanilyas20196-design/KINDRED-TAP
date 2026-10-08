"use client";

import { useState } from "react";
import { AI_DISCLAIMER, AI_SUGGESTIONS, aiReply, type AiReply } from "@/lib/ai-support";
import { NoteTone, SupportSection, inputClass } from "./parts";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

interface ChatLine {
  role: "you" | "assistant";
  text: string;
  kind: AiReply["kind"];
  actions?: AiReply["actions"];
}

/**
 * The support assistant.
 *
 * Everything it says is produced on this machine by `lib/ai-support.ts` - the
 * text somebody types about how they feel is never sent anywhere, and the
 * disclaimer stays on screen for the whole conversation.
 */
export function AiSupportSection({
  concernLabel,
  therapistName,
}: {
  concernLabel: string | null;
  therapistName: string | null;
}) {
  const [lines, setLines] = useState<ChatLine[]>([
    {
      role: "assistant",
      kind: "support",
      text: "I can help you put words to how you feel, prepare for a session, or find the right part of the app. What has today been like?",
    },
  ]);
  const [input, setInput] = useState("");

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const reply = aiReply(trimmed, { concernLabel, therapistName });
    setLines((current) => [
      ...current,
      { role: "you", text: trimmed, kind: "support" },
      {
        role: "assistant",
        text: reply.text,
        kind: reply.kind,
        actions: reply.actions,
      },
    ]);
    setInput("");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    send(input);
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

        <div
          role="log"
          aria-label="Conversation with the AI support assistant"
          className="h-72 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40"
        >
          {lines.map((line, index) => (
            <div
              key={`${line.role}-${index}`}
              className={`flex flex-col ${line.role === "you" ? "items-end" : "items-start"}`}
            >
              <span className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                {line.role === "you" ? "You" : "AI assistant"}
              </span>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-5 ${
                  line.kind === "safety"
                    ? "bg-rose-600 text-white"
                    : line.role === "you"
                      ? "bg-teal-700 text-white"
                      : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                }`}
              >
                {line.text}
              </div>
              {line.actions?.length ? (
                <div className="mt-2 flex flex-wrap gap-2 px-1">
                  {line.actions.map((action) => (
                    <a
                      key={action.label}
                      href={action.href}
                      className="btn btn-secondary btn-sm"
                    >
                      {action.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {AI_SUGGESTIONS.map((suggestion) => (
            <Button key={suggestion} variant="secondary" size="sm" onClick={() => send(suggestion)}>
              {suggestion}
            </Button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Write how you feel, or ask what to say..."
            aria-label="Message the AI support assistant"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <Button type="submit">Send</Button>
        </form>
      </div>
    </SupportSection>
  );
}
