"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClinicPage } from "@/components/clinic/shell";
import {
  EmptyState,
  ErrorPanel,
  Field,
  LoadingBlock,
  Notice,
  PageHeader,
  Panel,
  StatusPill,
  inputClass,
  primaryActionClass,
  secondaryActionClass,
  textareaClass,
} from "@/components/clinic/ui";
import { messageFor, toFieldErrors } from "@/lib/api";
import {
  fetchClients,
  fetchReferralLinks,
  fetchServices,
  formatDay,
  sendReferral,
  type ClientRow,
  type ReferralLink,
  type ServiceRow,
} from "@/lib/clinic";

/**
 * Sends a referral into Kindred Tap.
 *
 * The client list is the partnership's own tracked clients, fetched from
 * `/api/clinic/clients`, so there is no free-text person field anywhere on this
 * form: a referral can only be attached to somebody the API has already
 * established a relationship with. That is the privacy control doing the work -
 * the form simply offers no way around it.
 */
export function SendReferralClient({
  onCancel,
  onSent,
}: {
  onCancel: () => void;
  onSent: () => void;
}) {
  const router = useRouter();

  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [links, setLinks] = useState<ReferralLink[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState("");
  const [clientUserId, setClientUserId] = useState("");
  const [reason, setReason] = useState("");
  const [relevantInformation, setRelevantInformation] = useState("");
  const [priority, setPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [professionalName, setProfessionalName] = useState("");
  const [referralLinkId, setReferralLinkId] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [serviceData, clientData, linkData] = await Promise.all([
        fetchServices(),
        fetchClients({ view: "all", limit: 100 }),
        fetchReferralLinks(),
      ]);
      setServices(serviceData.services);
      setClients(clientData.clients);
      setLinks(linkData.links);
    } catch (err) {
      setLoadError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const selectedService = useMemo(
    () => services?.find((service) => service.id === serviceId) ?? null,
    [services, serviceId]
  );

  const eligibleClients = useMemo(
    () => clients ?? [],
    [clients]
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await sendReferral({
        serviceId,
        clientUserId,
        reason,
        relevantInformation: relevantInformation || null,
        priority,
        professionalName: professionalName || null,
        referralLinkId: referralLinkId || null,
      });
      onSent();
      router.push(`/portal/collaborative-clinic/referrals/${response.referral.id}`);
    } catch (err) {
      setError(messageFor(err));
      setFieldErrors(toFieldErrors(err));
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <ClinicPage>
        <PageHeader title="Send Referral" back={{ href: "/portal/collaborative-clinic/referrals/sent", label: "Sent referrals" }} />
        <ErrorPanel message={loadError} onRetry={load} />
      </ClinicPage>
    );
  }

  if (!services || !clients || !links) {
    return (
      <ClinicPage>
        <PageHeader title="Send Referral" />
        <LoadingBlock label="Loading services and clients..." />
      </ClinicPage>
    );
  }

  return (
    <ClinicPage>
      <PageHeader
        title="Send Referral"
        description="Refer a client into Kindred Tap services. You can only refer a client already connected to your organization."
        back={{ href: "/portal/collaborative-clinic/referrals/sent", label: "Sent referrals" }}
      />

      <form onSubmit={submit} noValidate>
        <div className="space-y-6">
          {error ? <Notice tone="rose">{error}</Notice> : null}

          <Panel title="Referral">
            <div className="space-y-4">
              <Field
                label="Client"
                error={fieldErrors.clientUserId}
                hint="Only clients connected to your organization are listed."
              >
                <select
                  value={clientUserId}
                  onChange={(event) => setClientUserId(event.target.value)}
                  required
                  aria-describedby="client-hint"
                  className={inputClass}
                >
                  <option value="">Select an authorized client</option>
                  {eligibleClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.clientReference} &middot; {client.serviceName}
                    </option>
                  ))}
                </select>
              </Field>

              {eligibleClients.length === 0 ? (
                <EmptyState
                  title="No clients to refer yet"
                  body="Clients appear here once your organization has a referral involving them. Send your first referral from a received referral to get started."
                />
              ) : null}

              <Field label="Service" error={fieldErrors.serviceId}>
                <select
                  value={serviceId}
                  onChange={(event) => setServiceId(event.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="">Select a Kindred Tap service</option>
                  {services
                    .filter((service) => service.availability !== "unavailable")
                    .map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} &middot; {service.availability}
                      </option>
                    ))}
                </select>
              </Field>

              {selectedService ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    {selectedService.name}
                  </p>
                  {selectedService.eligibility ? <p>{selectedService.eligibility}</p> : null}
                  <p className="mt-1">
                    Referral method: {selectedService.referralMethod} &middot; Partner commission:{" "}
                    {selectedService.commissionRule === "percentage"
                      ? `${selectedService.commissionRateBp / 100}%`
                      : `${(selectedService.commissionFixedMinor / 100).toFixed(2)} ${selectedService.priceCurrency}`}
                  </p>
                </div>
              ) : null}

              <Field label="Reason for referral" error={fieldErrors.reason}>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  maxLength={2000}
                  rows={3}
                  placeholder="What does this client need, and why now?"
                  className={textareaClass}
                />
              </Field>

              <Field
                label="Relevant information"
                hint="Only what Kindred Tap needs to triage. Do not paste clinical notes."
                error={fieldErrors.relevantInformation}
              >
                <textarea
                  value={relevantInformation}
                  onChange={(event) => setRelevantInformation(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  className={textareaClass}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Priority" error={fieldErrors.priority}>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as "normal" | "high" | "urgent")}
                    className={inputClass}
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </Field>

                <Field
                  label="Referring professional"
                  hint="Optional. Who in your clinic is making this referral."
                >
                  <input
                    type="text"
                    value={professionalName}
                    onChange={(event) => setProfessionalName(event.target.value)}
                    maxLength={160}
                    className={inputClass}
                  />
                </Field>
              </div>

              {links.length > 0 ? (
                <Field
                  label="Attribution link"
                  hint="Optional. Ties this referral to one of your referral links so conversion and commission report correctly."
                >
                  <select
                    value={referralLinkId}
                    onChange={(event) => setReferralLinkId(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">No referral link</option>
                    {links
                      .filter((link) => !serviceId || link.serviceId === serviceId)
                      .map((link) => (
                        <option key={link.id} value={link.id}>
                          {link.serviceName}
                          {link.campaign ? ` &middot; ${link.campaign}` : ""}
                        </option>
                      ))}
                  </select>
                </Field>
              ) : null}
            </div>
          </Panel>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button type="button" onClick={onCancel} className={secondaryActionClass}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !serviceId || !clientUserId || reason.trim().length < 5}
              className={primaryActionClass}
            >
              {saving ? "Sending..." : "Send referral"}
            </button>
          </div>

          <Notice tone="amber">
            This form is for referral triage only. Clinical records, therapy notes and personal
            identifiers stay inside Kindred Tap.
          </Notice>
        </div>
      </form>
    </ClinicPage>
  );
}

/**
 * Partnership-focused profile for one tracked client. Shows referrals,
 * appointments and the referral timeline - deliberately no clinical notes, and
 * the copy says so explicitly so a partner knows the absence is intentional.
 */
export function ClientProfileClient({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof import("@/lib/clinic").fetchClient>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { fetchClient } = await import("@/lib/clinic");
      setData(await fetchClient(clientId));
    } catch (err) {
      setError(messageFor(err));
    }
  }, [clientId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <ClinicPage>
      <PageHeader
        title={data?.client.clientReference ?? "Client"}
        description="Referral and partnership activity for this client."
        back={{ href: "/portal/collaborative-clinic/clients", label: "Clients" }}
      />

      {error ? <ErrorPanel message={error} onRetry={load} /> : null}
      {!error && !data ? <LoadingBlock label="Loading client..." /> : null}

      {data ? (
        <div className="space-y-6">
          <Panel title="Summary">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <SummaryItem label="Client ID" value={data.client.clientReference} />
              <SummaryItem label="Referrals" value={String(data.client.referralCount)} />
              <SummaryItem label="Appointments" value={String(data.appointments.length)} />
            </dl>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Services: {data.client.services.join(", ") || "None recorded"}
            </p>
          </Panel>

          <Panel title="Referrals">
            {data.referrals.length === 0 ? (
              <EmptyState title="No referrals" body="No referrals are recorded for this client." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.referrals.map((referral) => (
                  <li key={referral.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {referral.reference} &middot; {referral.serviceName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {referral.partnerOrganization} &middot; {formatDay(referral.referralDate)}
                        {referral.assignedProfessional
                          ? ` · ${referral.assignedProfessional}`
                          : ""}
                      </p>
                    </div>
                    <StatusPill status={referral.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Appointments">
            {data.appointments.length === 0 ? (
              <EmptyState title="No appointments" body="No appointments have been scheduled for this client." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.appointments.map((appointment) => (
                  <li key={appointment.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {appointment.serviceName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {formatDay(appointment.scheduledAt)}
                        {appointment.professionalName ? ` · ${appointment.professionalName}` : ""}
                      </p>
                    </div>
                    <StatusPill status={appointment.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Referral Timeline">
            {data.timeline.length === 0 ? (
              <EmptyState title="No activity" body="Nothing has happened on these referrals yet." />
            ) : (
              <ol className="space-y-3">
                {data.timeline.map((event) => (
                  <li key={event.id} className="border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {event.reference} &middot; {event.action.replace(/[._]/g, " ")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDay(event.createdAt)}
                      {event.actorName ? ` · ${event.actorName}` : ""}
                    </p>
                    {event.detail ? (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{event.detail}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Notice>
            This is a partnership profile. It shows referral and appointment information only -
            private clinical notes and assessments are not shared with partner clinics.
          </Notice>
        </div>
      ) : null}
    </ClinicPage>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}