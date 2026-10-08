import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorCaseReviewsClient from "./supervisor-case-reviews-client";

export const metadata: Metadata = {
  title: "Case Reviews",
};

export default async function CaseReviewsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorCaseReviewsClient />;
}
