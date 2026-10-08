"use client";

import { useCallback, useEffect, useState } from "react";
import { SupervisorPage } from "@/components/supervisor/shell";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageTitle,
  ProgressBar,
  SectionTitle,
  type Tone,
} from "@/components/ui";
import { Field, SegmentedControl, inputClass, textareaClass } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  fetchClinicalOversight,
  fetchEthicalOversight,
  formatDateTime,
  recordClinicalOversight,
  recordEthicalOversight,
  statusLabel,
  statusTone,
  type ClinicalOversight,
  type EthicalOversight,
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

type Tab = "clinical" | "ethical";

export default function SupervisorOversightClient() {
  const [tab, setTab] = useState<Tab>("clinical");

  return (
    <SupervisorPage>
      <PageTitle description="Monitor whether the team is following established clinical and ethical procedures. The indicator is a signal; your recorded status is the human decision.">
        Clinical &amp; Ethical Oversight
      </PageTitle>
      <div className="mt-5">
        <SegmentedControl
          options={[
            { value: "clinical", label: "Clinical oversight" },
            { value: "ethical", label: "Ethical oversight" },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="Oversight area"
        />
      </div>
      <div className="mt-5">{tab === "clinical" ? <ClinicalPanel /> : <EthicalPanel />}</div>
    </SupervisorPage>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <div className="card p-4">
      <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

function ClinicalPanel() {
  const [data, setData] = useState<ClinicalOversight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchClinicalOversight());
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (error) {
    return (
      <EmptyState
        title="We could not load clinical oversight"
        description={error}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }
  if (loading || !data) return <LoadingState label="Loading clinical oversight" />;

  const compliant = data.areas.filter((a) => a.status === "compliant").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Areas" value={data.areas.length} />
        <StatTile label="Compliant" value={compliant} />
        <StatTile label="Needs review" value={data.areas.filter((a) => a.status === "needs_review").length} />
        <StatTile label="Action required" value={data.areas.filter((a) => a.status === "action_required" || a.status === "escalated").length} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {data.areas.map((area) => (
          <Card key={area.key}>
            <SectionTitle detail={<Badge tone={uiTone(statusTone(area.status))}>{statusLabel(area.status)}</Badge>}>
              {area.label}
            </SectionTitle>
            <p className="mt-2 text-xs text-slate-500">{area.description}</p>
            {area.indicator ? (
              <div className="mt-3">
                <p className="text-2xl font-semibold text-slate-900">
                  {area.indicator.value ?? "-"}
                  {area.indicator.value !== null ? area.indicator.unit : ""}
                </p>
                <ProgressBar
                  value={area.indicator.value ?? 0}
                  total={100}
                  label={`${area.label} indicator`}
                />
                <p className="mt-1 text-[11px] text-slate-500">{area.indicator.detail}</p>
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-slate-500">
                No computed indicator for this area; record the status manually.
              </p>
            )}
            {area.note ? <p className="mt-2 text-xs text-slate-500">Recorded: {area.note}</p> : null}
            {data.canManage ? (
              <AreaRecorder
                areaKey={area.key}
                onRecord={async (status, note) => {
                  await recordClinicalOversight(area.key, { status, note });
                  await load();
                }}
              />
            ) : null}
          </Card>
        ))}
      </div>

      <Card>
        <SectionTitle>Active clinical standards</SectionTitle>
        {data.policies.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No standards" description="No active clinical standards are recorded." />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {data.policies.map((policy) => (
              <li key={policy.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-slate-700">{policy.title}</span>
                <span className="text-[11px] text-slate-500">
                  v{policy.version} · next review{" "}
                  {policy.nextReviewAt ? <time dateTime={policy.nextReviewAt}>{formatDateTime(policy.nextReviewAt)}</time> : "-"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function EthicalPanel() {
  const [data, setData] = useState<EthicalOversight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchEthicalOversight());
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (error) {
    return (
      <EmptyState
        title="We could not load ethical oversight"
        description={error}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }
  if (loading || !data) return <LoadingState label="Loading ethical oversight" />;

  const open = data.areas.reduce((sum, a) => sum + a.open, 0);
  const resolved = data.areas.reduce((sum, a) => sum + a.resolved, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Open ethical concerns" value={open} />
        <StatTile label="Resolved" value={resolved} />
        <StatTile label="Areas monitored" value={data.areas.length} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {data.areas.map((area) => (
          <Card key={area.key}>
            <SectionTitle detail={<Badge tone={uiTone(statusTone(area.status))}>{statusLabel(area.status)}</Badge>}>
              {area.label}
            </SectionTitle>
            <p className="mt-2 text-xs text-slate-500">
              {area.open} open · {area.resolved}/{area.total} resolved
            </p>
            {area.note ? <p className="mt-2 text-xs text-slate-500">Recorded: {area.note}</p> : null}
            {data.canManage ? (
              <AreaRecorder
                areaKey={area.key}
                onRecord={async (status, note) => {
                  await recordEthicalOversight(area.key, { status, note });
                  await load();
                }}
              />
            ) : null}
          </Card>
        ))}
      </div>

      <Card>
        <SectionTitle>Ethical guidelines</SectionTitle>
        {data.guidelines.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No guidelines" description="No active ethical guidelines are recorded." />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {data.guidelines.map((guideline) => (
              <li key={guideline.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-slate-700">{guideline.title}</span>
                <span className="text-[11px] text-slate-500">
                  v{guideline.version} · {guideline.acknowledged}/{guideline.practitioners} acknowledged
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AreaRecorder({
  areaKey,
  onRecord,
}: {
  areaKey: string;
  onRecord: (status: string, note: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("compliant");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelId = `oversight-record-${areaKey}`;

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="mt-3"
        aria-expanded={false}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
      >
        Record status
      </Button>
    );
  }

  return (
    <div id={panelId} className="mt-3 border-t border-slate-100 pt-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          onRecord(status, note || null)
            .then(() => {
              setOpen(false);
              setNote("");
            })
            .catch((err) => setError(messageFor(err)))
            .finally(() => setBusy(false));
        }}
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="mt-3">
          <Field label="Recorded status">
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="compliant">Compliant</option>
              <option value="needs_review">Needs review</option>
              <option value="action_required">Action required</option>
              <option value="escalated">Escalated</option>
            </select>
          </Field>
        </div>
        <div className="mt-2">
          <Field label="Note (optional)">
            <textarea className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 flex gap-2">
          <Button type="submit" size="sm" loading={busy}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
