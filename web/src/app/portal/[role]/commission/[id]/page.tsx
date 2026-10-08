import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommissionDetailClient } from "@/components/clinic/commission";

export const metadata: Metadata = {
  title: "Commission Detail",
};

/**
 * The id in the URL is an opaque row id, never a client reference or anything
 * else identifying. Ownership is decided server side: a record belonging to
 * another organization is a 404, so this page cannot be pointed at it.
 */
export default async function Page({ params }: { params: Promise<{ role: string; commissionId: string }> }) {
  const { role, commissionId } = await params;
  if (role !== "collaborative_clinic") notFound();

  return <CommissionDetailClient commissionId={commissionId} />;
}
