import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisionDetailClient from "./supervision-detail-client";
import SupervisorSupervisionDetailClient from "./supervisor-supervision-detail-client";

export const metadata: Metadata = {
  title: "Supervision record",
};

/**
 * The param is a therapist id for the advisor (their supervision history) and
 * a supervision record id for the clinic supervisor (one session).
 */
export default async function SupervisionDetailPage({
  params,
}: {
  params: Promise<{ role: string; therapistId: string }>;
}) {
  const { role, therapistId } = await params;
  if (role === "clinical_supervisor") return <SupervisorSupervisionDetailClient recordId={therapistId} />;
  if (role !== "clinical_advisor") notFound();

  return <SupervisionDetailClient therapistId={therapistId} />;
}
