import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartnershipDetailClient } from "@/components/clinic/partnerships";

export const metadata: Metadata = {
  title: "Partnership",
};

/**
 * The id in the URL is an opaque row id, never a client reference or anything
 * else identifying. Ownership is decided server side: a record belonging to
 * another organization is a 404, so this page cannot be pointed at it.
 */
export default async function Page({ params }: { params: Promise<{ role: string; partnershipId: string }> }) {
  const { role, partnershipId } = await params;
  if (role !== "collaborative_clinic") notFound();

  return <PartnershipDetailClient partnershipId={partnershipId} />;
}
