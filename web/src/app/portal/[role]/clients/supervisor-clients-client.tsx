"use client";

import { useCallback, useEffect, useState } from "react";
import { SupervisorPage } from "@/components/supervisor/shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageTitle,
  SectionTitle,
  type Tone,
} from "@/components/ui";
import { SegmentedControl, inputClass } from "@/components/therapist/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import { fetchClients, formatDay, statusLabel, statusTone, type ClientOverviewRow } from "@/lib/supervisor";

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

export default function SupervisorClientsClient() {
  const [clients, setClients] = useState<ClientOverviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [attention, setAttention] = useState<"all" | "attention">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchClients({ q, attention: attention === "attention" });
      setClients(result.clients);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, [q, attention]);

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
      <PageTitle description="Only the information supervision responsibilities need. Minimum necessary access applies to every record.">
        Clients
      </PageTitle>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SegmentedControl
          options={[{ value: "all", label: "All" }, { value: "attention", label: "Needs attention" }]}
          value={attention}
          onChange={setAttention}
          ariaLabel="Filter clients"
        />
        <div className="relative w-full sm:min-w-56 sm:flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            aria-label="Search clients"
            placeholder="Search by name"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load clients"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading clients" />
        ) : !clients || clients.length === 0 ? (
          <EmptyState title="No clients" description="No clients match this view." />
        ) : (
          <Card>
            <SectionTitle detail={`${clients.length} total`}>Clients</SectionTitle>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <caption className="sr-only">Client overview for supervision</caption>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th scope="col" className="py-2 pr-3">Client</th>
                    <th scope="col" className="py-2 pr-3">Assigned therapist</th>
                    <th scope="col" className="py-2 pr-3">Therapy status</th>
                    <th scope="col" className="py-2 pr-3">Treatment plan</th>
                    <th scope="col" className="py-2 pr-3">Assessment</th>
                    <th scope="col" className="py-2 pr-3">Next appointment</th>
                    <th scope="col" className="py-2 pr-3">Reviews</th>
                    <th scope="col" className="py-2 pr-3">Escalations</th>
                    <th scope="col" className="py-2 pr-3">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clients.map((client) => (
                    <tr key={client.id} className="align-top">
                      <td className="py-3 pr-3 font-medium text-slate-700">{client.clientName ?? "Client"}</td>
                      <td className="py-3 pr-3 text-slate-600">{client.assignedTherapist ?? "Unassigned"}</td>
                      <td className="py-3 pr-3"><Badge tone={uiTone(statusTone(client.therapyStatus))}>{statusLabel(client.therapyStatus)}</Badge></td>
                      <td className="py-3 pr-3"><Badge tone={uiTone(statusTone(client.planStatus))}>{statusLabel(client.planStatus)}</Badge></td>
                      <td className="py-3 pr-3"><Badge tone={uiTone(statusTone(client.assessmentStatus))}>{statusLabel(client.assessmentStatus)}</Badge></td>
                      <td className="py-3 pr-3 text-slate-600">
                        {client.nextAppointment ? <time dateTime={client.nextAppointment}>{formatDay(client.nextAppointment)}</time> : "-"}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{client.openCaseReviews}</td>
                      <td className="py-3 pr-3 text-slate-600">{client.openEscalations}</td>
                      <td className="py-3 pr-3 text-slate-600">{client.progressPercent !== null ? `${client.progressPercent}%` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </SupervisorPage>
  );
}
