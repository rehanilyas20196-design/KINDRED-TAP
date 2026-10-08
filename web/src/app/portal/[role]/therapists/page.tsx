import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TherapistsClient from "./therapists-client";

export const metadata: Metadata = {
  title: "Therapists",
};

export default async function TherapistsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_advisor") notFound();

  return <TherapistsClient />;
}
