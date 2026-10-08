import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StandardsClient from "./standards-client";

export const metadata: Metadata = {
  title: "Clinical standards",
};

/** Role is asserted here; the client component re-checks it against the API. */
export default async function ClinicalStandardsPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (role !== "clinical_advisor") notFound();

  return <StandardsClient />;
}
