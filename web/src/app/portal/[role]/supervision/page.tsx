import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisionClient from "./supervision-client";
import SupervisorSupervisionClient from "./supervisor-supervision-client";

export const metadata: Metadata = {
  title: "Supervision",
};

/** Supervision is a shared URL: the advisor supervises practitioners, the
 * clinic supervisor runs day-to-day supervision. Each role gets its own view. */
export default async function SupervisionPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role === "clinical_supervisor") return <SupervisorSupervisionClient />;
  if (role !== "clinical_advisor") notFound();

  return <SupervisionClient />;
}
