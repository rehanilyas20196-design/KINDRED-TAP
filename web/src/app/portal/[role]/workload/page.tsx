import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorWorkloadClient from "./supervisor-workload-client";

export const metadata: Metadata = {
  title: "Workload",
};

export default async function WorkloadPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorWorkloadClient />;
}
