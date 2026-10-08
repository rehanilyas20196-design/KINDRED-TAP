import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OutcomesClient from "./outcomes-client";

export const metadata: Metadata = {
  title: "Outcomes",
};

export default async function OutcomesPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_advisor") notFound();

  return <OutcomesClient />;
}
