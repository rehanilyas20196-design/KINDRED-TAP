import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MatchRequestDetailClient from "./request-detail-client";

export const metadata: Metadata = {
  title: "Matching decision",
};

export default async function MatchRequestPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role !== "clinical_advisor") notFound();

  return <MatchRequestDetailClient requestId={id} />;
}
