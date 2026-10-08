"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePortalGuard, GuardSplash, SignedOutPanel, WrongPortalPanel } from "@/components/portal-guard";
import { RoleShell } from "@/components/therapist/shell";
import { Alert, Button, EmptyState, LinkButton, LoadingState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiFetch, messageFor } from "@/lib/api";
import { portalFor } from "@/lib/portals";
import { clockTime, type Message, type MessagesResponse } from "@/lib/support";

const POLL_MS = 5000;

/** How far from the bottom still counts as "already reading the newest line". */
const NEAR_BOTTOM_PX = 120;

/** The element that actually scrolls: the nearest scrollable ancestor, else the page. */
function scrollContainerFor(el: HTMLElement | null): HTMLElement {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Measured *before* a new message array lands, so it describes the reading position. */
function isNearBottom(el: HTMLElement | null): boolean {
  const container = scrollContainerFor(el);
  return container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_BOTTOM_PX;
}

export default function MessageThread({
  role,
  conversationId,
}: {
  role: string;
  conversationId: string;
}) {
  const guard = usePortalGuard(role);
  const portal = portalFor(role);

  const [otherName, setOtherName] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error`: a failed *load* replaces the thread body, a
  // failed *send* only shows the warning under the composer.
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const thread = useRef<HTMLElement | null>(null);
  const scrollRequested = useRef(false);

  const load = useCallback(
    async (forceScroll = false) => {
      try {
        const data = await apiFetch<MessagesResponse>(
          `/api/support/conversations/${conversationId}/messages`
        );
        // Read the viewport before the update: a poll may only pull someone
        // down if they were already at the bottom, or if they just sent.
        scrollRequested.current = forceScroll || isNearBottom(thread.current);
        setMessages(data.messages);
        setOtherName(data.other?.fullName ?? null);
        setLoadError(null);
      } catch (err) {
        setLoadError(messageFor(err));
      }
    },
    [conversationId]
  );

  useEffect(() => {
    if (guard.kind !== "ready") return;
    void (async () => {
      await load();
    })();

    // Opening the thread clears the unread marker once, so the conversation
    // list stops counting messages this person has already read.
    apiFetch(`/api/support/conversations/${conversationId}/read`, {
      method: "POST",
      body: {},
    }).catch(() => {
      // A failed read receipt only means a badge stays on briefly.
    });

    // No websockets in this phase. Polling keeps a reply from the other person
    // appearing without a manual refresh, which is enough to verify the flow.
    const timer = setInterval(() => void load(), POLL_MS);

    return () => clearInterval(timer);
  }, [guard.kind, load, conversationId]);

  // Auto-scrolls only when `load` asked for it, so reading older history is
  // never interrupted by the poll replacing `messages`.
  useEffect(() => {
    if (!scrollRequested.current) return;
    scrollRequested.current = false;
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }

  const backHref = `/portal/${role}/messages`;

  function reload() {
    setLoadError(null);
    setMessages(null);
    void load();
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);
    try {
      await apiFetch<{ message: Message }>(
        `/api/support/conversations/${conversationId}/messages`,
        { method: "POST", body: { body } }
      );
      setDraft("");
      // Sending always jumps back to the newest line.
      await load(true);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <RoleShell role={role} portal={portal!} user={guard.user}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <LinkButton href={backHref} variant="ghost" size="sm">
              <Icon name="arrowLeft" className="h-3.5 w-3.5" />
              All messages
            </LinkButton>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {otherName ?? "Conversation"}
            </h2>
          </div>
          {messages && messages.length > 0 ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {`${messages.length} message${messages.length === 1 ? "" : "s"}`}
            </span>
          ) : null}
        </div>

        <section ref={thread} className="card min-h-[320px] p-5">
          {messages === null ? (
            loadError !== null ? (
              <EmptyState
                title="We could not load this conversation"
                action={<Button onClick={reload}>Try again</Button>}
              />
            ) : (
              <LoadingState label="Loading messages" />
            )
          ) : messages.length === 0 ? (
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
              No messages yet. Write the first one below.
            </p>
          ) : (
            <ul className="space-y-3" aria-live="polite" aria-relevant="additions">
              {messages.map((message) => {
                const mine = message.senderId === guard.user.id;
                return (
                  <li
                    key={message.id}
                    className={mine ? "flex justify-end" : "flex justify-start"}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                        mine
                          ? "bg-teal-700 text-white"
                          : "bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-100"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          mine ? "text-teal-100" : "text-slate-500 dark:text-slate-500"
                        }`}
                      >
                        {clockTime(message.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div ref={bottom} />
        </section>

        {error ? <Alert tone="warning">{error}</Alert> : null}

        <form onSubmit={send} className="flex items-end gap-3">
          <label className="sr-only" htmlFor="thread-draft">
            Write a message
          </label>
          <textarea
            id="thread-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter makes a new line.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(event as unknown as React.FormEvent);
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Write a message…"
            className="field min-h-12 flex-1 resize-none py-3 leading-6"
          />
          <Button
            type="submit"
            loading={sending}
            disabled={!draft.trim()}
            className="shrink-0 self-stretch px-5"
          >
            Send
          </Button>
        </form>

        <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          Press Enter to send, Shift + Enter for a new line. Messaging is not monitored around the
          clock — if you are in immediate danger, contact your local emergency number.
        </p>
      </div>
    </RoleShell>
  );
}
