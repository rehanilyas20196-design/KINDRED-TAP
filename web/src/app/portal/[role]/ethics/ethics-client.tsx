"use client";

import { useCallback, useEffect, useState } from "react";
import { AdvisorPage } from "@/components/advisor/shell";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import {
  Field,
  Panel,
  ProgressBar,
  StatTile,
  inputClass,
  textareaClass,
} from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  acknowledgeGuideline,
  createGuideline,
  fetchEthics,
  fetchGuidelineAcknowledgments,
  formatDay,
  updateGuideline,
  type EthicsAcknowledgments,
  type EthicsGuideline,
  type EthicsList,
} from "@/lib/advisor";

const ROLE_OPTIONS = [
  { value: "user", label: "Clients" },
  { value: "supporter", label: "Supporters" },
  { value: "therapist", label: "Therapists" },
  { value: "clinical_advisor", label: "Advisors" },
  { value: "clinical_supervisor", label: "Supervisors" },
  { value: "collaborative_clinic", label: "Partner clinics" },
];

type BusyAction = "create" | "acknowledge" | "tracking" | "version";

function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function EthicsClient() {
  const [data, setData] = useState<EthicsList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ action: BusyAction; id?: string } | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(
    null
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acks, setAcks] = useState<EthicsAcknowledgments | null>(null);

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0");
  const [applicableRoles, setApplicableRoles] = useState<string[]>(["therapist"]);
  const [nextReviewAt, setNextReviewAt] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await fetchEthics());
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  function toggleRole(value: string) {
    setApplicableRoles((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy({ action: "create" });
    setNotice(null);
    try {
      await createGuideline({
        title: title.trim(),
        description: description.trim(),
        version: version.trim() || "1.0",
        applicableRoles: applicableRoles.length ? applicableRoles : ["therapist"],
        nextReviewAt: nextReviewAt || null,
      });
      setTitle("");
      setDescription("");
      setCreating(false);
      setNotice({ tone: "success", message: "Guideline created." });
      await load();
    } catch (err) {
      setNotice({ tone: "danger", message: messageFor(err) });
    } finally {
      setBusy(null);
    }
  }

  async function acknowledge(guideline: EthicsGuideline) {
    setBusy({ action: "acknowledge", id: guideline.id });
    setNotice(null);
    try {
      const result = await acknowledgeGuideline(guideline.id);
      setNotice({
        tone: "success",
        message: `Acknowledged ${guideline.title} (v${result.version}).`,
      });
      await load();
    } catch (err) {
      setNotice({ tone: "danger", message: messageFor(err) });
    } finally {
      setBusy(null);
    }
  }

  async function bumpVersion(guideline: EthicsGuideline) {
    const next = window.prompt("New version number", guideline.version);
    if (!next || next === guideline.version) return;
    setBusy({ action: "version", id: guideline.id });
    setNotice(null);
    try {
      await updateGuideline(guideline.id, { version: next.trim() });
      setNotice({
        tone: "success",
        message: `${guideline.title} is now v${next.trim()}; acknowledgment re-opened.`,
      });
      await load();
    } catch (err) {
      setNotice({ tone: "danger", message: messageFor(err) });
    } finally {
      setBusy(null);
    }
  }

  async function openAcknowledgments(guideline: EthicsGuideline) {
    if (expanded === guideline.id) {
      setExpanded(null);
      setAcks(null);
      return;
    }
    setBusy({ action: "tracking", id: guideline.id });
    try {
      const response = await fetchGuidelineAcknowledgments(guideline.id);
      setAcks(response);
      setExpanded(guideline.id);
    } catch (err) {
      setNotice({ tone: "danger", message: messageFor(err) });
    } finally {
      setBusy(null);
    }
  }

  const statTiles = data
    ? [
        { label: "Guidelines", value: data.total },
        { label: "Needs attention", value: data.needsAttention, hint: "Pending or overdue" },
        {
          label: "Your acknowledgments",
          value: (data.guidelines ?? []).filter((item) => item.iHaveAcknowledged).length,
          hint: "Out of all guidelines",
        },
      ].filter((tile) => tile.value > 0)
    : [];

  return (
    <AdvisorPage>
      <PageTitle
        eyebrow="Clinical oversight"
        description="The clinic's code of conduct and guidelines: who must acknowledge which version, what is overdue and when each document is next reviewed."
        action={
          <Button
            size="sm"
            variant={creating ? "secondary" : "primary"}
            aria-expanded={creating}
            aria-controls="guideline-create"
            onClick={() => setCreating((prev) => !prev)}
          >
            {creating ? "Close" : "New guideline"}
          </Button>
        }
      >
        Ethics
      </PageTitle>

      {notice ? (
        <div className="mb-5">
          <Alert tone={notice.tone}>{notice.message}</Alert>
        </div>
      ) : null}

      {data ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {statTiles.map((tile) => (
            <StatTile key={tile.label} label={tile.label} value={tile.value} hint={tile.hint} />
          ))}
          <StatTile label="Acknowledgment cycle" value={`${data.intervalDays}d`} />
        </div>
      ) : null}

      <div id="guideline-create" className={creating ? "mb-6" : undefined}>
        {creating ? (
          <Panel title="Create a guideline">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" className="sm:col-span-2">
                <input
                  className={inputClass}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Duty of care"
                  required
                  minLength={3}
                />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <textarea
                  className={textareaClass}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What the guideline requires."
                />
              </Field>
              <Field label="Version">
                <input
                  className={inputClass}
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                />
              </Field>
              <Field label="Next review date">
                <input
                  type="date"
                  className={inputClass}
                  value={nextReviewAt}
                  onChange={(event) => setNextReviewAt(event.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <p id="guideline-roles" className="field-label">
                  Who must acknowledge it
                </p>
                <div
                  role="group"
                  aria-labelledby="guideline-roles"
                  className="flex flex-wrap gap-2"
                >
                  {ROLE_OPTIONS.map((option) => {
                    const selected = applicableRoles.includes(option.value);
                    return (
                      <Button
                        key={option.value}
                        size="sm"
                        variant={selected ? "primary" : "secondary"}
                        aria-pressed={selected}
                        onClick={() => toggleRole(option.value)}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-end gap-3 sm:col-span-2">
                <Button type="submit" loading={busy?.action === "create"}>
                  Create guideline
                </Button>
                <Button variant="secondary" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Panel>
        ) : null}
      </div>

      {error && data !== null ? (
        <div className="mb-5">
          <Alert tone="warning" title="We could not refresh the guidelines">
            {error}
          </Alert>
        </div>
      ) : null}

      {error && data === null ? (
        <EmptyState
          title="We could not load the ethics guidelines"
          description={error}
            action={
              <Button
                onClick={() => {
                  setError(null);
                  void load();
                }}
              >
                Try again
              </Button>
            }
        />
      ) : data === null ? (
        <LoadingState label="Loading ethics" />
      ) : data.guidelines.length === 0 ? (
        <EmptyState
          title="No guidelines yet"
          description="Create the clinic's code of conduct and the roles that must acknowledge it."
          action={
            <Button variant="secondary" onClick={() => setCreating(true)}>
              New guideline
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {data.guidelines.map((guideline) => {
            const total = guideline.acknowledgedCount + guideline.pendingCount;
            const rate = total ? Math.round((guideline.acknowledgedCount / total) * 100) : 0;
            const busyForGuideline = busy !== null && busy.id === guideline.id ? busy : null;
            const busyAction = busyForGuideline?.action ?? null;
            const guidelineBusy = busyForGuideline !== null;
            const trackingId = `guideline-acks-${guideline.id}`;
            return (
              <li key={guideline.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {guideline.title}
                      </p>
                      <Badge
                        tone={guideline.status === "active" ? "accent" : "neutral"}
                      >{`v${guideline.version} · ${humanize(guideline.status)}`}</Badge>
                      {guideline.reviewDue ? (
                        <Badge tone="warning" dot>
                          Review due
                        </Badge>
                      ) : null}
                      {guideline.iHaveAcknowledged ? (
                        <Badge tone="success">You acknowledged</Badge>
                      ) : (
                        <Badge tone="warning">You have not acknowledged</Badge>
                      )}
                    </div>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {guideline.description || "No description."}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                      {guideline.category ? humanize(guideline.category) : "—"} · applies to{" "}
                      {guideline.applicableRoles
                        .map(
                          (role) =>
                            ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role
                        )
                        .join(", ") || "—"}{" "}
                      · next review{" "}
                      <time dateTime={guideline.nextReviewAt ?? undefined}>
                        {formatDay(guideline.nextReviewAt)}
                      </time>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyAction === "acknowledge"}
                      disabled={guidelineBusy || guideline.iHaveAcknowledged}
                      onClick={() => void acknowledge(guideline)}
                    >
                      {guideline.iHaveAcknowledged ? "Acknowledged" : "Acknowledge"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyAction === "tracking"}
                      disabled={guidelineBusy}
                      aria-expanded={expanded === guideline.id}
                      aria-controls={trackingId}
                      onClick={() => void openAcknowledgments(guideline)}
                    >
                      {expanded === guideline.id ? "Hide tracking" : "Tracking"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyAction === "version"}
                      disabled={guidelineBusy}
                      onClick={() => void bumpVersion(guideline)}
                    >
                      New version
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Acknowledged
                    </p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {guideline.acknowledgedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Pending
                    </p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {guideline.pendingCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Overdue
                    </p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {guideline.overdueCount}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <ProgressBar percent={rate} tone={rate === 100 ? "emerald" : "amber"} />
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                    {rate}% of required practitioners have acknowledged v{guideline.version}
                  </p>
                </div>

                <div
                  id={trackingId}
                  className={
                    expanded === guideline.id && acks
                      ? "mt-4 border-t border-slate-100 pt-4 dark:border-slate-800"
                      : undefined
                  }
                >
                  {expanded === guideline.id && acks ? (
                    <>
                      <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Who has and who has not
                      </p>
                      <ul className="space-y-2">
                        {acks.practitioners.map((person) => (
                          <li
                            key={person.id}
                            className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300"
                          >
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {person.fullName}
                            </span>
                            <span className="text-slate-500">{humanize(person.role)}</span>
                            <Badge
                              tone={
                                person.status === "acknowledged"
                                  ? "success"
                                  : person.status === "overdue"
                                    ? "danger"
                                    : "warning"
                              }
                              dot
                            >
                              {humanize(person.status)}
                            </Badge>
                            {person.acknowledgedAt ? (
                              <span className="text-slate-500">
                                v{person.acknowledgedVersion} ·{" "}
                                <time dateTime={person.acknowledgedAt}>
                                  {formatDay(person.acknowledgedAt)}
                                </time>
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdvisorPage>
  );
}
