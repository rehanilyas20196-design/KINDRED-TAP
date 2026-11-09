"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePortalGuard, GuardSplash, SignedOutPanel, WrongPortalPanel } from "@/components/portal-guard";
import { RoleShell } from "@/components/therapist/shell";
import { Alert, Button, EmptyState, LinkButton, LoadingState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiFetch, messageFor } from "@/lib/api";
import { portalFor } from "@/lib/portals";
import { clockTime, type Message, type MessagesResponse } from "@/lib/support";
import CallButton from "@/components/video-call/CallButton";
import { VideoCallInterface } from "@/components/video-call/VideoCallInterface";
import { useVideoCall } from "@/components/video-call/useVideoCall";

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
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const thread = useRef<HTMLDivElement | null>(null);
  const scrollRequested = useRef(false);

  const {
    callState,
    call,
    error: callError,
    startCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    isRinging,
  } = useVideoCall({
    conversationId,
    user:
      guard.kind === "ready"
        ? guard.user
        : ({ id: "", fullName: null, role: "", email: "", status: "" } as import("@/lib/api").AuthUser),
    otherUserId: otherUserId ?? "",
  });

  const load = useCallback(
    async (forceScroll = false) => {
      try {
        const data = await apiFetch<MessagesResponse>(
          `/api/support/conversations/${conversationId}/messages`
        );
        scrollRequested.current = forceScroll || isNearBottom(thread.current);
        setMessages(data.messages);
        setOtherName(data.other?.fullName ?? null);
        setOtherUserId(data.other?.id ?? null);
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

  const user = guard.user;
  const backHref = `/portal/${role}/messages`;

  // Keep the live room visible for both participants after the call is accepted.
  if (
    (callState === "accepted" || callState === "connecting" || callState === "connected") &&
    call
  ) {
    return (
      <RoleShell role={role} portal={portal!} user={user} showWelcome={false}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <LinkButton href={backHref} variant="ghost" size="sm">
              <Icon name="arrowLeft" className="h-3.5 w-3.5" />
              Messages
            </LinkButton>
            <p className="text-sm text-slate-600">
              Session with <span className="font-medium text-slate-900">{otherName ?? "Contact"}</span>
            </p>
          </div>
          <VideoCallInterface
            roomId={call.roomId}
            userName={user.fullName ?? "You"}
            otherName={otherName ?? "Contact"}
            callError={callError}
            onEnd={() => void endCall()}
          />
        </div>
      </RoleShell>
    );
  }

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
    <RoleShell role={role} portal={portal!} user={user} showWelcome={false}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <LinkButton href={backHref} variant="ghost" size="sm">
              <Icon name="arrowLeft" className="h-3.5 w-3.5" />
              Messages
            </LinkButton>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-kindred-leaf-soft text-sm font-medium text-kindred-leaf">
                {(otherName ?? "Care team")
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join("")}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-medium text-slate-900 sm:text-2xl">
                  {otherName ?? "Conversation"}
                </h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  {messages?.length
                    ? `${messages.length} messages`
                    : "Private conversation"}
                </p>
              </div>
            </div>
          </div>
          {role === "user" || role === "therapist" ? (
            <CallButton
              otherName={otherName ?? "Contact"}
              canCall={Boolean(otherUserId)}
              callState={callState}
              call={call}
              callError={callError}
              isRinging={isRinging}
              startCall={startCall}
              acceptCall={acceptCall}
              rejectCall={rejectCall}
              cancelCall={cancelCall}
            />
          ) : null}
        </div>

        <section className="card flex h-[min(68vh,680px)] min-h-[420px] flex-col overflow-hidden p-0">
          <div
            ref={thread}
            className="min-h-0 flex-1 overflow-y-auto bg-[#f8f6f1] p-4 sm:p-6"
            aria-label="Conversation messages"
          >
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
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-slate-600">
                  No messages yet. Write the first one below.
                </p>
              </div>
            ) : (
              <ul className="mx-auto max-w-3xl space-y-5" aria-live="polite" aria-relevant="additions">
                {messages.map((message) => {
                  const mine = message.senderId === user.id;
                  return (
                    <li
                      key={message.id}
                      className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                    >
                      <div className="mb-1.5 flex items-center gap-2 px-1 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">
                          {mine ? "You" : otherName ?? "Care team"}
                        </span>
                        <time dateTime={message.createdAt} className="tabular-nums">
                          {clockTime(message.createdAt)}
                        </time>
                      </div>
                      <div
                        className={`max-w-[86%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[76%] ${
                          mine
                            ? "rounded-br-md bg-kindred-leaf text-white"
                            : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                        }`}
                      >
                        {message.body}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div ref={bottom} />
          </div>

          {error ? (
            <div className="px-4 pt-3 sm:px-6">
              <Alert tone="warning">{error}</Alert>
            </div>
          ) : null}

          <form
            onSubmit={send}
            className="flex items-end gap-3 border-t border-slate-200 bg-white p-4 sm:p-5"
          >
            <label className="sr-only" htmlFor="thread-draft">
              Write a message
            </label>
            <textarea
              id="thread-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(event as unknown as React.FormEvent);
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder="Write a message"
              className="field min-h-12 flex-1 resize-none py-3 leading-6"
            />
            <Button
              type="submit"
              loading={sending}
              disabled={!draft.trim()}
              className="btn-green shrink-0 self-stretch px-5"
            >
              Send
            </Button>
          </form>
        </section>

        <p className="text-xs leading-5 text-slate-500">
          Messaging is not monitored around the clock. If you are in immediate danger, contact your
          local emergency number.
        </p>
      </div>
    </RoleShell>
  );
}
