import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppointmentsClient from "./appointments-client";
import { AppointmentsClient as ClinicAppointmentsClient } from "@/components/clinic/workspace";

export const metadata: Metadata = {
  title: "Appointments",
};

export default async function AppointmentsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role === "collaborative_clinic") return <ClinicAppointmentsClient />;
  if (role !== "clinical_advisor") notFound();

  return <AppointmentsClient />;
}
