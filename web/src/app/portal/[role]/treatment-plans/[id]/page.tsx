import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlanDetailClient from "./plan-detail-client";

export const metadata: Metadata = {
  title: "Treatment plan",
};

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role !== "therapist") notFound();

  return <PlanDetailClient planId={id} />;
}
