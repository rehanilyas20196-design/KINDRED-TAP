"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  type Tone,
} from "@/components/ui";
import { Field, SegmentedControl, inputClass, textareaClass } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import {
  concernCategoryLabel,
  createConcern,
  fetchSafety,
  formatDay,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  type ConcernRow,
  type Priority,
  type SafetyList,
} from "@/lib/supervisor";

const UI_TONE: Record<string, Tone> = {
  teal: "accent",
  slate: "neutral",
  amber: "warning",
  rose: "danger",
  emerald: "success",
  sky: "info",
};

function uiTone(tone: string): Tone {
  return tone in UI_TONE ? UI_TONE[tone] : "neutral";
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "under_review", label: "Under review" },
  { value: "action_required", label: "Action required" },
  { value: "resolved", label: "Resolved" },
];

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  "urgent_client_concern",
  "risk_escalation",
  "client_status_change",
  "missed_sessions",
  "practitioner_concern",
  "safeguarding",
  "documentation",
  "communication",
  "treatment",
  "operational",
].map((value) => ({ value, label: concernCategoryLabel(value) }));

function SearchInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="relative w-full sm:min-w-56 sm:flex-1">
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} pl-9`}
      />
    </div>
  );
}

export default function SupervisorSafetyClient() {
  const [data, setData] = useState<SafetyList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchSafety({ status, priority, q });
      setData(result);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [status, priority, q]);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <SupervisorPage>
      <PageTitle
        description="Concerns raised by you or the team for human review. Nothing here diagnoses a client or closes a case on its own."
        action={
          <Button
            aria-expanded={showForm}
            aria-controls="raise-concern-form"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Close" : "Raise concern"}
          </Button>
        }
      >
        Safety Monitoring
      </PageTitle>

      <div id="raise-concern-form">
        {showForm ? (
          <ConcernForm
            onCreated={() => {
              setShowForm(false);
              void load();
            }}
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SegmentedControl options={STATUS_FILTERS} value={status} onChange={setStatus} ariaLabel="Filter by status" />
        <select
          aria-label="Filter by priority"
          className={`${inputClass} w-full sm:w-40`}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <SearchInput value={q} onChange={setQ} label="Search safety concerns" placeholder="Search reference, reason or person" />
      </div>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load safety concerns"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading safety concerns" />
        ) : !data || data.concerns.length === 0 ? (
          <EmptyState
            title="No safety concerns"
            description="There are currently no safety concerns in this view. New concerns raised by you or the team will appear here."
          />
        ) : (
          <Card>
            <SectionTitle detail={`${data.total} total`}>Concerns</SectionTitle>
            <ul className="mt-4 divide-y divide-slate-100">
              {data.concerns.map((concern) => (
                <ConcernRowItem key={concern.id} concern={concern} />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </SupervisorPage>
  );
}

function ConcernRowItem({ concern }: { concern: ConcernRow }) {
  return (
    <li>
      <Link
        href={`/portal/clinical_supervisor/safety/${concern.id}`}
        className="flex flex-wrap items-center justify-between gap-3 py-3 transition hover:opacity-90"
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            <Badge tone={uiTone(priorityTone(concern.priority))} dot>
              {priorityLabel(concern.priority)}
            </Badge>
            <Badge tone={uiTone(statusTone(concern.status))}>{statusLabel(concern.status)}</Badge>
            <span className="truncate">{concernCategoryLabel(concern.category)}</span>
          </p>
          <p className="mt-1 line-clamp-1 text-xs text-slate-500">{concern.reason}</p>
        </div>
        <div className="text-right text-[11px] text-slate-500">
          <p className="font-medium">{concern.reference}</p>
          <p>{concern.subjectName ?? concern.clientName ?? "No subject"}</p>
          <p>
            Follow-up{" "}
            {concern.followUpDate ? (
              <time dateTime={concern.followUpDate}>{formatDay(concern.followUpDate)}</time>
            ) : (
              "not set"
            )}
          </p>
        </div>
      </Link>
    </li>
  );
}

function ConcernForm({ onCreated }: { onCreated: () => void }) {
  const [category, setCategory] = useState("urgent_client_concern");
  const [priority, setPriority] = useState<Priority>("medium");
  const [reason, setReason] = useState("");
  const [information, setInformation] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await createConcern({
        category,
        priority,
        reason,
        information: information || null,
        followUpDate: followUpDate || null,
      });
      onCreated();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5">
      <SectionTitle>Raise a safety concern</SectionTitle>
      <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Reason for concern" hint="Describe what a person needs to review.">
            <textarea className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Relevant information (optional)">
            <textarea className={textareaClass} value={information} onChange={(e) => setInformation(e.target.value)} />
          </Field>
          <Field label="Follow-up date (optional)">
            <input type="date" className={inputClass} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy} disabled={reason.trim().length < 10}>
            Raise concern
          </Button>
          <Badge tone="neutral">Requires human review</Badge>
        </div>
      </form>
    </Card>
  );
}
