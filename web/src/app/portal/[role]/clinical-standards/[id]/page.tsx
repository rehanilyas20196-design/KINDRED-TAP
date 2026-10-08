import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StandardDetailClient from "./standard-detail-client";

export const metadata: Metadata = {
  title: "Clinical standard",
};

export default async function StandardDetailPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role !== "clinical_advisor") notFound();

  return <StandardDetailClient standardId={id} />;
}
