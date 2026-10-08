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
  Badge,
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
    <RoleShell role={role} portal={portal!} user={guard.user}>
      <div className="space-y-6">
        <PageTitle
          eyebrow="Private"
          description="Only you and the person you are talking to can read these."
          action={
            role === "user" ? (
              <LinkButton href="/portal/user/matching" size="sm">
                Browse therapists
              </LinkButton>
            ) : undefined
          }
        >
          Your messages
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
          <Stagger className="space-y-3">
            {conversations.map((conversation) => (
              <StaggerItem key={conversation.id}>
                <Link
                  href={`/portal/${role}/messages/${conversation.id}`}
                  className="card card-interactive flex items-start gap-3.5 p-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">
                    {avatarInitials(conversation.otherName ?? conversation.otherUserId)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {conversation.otherName ?? conversation.otherUserId.slice(0, 8)}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {conversation.unreadCount > 0 ? (
                          <>
                            <span className="sr-only">
                              {`${conversation.unreadCount} unread message${
                                conversation.unreadCount === 1 ? "" : "s"
                              }`}
                            </span>
                            <span aria-hidden="true">
                              <Badge tone="accent" className="min-w-5 justify-center">
                                {conversation.unreadCount}
                              </Badge>
                            </span>
                          </>
                        ) : null}
                        <span className="text-[11px] text-slate-500">
                          <time dateTime={conversation.updatedAt}>
                            {relativeTime(conversation.updatedAt)}
                          </time>
                        </span>
                      </span>
                    </span>
                    <span
                      className={`mt-1 block truncate text-xs ${
                        conversation.unreadCount > 0
                          ? "font-medium text-slate-700"
                          : "text-slate-500"
                      }`}
                    >
                      {conversation.lastMessage ?? "No messages yet"}
                    </span>
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </RoleShell>
  );
}
