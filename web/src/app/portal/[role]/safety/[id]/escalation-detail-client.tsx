"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdvisorPage } from "@/components/advisor/shell";
import { Icon } from "@/components/icons";
import {
  DataRow,
  Field,
  Panel,
  textareaClass,
} from "@/components/therapist/ui";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LoadingState,
  PageTitle,
  type Tone,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import {
  actOnEscalation,
  escalationStatusLabel,
  fetchEscalation,
  formatDateTime,
  type SafetyAction,
  type SafetyDetail,
} from "@/lib/advisor";

function priorityTone(priority: string): Tone {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "info";
  return "neutral";
}

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function statusTone(status: string): Tone {
  if (status === "new") return "danger";
  if (status === "under_review") return "info";
  if (status === "action_required") return "warning";
  if (status === "resolved") return "success";
  return "neutral";
}

const ACTION_LABEL: Record<SafetyAction, string> = {
  acknowledge: "Acknowledged",
  escalate: "Escalated further",
  resolve: "Resolved",
  reassign: "Reassigned",
  close: "Closed",
};

export default function EscalationDetailClient({ escalationId }: { escalationId: string }) {
  const [data, setData] = useState<SafetyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<SafetyAction | null>(null);
  const [detail, setDetail] = useState("");
  const [resolution, setResolution] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchEscalation(escalationId);
      setData(response);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, [escalationId]);

  const reload = useCallback(() => {
    setData(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(action: SafetyAction) {
    setBusy(action);
    setNotice(null);
    try {
      await actOnEscalation(escalationId, {
        action,
        detail: detail.trim() || undefined,
        resolution: resolution.trim() || undefined,
      });
      setDetail("");
      setResolution("");
      setNotice(`Saved: ${ACTION_LABEL[action] ?? action}.`);
      await load();
    } catch (err) {
      setNotice(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) {
    return (
      <AdvisorPage>
        <EmptyState
          title="We could not load this escalation"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      </AdvisorPage>
    );
  }
  if (!data) {
    return (
      <AdvisorPage>
        <LoadingState label="Loading escalation" />
      </AdvisorPage>
    );
  }

  const { escalation, events } = data;

  return (
    <AdvisorPage>
      <Link
        href="/portal/clinical_advisor/safety"
        className="mb-2.5 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline dark:text-teal-300 dark:hover:text-teal-100"
      >
        <Icon name="arrowLeft" className="h-3.5 w-3.5" />
        Safety escalations
      </Link>

      <PageTitle
        description={
          <>
            {escalation.riskType} risk · raised{" "}
            <time dateTime={escalation.escalatedAt}>
              {formatDateTime(escalation.escalatedAt)}
            </time>
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Badge tone={priorityTone(escalation.priority)} dot>
              {PRIORITY_LABEL[escalation.priority] ?? escalation.priority}
            </Badge>
            <Badge tone={statusTone(escalation.status)}>
              {escalationStatusLabel(escalation.status)}
            </Badge>
          </div>
        }
      >
        Escalation {escalation.reference}
      </PageTitle>

      {notice ? (
        <div className="mb-5">
          <Alert tone="success" title="Saved">
            {notice}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Panel title="What was raised">
            <DataRow label="Source">{escalation.source}</DataRow>
            <DataRow label="Raised by">{escalation.createdByName ?? "—"}</DataRow>
            <DataRow label="Practitioner">{escalation.therapistName ?? "—"}</DataRow>
            <DataRow label="Client">
              {data.maySeeClients
                ? escalation.clientName ?? escalation.clientAlias ?? "—"
                : "Hidden - your permissions do not include client identity"}
            </DataRow>
            <DataRow label="Observations">{escalation.observations ?? "—"}</DataRow>
            <DataRow label="Recommended action">{escalation.recommendedAction ?? "—"}</DataRow>
            {escalation.resolution ? (
              <DataRow label="Resolution">{escalation.resolution}</DataRow>
            ) : null}
            <DataRow label="Last updated">
              <time dateTime={escalation.updatedAt}>{formatDateTime(escalation.updatedAt)}</time>
            </DataRow>
          </Panel>

          <Panel title="Timeline">
            <ol className="space-y-4">
              {events.map((event) => (
                <li key={event.id} className="border-l-2 border-teal-200 pl-4 dark:border-teal-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {event.action}
                    </p>
                    <span className="text-[11px] text-slate-500 dark:text-slate-500">
                      <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {event.actorName ?? "System"}
                    {event.actorRole ? ` · ${event.actorRole}` : ""}
                    {event.fromStatus && event.toStatus
                      ? ` · ${escalationStatusLabel(event.fromStatus)} → ${escalationStatusLabel(event.toStatus)}`
                      : event.toStatus
                        ? ` → ${escalationStatusLabel(event.toStatus)}`
                        : ""}
                  </p>
                  {event.detail ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {event.detail}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Panel title="Take action">
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Every action writes an event to the timeline and an audit entry against your account.
            </p>
            <Field label="Detail for the record">
              <textarea
                className={textareaClass}
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
                placeholder="What did you check and decide?"
              />
            </Field>
            <Field label="Resolution (for resolve)">
              <textarea
                className={textareaClass}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder="How was it closed out?"
              />
            </Field>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                loading={busy === "acknowledge"}
                disabled={busy !== null}
                onClick={() => void act("acknowledge")}
              >
                {busy === "acknowledge" ? "Saving..." : "Acknowledge"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void act("escalate")}
              >
                Escalate further
              </Button>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void act("resolve")}
              >
                Resolve
              </Button>
            </div>
          </Panel>

          <Panel title="Emergency procedure">
            <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
              {data.emergencyProcedure}
            </p>
            <DataRow label="Response target">{data.responseHours} hours</DataRow>
          </Panel>
        </div>
      </div>
    </AdvisorPage>
  );
}
