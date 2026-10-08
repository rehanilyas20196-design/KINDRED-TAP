"use client";

import { useEffect, useState } from "react";
import { messageFor } from "@/lib/api";
import {
  TICKET_CATEGORIES,
  addSupportTicketMessage,
  createSupportTicket,
  fetchSupportTicket,
  type SupportTicket,
  type SupportTicketMessage,
} from "@/lib/clinical";
import { relativeTime } from "@/lib/support";
import {
  EmptyRow,
  LoadingRow,
  NoteTone,
  SupportSection,
  inputClass,
  labelClass,
} from "./parts";
import { Badge, Button, type Tone } from "@/components/ui";
import { Icon } from "@/components/icons";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_TONES: Record<string, Tone> = {
  open: "warning",
  in_progress: "info",
  resolved: "success",
  closed: "neutral",
};

const PRIORITY_LABELS: Record<string, string> = {
  normal: "Normal",
  urgent: "Urgent",
};

const PRIORITY_TONES: Record<string, Tone> = {
  normal: "neutral",
  urgent: "danger",
};

function priorityBadge(priority: string) {
  return (
    <Badge tone={PRIORITY_TONES[priority] ?? "neutral"}>
      {PRIORITY_LABELS[priority] ?? priority}
    </Badge>
  );
}

function statusBadge(status: string) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"}>{STATUS_LABELS[status] ?? status}</Badge>
  );
}

