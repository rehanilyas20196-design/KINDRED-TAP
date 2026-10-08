import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EscalationDetailClient from "./escalation-detail-client";
import SupervisorConcernDetailClient from "./supervisor-concern-detail-client";

export const metadata: Metadata = {
  title: "Safety concern",
};

export default async function SafetyDetailPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role === "clinical_supervisor") return <SupervisorConcernDetailClient concernId={id} />;
  if (role !== "clinical_advisor") notFound();

  return <EscalationDetailClient escalationId={id} />;
}
