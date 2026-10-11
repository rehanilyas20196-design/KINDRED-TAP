"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cubee } from "@/components/cubee";
import { Button } from "@/components/ui";
import {
  ChatBubble,
  MOOD_LABEL,
  SUGGESTIONS,
  useAssistantChat,
} from "@/components/assistant/chat-engine";

/**
 * The floating assistant, available on every page.
 *
 * The same two engines as the support page: feelings are answered here in the
 * browser and never sent anywhere, and a plain question about the app goes to
 * the server, which answers only from the documentation the admin team has
 * indexed. Every assistant line carries a badge naming which one spoke.
 *
 * This is a preview of the support page's assistant, not a second
 * implementation of it - both read the conversation from `chat-engine.tsx`,
 * so the safety pattern, the routing rule and the source badges cannot drift
 * apart between the two.
 */
export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { lines, mood, busy, send, typing } = useAssistantChat({
    // The widget cannot offer a ticket form, so a failed lookup points back at
    // the page that can. This is the only difference from the support page.
    unreachable:
      "I could not reach the server just now, so that question went unanswered. Try again in a moment, or open full support below and a person will pick it up.",
  });
  const path = usePathname();
  const scroller = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // Stay pinned to the newest line. Re-running on `lines` is what makes this
  // follow the conversation rather than only the first message.
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines, open]);

  // Escape closes and returns focus to the button that opened it, so the
  // widget never strands keyboard focus inside a hidden panel.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // There is one layout, so this is the only place that decides where the dock
  // appears. The support page already carries the full assistant; a second one
  // floating over it would be clutter rather than help. Returning here rather
  // than above the effects keeps the hook order identical on every render.
  if (path === "/portal/user/support") return null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = input;
    setInput("");
    typing("");
    void send(text);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open ? (
        <section
          aria-label="Kindred Tap assistant"
          className="flex h-[min(32rem,calc(100dvh-8rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
            <Cubee mood={mood} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Cubee</p>
              <p
                role="status"
                aria-live="polite"
                className="truncate text-xs text-slate-500 dark:text-slate-400"
              >
                {MOOD_LABEL[mood]}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
              aria-label="Close assistant"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              {/* Not in the shared glyph set: the set is portal vocabulary, and
                  a close mark is chrome, not a concept worth a name there. */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div
            ref={scroller}
            role="log"
            aria-label="Conversation with the assistant"
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
          >
            {lines.map((line, index) => (
              <ChatBubble key={`${line.role}-${index}`} line={line} assistantName="Cubee" />
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-2 dark:border-slate-800">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={busy}
                onClick={() => void send(suggestion)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] leading-4 text-slate-600 transition hover:border-teal-300 hover:text-teal-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-teal-600 dark:hover:text-teal-300"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
            <input
              type="text"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                typing(event.target.value);
              }}
              disabled={busy}
              placeholder="Write how you feel, or ask about the app..."
              aria-label="Message the assistant"
              className="field min-w-0 flex-1"
            />
            <Button type="submit" size="sm" disabled={busy || !input.trim()}>
              {busy ? "..." : "Send"}
            </Button>
          </form>

          <p className="border-t border-slate-100 px-4 py-2 text-[11px] leading-4 text-slate-500 dark:border-slate-800 dark:text-slate-500">
            How you feel stays in this browser.{" "}
            <Link
              href="/portal/user/support"
              className="font-medium text-teal-700 hover:underline dark:text-teal-300"
            >
              Open full support
            </Link>
          </p>
        </section>
      ) : null}

      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close the assistant" : "Open the assistant"}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-4 shadow-md transition hover:border-teal-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:hover:border-teal-600"
      >
        <Cubee mood={open ? mood : undefined} size={40} label="" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {open ? "Hide" : "Ask Cubee"}
        </span>
      </button>
    </div>
  );
}
