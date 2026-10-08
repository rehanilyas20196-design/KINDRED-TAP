import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorCaseReviewDetailClient from "./supervisor-case-review-detail-client";

export const metadata: Metadata = {
  title: "Case review",
};

export default async function CaseReviewDetailPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorCaseReviewDetailClient reviewId={id} />;
}
