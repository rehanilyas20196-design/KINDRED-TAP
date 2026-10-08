import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AssessmentsClient from "./assessments-client";
import AdvisorAssessmentsClient from "./advisor-assessments-client";

export const metadata: Metadata = {
  title: "Assessments",
};

export default async function AssessmentsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role === "clinical_advisor") return <AdvisorAssessmentsClient />;
  if (role !== "therapist") notFound();

  return (
    <Suspense fallback={null}>
      <AssessmentsClient />
    </Suspense>
  );
}
