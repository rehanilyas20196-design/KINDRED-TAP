"use client";

import { useState } from "react";
import { AI_DISCLAIMER, AI_SUGGESTIONS, aiReply, type AiReply } from "@/lib/ai-support";
import { askPlatformAssistant, isPlatformQuestion, type AssistantCitation } from "@/lib/assistant";
import { Cubee, type CubeeMood } from "@/components/cubee";
import { NoteTone, SupportSection, inputClass } from "./parts";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

/** Where a reply came from. Shown on every answer, never hidden. */
type ReplySource = "browser" | "documentation";

interface ChatLine {
  role: "you" | "assistant";
  text: string;
  kind: AiReply["kind"] | "documentation";
  actions?: AiReply["actions"];
  citations?: AssistantCitation[];
  source?: ReplySource;
}

const OPENING_LINE =
  "I can help you put words to how you feel, prepare for a session, or find the right part of the app. What has today been like?";

const MOOD_LABEL: Record<CubeeMood, string> = {
  idle: "Ready when you are",
  listening: "Listening",
  thinking: "Looking that up in our documentation",
  happy: "Happy to help",
  confused: "I don't have that one",
  sad: "That one needs a person",
};

/**
 * The support assistant.
 *
 * Two engines, and the split is the point. Anything about how a person feels
 * is answered on this machine by `lib/ai-support.ts` - those words never
 * leave the browser, and the badge on the reply says so. A plain question
 * about how the app works goes to the server, which answers only from the
 * documentation the admin team has indexed, and cites the page it used.
 *
 * Every assistant line carries a badge naming its source, so nobody has to
 * take on trust which of the two just spoke.
 */
export function AiSupportSection({
  concernLabel,
  therapistName,
}: {
  concernLabel: string | null;
  therapistName: string | null;
}) {
  const [lines, setLines] = useState<ChatLine[]>([
    { role: "assistant", kind: "support", text: OPENING_LINE, source: "browser" },
  ]);
  const [input, setInput] = useState("");
  const [mood, setMood] = useState<CubeeMood>("idle");
  const [busy, setBusy] = useState(false);

  function append(line: ChatLine) {
    setLines((current) => [...current, line]);
  }

  async function send(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || busy) return;

    setInput("");
    append({ role: "you", text: trimmed, kind: "support" });

    if (isPlatformQuestion(trimmed)) {
      setBusy(true);
      setMood("thinking");

      try {
        const result = await askPlatformAssistant(trimmed);
        append({
          role: "assistant",
          kind: result.safety ? "safety" : "documentation",
          text: result.answer,
          citations: result.citations,
          source: "documentation",
        });
        setMood(result.safety ? "sad" : result.insufficient ? "confused" : "happy");
      } catch {
        append({
          role: "assistant",
          kind: "support",
          text: "I could not reach the server just now, so that question went unanswered. Try again in a moment, or raise a support request below and a person will pick it up.",
          source: "documentation",
        });
        setMood("confused");
      } finally {
        setBusy(false);
      }

      return;
    }

    const reply = aiReply(trimmed, { concernLabel, therapistName });
    append({
      role: "assistant",
      kind: reply.kind,
      text: reply.text,
      actions: reply.actions,
      source: "browser",
    });
    setMood(reply.kind === "safety" ? "sad" : "happy");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function handleInput(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setInput(value);
    if (!busy) setMood(value ? "listening" : "idle");
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

              {line.role === "assistant" ? (
                <span
                  className={`mt-1.5 px-1 text-[10px] leading-4 ${
                    line.source === "documentation"
                      ? "text-teal-700 dark:text-teal-300"
                      : "text-slate-500 dark:text-slate-500"
                  }`}
                >
                  {line.source === "documentation"
                    ? "Answered from our documentation"
                    : "Answered in this browser - nothing you typed was sent anywhere"}
                </span>
              ) : null}

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
