import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorSessionReviewsClient from "./supervisor-session-reviews-client";

export const metadata: Metadata = {
  title: "Session Reviews",
};

export default async function SessionReviewsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorSessionReviewsClient />;
}
