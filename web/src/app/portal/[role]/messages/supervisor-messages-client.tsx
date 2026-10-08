"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SupervisorPage } from "@/components/supervisor/shell";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageTitle,
  SectionTitle,
} from "@/components/ui";
import { inputClass } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { apiFetch, messageFor } from "@/lib/api";
import { relativeTime, type Conversation, type ConversationsResponse } from "@/lib/support";
import { fetchThreadParticipants, openThread, type ThreadParticipant } from "@/lib/supervisor";

function humanLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/(^|\s)\S/g, (chunk) => chunk.toUpperCase());
}

export default function SupervisorMessagesClient() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [participants, setParticipants] = useState<ThreadParticipant[]>([]);
  const [pick, setPick] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ConversationsResponse>("/api/support/conversations");
      setConversations(data.conversations);
      setError(null);
    } catch (err) {
      setConversations([]);
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    fetchThreadParticipants().then((r) => setParticipants(r.participants)).catch(() => setParticipants([]));
    return () => clearTimeout(timer);
  }, [load]);

  async function startThread() {
    if (!pick) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await openThread(pick);
      router.push(`/portal/clinical_supervisor/messages/${result.conversationId}`);
    } catch (err) {
      setNotice(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  const visible = (conversations ?? []).filter(
    (conversation) => !q || (conversation.otherName ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <SupervisorPage>
      <PageTitle description="Supervisor ↔ therapist, supporter, clinical advisor and authorised staff. Client conversations are never exposed here.">
        Messages
      </PageTitle>

      <div className="mt-5 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <SectionTitle>New message</SectionTitle>
          <p className="mt-3 text-xs text-slate-500">Open a thread with a practitioner or staff member.</p>
          {notice ? <div className="mt-3"><Alert tone="danger">{notice}</Alert></div> : null}
          <select
            aria-label="Choose a person to message"
            className={`${inputClass} mt-3`}
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">Choose...</option>
            {participants.map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName ?? person.id.slice(0, 8)} ({humanLabel(person.role)})
              </option>
            ))}
          </select>
          <Button className="mt-3" disabled={!pick} loading={busy} onClick={() => void startThread()}>
            Open thread
          </Button>
        </Card>

        <div className="lg:col-span-2">
          <div className="relative mb-4">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              aria-label="Search conversations"
              placeholder="Search conversations"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>

          {error ? (
            <EmptyState
              title="We could not load conversations"
              description={error}
              action={<Button onClick={reload}>Try again</Button>}
            />
          ) : loading ? (
            <LoadingState label="Loading conversations" />
          ) : visible.length === 0 ? (
            <EmptyState
              title="No conversations"
              description="Open a thread with a practitioner or staff member to start."
            />
          ) : (
            <ul className="space-y-3">
              {visible.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/portal/clinical_supervisor/messages/${conversation.id}`}
                    className="card card-interactive block px-5 py-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">
                        {conversation.otherName ?? conversation.otherUserId.slice(0, 8)}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {conversation.otherRole ? (
                          <Badge tone="neutral">{humanLabel(conversation.otherRole)}</Badge>
                        ) : null}
                        {conversation.unreadCount > 0 ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-700 px-1.5 text-[10px] font-bold text-white">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                        <span className="text-[11px] text-slate-500">
                          <time dateTime={conversation.updatedAt}>{relativeTime(conversation.updatedAt)}</time>
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {conversation.lastMessage ?? "No messages yet"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SupervisorPage>
  );
}
