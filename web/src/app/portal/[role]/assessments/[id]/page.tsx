import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AssessmentDetailClient from "./assessment-detail-client";
import AdvisorAssessmentDetailClient from "./advisor-assessment-detail-client";

export const metadata: Metadata = {
  title: "Assessment result",
};

export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role === "clinical_advisor") return <AdvisorAssessmentDetailClient assessmentId={id} />;
  if (role !== "therapist") notFound();

  return <AssessmentDetailClient assessmentId={id} />;
}
