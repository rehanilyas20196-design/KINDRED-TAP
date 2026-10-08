import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorInterventionsClient from "./supervisor-interventions-client";

export const metadata: Metadata = {
  title: "Interventions",
};

export default async function InterventionsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorInterventionsClient />;
}
