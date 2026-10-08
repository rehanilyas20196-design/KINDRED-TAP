import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorEscalationsClient from "./supervisor-escalations-client";

export const metadata: Metadata = {
  title: "Escalations",
};

export default async function EscalationsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorEscalationsClient />;
}
