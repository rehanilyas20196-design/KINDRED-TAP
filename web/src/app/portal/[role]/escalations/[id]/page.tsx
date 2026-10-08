import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorEscalationDetailClient from "./supervisor-escalation-detail-client";

export const metadata: Metadata = {
  title: "Escalation",
};

export default async function EscalationDetailPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorEscalationDetailClient escalationId={id} />;
}
