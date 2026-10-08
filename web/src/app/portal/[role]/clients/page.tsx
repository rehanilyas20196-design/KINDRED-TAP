import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ClientsClient from "./clients-client";
import AdvisorClientsClient from "./advisor-clients-client";
import SupervisorClientsClient from "./supervisor-clients-client";
import { ClientsClient as ClinicClientsClient } from "@/components/clinic/services";

export const metadata: Metadata = {
  title: "Clients",
};

/**
 * The caseload is a shared URL between the therapist and advisor portals;
 * each role renders its own view of it and the API decides what that view is
 * allowed to see.
 */
export default async function ClientsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role === "collaborative_clinic") return <ClinicClientsClient />;
  if (role === "clinical_advisor") return <AdvisorClientsClient />;
  if (role === "clinical_supervisor") return <SupervisorClientsClient />;
  if (role !== "therapist") notFound();

  return <ClientsClient />;
}
