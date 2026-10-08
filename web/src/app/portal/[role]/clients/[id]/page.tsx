import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ClientProfileClient from "./client-profile-client";
import AdvisorClientProfileClient from "./advisor-client-profile-client";
import { ClientProfileClient as ClinicClientProfileClient } from "@/components/clinic/send-referral";

export const metadata: Metadata = {
  title: "Client profile",
};

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role === "collaborative_clinic") return <ClinicClientProfileClient clientId={id} />;
  if (role === "clinical_advisor") return <AdvisorClientProfileClient clientId={id} />;
  if (role !== "therapist") notFound();

  return <ClientProfileClient clientId={id} />;
}
