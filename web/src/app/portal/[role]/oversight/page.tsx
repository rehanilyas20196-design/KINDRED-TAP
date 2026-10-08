import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorOversightClient from "./supervisor-oversight-client";

export const metadata: Metadata = {
  title: "Clinical & Ethical Oversight",
};

export default async function OversightPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorOversightClient />;
}
