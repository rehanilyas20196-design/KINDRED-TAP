import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReportsClient from "./reports-client";
import SupervisorReportsClient from "./supervisor-reports-client";
import { ReportsClient as ClinicReportsClient } from "@/components/clinic/workspace";

export const metadata: Metadata = {
  title: "Reports",
};

export default async function ReportsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role === "collaborative_clinic") return <ClinicReportsClient />;
  if (role === "clinical_supervisor") return <SupervisorReportsClient />;
  if (role !== "clinical_advisor") notFound();

  return <ReportsClient />;
}
