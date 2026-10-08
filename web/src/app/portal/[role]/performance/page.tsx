import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorPerformanceClient from "./supervisor-performance-client";

export const metadata: Metadata = {
  title: "Performance",
};

export default async function PerformancePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorPerformanceClient />;
}
