import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorInterventionDetailClient from "./supervisor-intervention-detail-client";

export const metadata: Metadata = {
  title: "Intervention",
};

export default async function InterventionDetailPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorInterventionDetailClient interventionId={id} />;
}
