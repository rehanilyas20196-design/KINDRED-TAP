"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  usePortalGuard,
  GuardSplash,
  SignedOutPanel,
  WrongPortalPanel,
} from "@/components/portal-guard";
import { RoleShell } from "@/components/therapist/shell";
import {
  Button,
  EmptyState,
  LinkButton,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion-presets";
import { Icon } from "@/components/icons";
import { apiFetch, messageFor } from "@/lib/api";
import { portalFor } from "@/lib/portals";
import { relativeTime, type Conversation, type ConversationsResponse } from "@/lib/support";

function avatarInitials(name: string | null | undefined): string {
  return (
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") ?? "?"
  );
}

export default function ConversationList({ role }: { role: string }) {
  const guard = usePortalGuard(role);
  const portal = portalFor(role);

  // `null` means "never loaded", so a failure can be told apart from a
  // genuinely empty inbox instead of seeding an empty list.
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<ConversationsResponse>("/api/support/conversations");
      setConversations(data.conversations);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    if (guard.kind !== "ready") return;
    void (async () => {
      await load();
    })();
  }, [guard.kind, load]);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }

  function reload() {
    setConversations(null);
    setError(null);
    void load();
  }

  return (
    <RoleShell role={role} portal={portal!} user={guard.user} showWelcome={false}>
      <div className="space-y-5">
        <PageTitle
          description="A private place to stay in touch with your care team."
          action={
            role === "user" ? (
              <LinkButton href="/portal/user/matching" size="sm">
                Find a therapist
              </LinkButton>
            ) : undefined
          }
        >
          Messages
        </PageTitle>

        {error !== null && conversations === null ? (
          <EmptyState
            title="We could not load your messages"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : conversations === null ? (
          <LoadingState label="Loading conversations" />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={<Icon name="messages" className="h-5 w-5" />}
            title="No conversations yet"
            description={
              role === "user"
                ? "Message a therapist from your matches and the conversation will appear here."
                : "Conversations will appear here as soon as someone writes to you."
            }
            action={
              role === "user" ? (
                <LinkButton href="/portal/user/matching" variant="secondary" size="sm">
                  See matched therapists
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <Stagger className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {conversations.map((conversation) => (
              <StaggerItem key={conversation.id}>
                <Link
                  href={`/portal/${role}/messages/${conversation.id}`}
                  className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-[#f8f6f1] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-kindred-leaf sm:px-5"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-kindred-leaf-soft text-sm font-medium text-kindred-leaf">
                    {avatarInitials(conversation.otherName ?? conversation.otherUserId)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-900">
                        {conversation.otherName ?? conversation.otherUserId.slice(0, 8)}
                      </span>
                      <time
                        dateTime={conversation.updatedAt}
                        className="shrink-0 text-xs tabular-nums text-slate-500"
                      >
                        {relativeTime(conversation.updatedAt)}
                      </time>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      {conversation.otherRole ? (
                        <span className="shrink-0 text-xs text-slate-500">
                          {portalFor(conversation.otherRole)?.portal ?? "Care team"}
                        </span>
                      ) : null}
                      <span className="truncate text-sm text-slate-600">
                        {conversation.lastMessage ?? "No messages yet"}
                      </span>
                    </span>
                  </span>
                  {conversation.unreadCount > 0 ? (
                    <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-kindred-leaf">
                      <span className="h-2 w-2 rounded-full bg-kindred-leaf" aria-hidden="true" />
                      <span className="sr-only">
                        {`${conversation.unreadCount} unread message${
                          conversation.unreadCount === 1 ? "" : "s"
                        }`}
                      </span>
                    </span>
                  ) : null}
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </RoleShell>
  );
}