function categoryLabel(value: string): string {
  return TICKET_CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

interface Detail {
  ticket: SupportTicket;
  messages: SupportTicketMessage[];
}

/**
 * The support request form plus the person's own ticket history, so a request
 * is something they can come back to rather than a message into the void.
 */
export function TicketsSection({
  tickets,
  loading,
  error,
  prefillCategory,
  onPrefillUsed,
  onChanged,
}: {
  tickets: SupportTicket[];
  loading: boolean;
  error: string | null;
  prefillCategory: string | null;
  onPrefillUsed: () => void;
  onChanged: (tickets: SupportTicket[]) => void;
}) {
  const [category, setCategory] = useState("account_problem");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<SupportTicket | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyPending, setReplyPending] = useState(false);

  /**
   * "Report a concern" from the privacy section hands over a category. It is
   * applied while rendering rather than in an effect, and the scroll runs
   * afterwards so the form is already showing the right option.
   */
  const [appliedPrefill, setAppliedPrefill] = useState<string | null>(null);
  if (prefillCategory) {
    if (prefillCategory !== appliedPrefill) {
      setAppliedPrefill(prefillCategory);
      setCategory(prefillCategory);
      setJustCreated(null);
    }
  } else if (appliedPrefill !== null) {
    setAppliedPrefill(null);
  }

  useEffect(() => {
    if (!prefillCategory) return;
    document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth", block: "start" });
    onPrefillUsed();
  }, [prefillCategory, onPrefillUsed]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (subject.trim().length < 5) {
      setFormError("Give the request a short subject of at least 5 characters");
      return;
    }
    if (description.trim().length < 20) {
      setFormError("Describe your problem in at least 20 characters");
      return;
    }

    setPending(true);
    setFormError(null);
    try {
      const created = await createSupportTicket({
        category,
        subject: subject.trim(),
        description: description.trim(),
        priority,
      });
      setJustCreated(created.ticket);
      onChanged([created.ticket, ...tickets]);
      setSubject("");
      setDescription("");
      setPriority("normal");
    } catch (err) {
      setFormError(messageFor(err));
    } finally {
      setPending(false);
    }
  }

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchSupportTicket(id));
    } catch (err) {
      setDetailError(messageFor(err));
    } finally {
      setDetailLoading(false);
    }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (!openId || !reply.trim()) return;
    setReplyPending(true);
    setDetailError(null);
    try {
      const { message } = await addSupportTicketMessage(openId, reply.trim());
      setDetail((current) =>
        current ? { ...current, messages: [...current.messages, message] } : current
      );
      setReply("");
    } catch (err) {
      setDetailError(messageFor(err));
    } finally {
      setReplyPending(false);
    }
  }

  return (
    <SupportSection
      id="tickets"
      icon={<Icon name="ticket" className="h-5 w-5" />}
      title="Submit a support request"
      intro="Account, therapist, video call, privacy or technical problems - this is where they go."
      action={
        tickets.length ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {tickets.length} request{tickets.length === 1 ? "" : "s"} on file
          </span>
        ) : null
      }
    >
      <div className="space-y-5">
        {justCreated ? (
          <NoteTone tone="success">
            <span className="font-semibold">Support Request {justCreated.ticketNumber}</span> ·
            Status: {statusBadge(justCreated.status)}. Our support team will respond here.
            <Button
              variant="ghost"
              size="sm"
              className="ml-3"
              onClick={() => setJustCreated(null)}
            >
              Submit another
            </Button>
          </NoteTone>
        ) : null}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="ticket-category" className={labelClass}>
              How can we help?
            </label>
            <select
              id="ticket-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={inputClass}
            >
              {TICKET_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ticket-subject" className={labelClass}>
              Short summary
            </label>
            <input
              id="ticket-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Video call dropped halfway through"
              maxLength={120}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label htmlFor="ticket-description" className={labelClass}>
              Describe your problem
            </label>
            <textarea
              id="ticket-description"
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Write your message..."
              maxLength={5000}
              className={inputClass}
              required
            />
          </div>

          <fieldset>
            <legend className={labelClass}>Priority</legend>
            <div className="flex gap-3">
              {(["normal", "urgent"] as const).map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    priority === value
                      ? value === "urgent"
                        ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                        : "border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-500/10 dark:text-teal-200"
                      : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={value}
                    checked={priority === value}
                    onChange={() => setPriority(value)}
                    className="accent-teal-700"
                  />
                  {PRIORITY_LABELS[value]}
                </label>
              ))}
            </div>
          </fieldset>

          {formError ? <NoteTone tone="danger">{formError}</NoteTone> : null}

          <Button type="submit" loading={pending}>
            {pending ? "Submitting..." : "Submit request"}
          </Button>
        </form>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
            Your requests
          </h3>

          {loading ? (
            <div className="mt-2">
              <LoadingRow label="Loading your requests" />
            </div>
          ) : error ? (
            <div className="mt-2">
              <NoteTone tone="danger">{error}</NoteTone>
            </div>
          ) : tickets.length === 0 ? (
            <div className="mt-2">
              <EmptyRow>No requests yet. Anything you submit shows up here with a status.</EmptyRow>
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800"
                >
                  <button
                    type="button"
                    onClick={() => void toggle(ticket.id)}
                    aria-expanded={openId === ticket.id}
                    aria-controls={`ticket-detail-${ticket.id}`}
                    className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                        {ticket.ticketNumber} · {ticket.subject}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {categoryLabel(ticket.category)} · {relativeTime(ticket.createdAt)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {priorityBadge(ticket.priority)}
                      {statusBadge(ticket.status)}
                      <Icon
                        name="arrowRight"
                        className={`h-4 w-4 shrink-0 text-slate-400 transition ${
                          openId === ticket.id ? "rotate-90" : ""
                        }`}
                      />
                    </span>
                  </button>

                  <div
                    id={`ticket-detail-${ticket.id}`}
                    hidden={openId !== ticket.id}
                    className="border-t border-slate-100 px-4 py-4 dark:border-slate-800"
                  >
                    {detailLoading ? (
                      <LoadingRow label="Loading this request" />
                    ) : detailError ? (
                      <NoteTone tone="danger">{detailError}</NoteTone>
                    ) : detail ? (
                      <div className="space-y-3">
                        <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                          {detail.ticket.description}
                        </div>

                        <ul className="space-y-2">
                          {detail.messages.length === 0 ? (
                            <li className="text-xs text-slate-500 dark:text-slate-400">
                              No replies yet. Our support team will respond here.
                            </li>
                          ) : (
                            detail.messages.map((message) => (
                              <li
                                key={message.id}
                                className={`rounded-xl px-3.5 py-2.5 text-xs leading-5 ${
                                  message.senderRole === "user"
                                    ? "bg-teal-50 text-teal-900 dark:bg-teal-500/10 dark:text-teal-100"
                                    : "bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                                }`}
                              >
                                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide opacity-70">
                                  {message.senderRole === "user" ? "You" : "Support team"} ·{" "}
                                  {relativeTime(message.createdAt)}
                                </span>
                                {message.body}
                              </li>
                            ))
                          )}
                        </ul>

                        <form onSubmit={sendReply} className="flex flex-wrap gap-2">
                          <input
                            type="text"
                            value={reply}
                            onChange={(event) => setReply(event.target.value)}
                            placeholder="Add to this request..."
                            aria-label="Reply to this support request"
                            className={`${inputClass} min-w-0 flex-1`}
                          />
                          <Button
                            type="submit"
                            variant="secondary"
                            loading={replyPending}
                            disabled={!reply.trim()}
                          >
                            {replyPending ? "Sending..." : "Send"}
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              setJustCreated(null);
              document
                .getElementById("tickets")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            Back to the form
          </Button>
        </div>
      </div>
    </SupportSection>
  );
}
