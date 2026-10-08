import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AnalyticsClient from "./analytics-client";

export const metadata: Metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_advisor") notFound();

  return <AnalyticsClient />;
}
