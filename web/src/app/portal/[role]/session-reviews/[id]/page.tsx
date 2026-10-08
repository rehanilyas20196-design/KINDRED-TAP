import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorSessionReviewDetailClient from "./supervisor-session-review-detail-client";

export const metadata: Metadata = {
  title: "Session review",
};

export default async function SessionReviewDetailPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorSessionReviewDetailClient reviewId={id} />;
}
