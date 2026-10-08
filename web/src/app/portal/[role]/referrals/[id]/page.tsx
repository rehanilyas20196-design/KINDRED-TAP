import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReferralDetailClient } from "@/components/clinic/referral-detail";

export const metadata: Metadata = {
  title: "Referral Detail",
};

/**
 * The id in the URL is an opaque row id, never a client reference or anything
 * else identifying. Ownership is decided server side: a record belonging to
 * another organization is a 404, so this page cannot be pointed at it.
 */
export default async function Page({ params }: { params: Promise<{ role: string; referralId: string }> }) {
  const { role, referralId } = await params;
  if (role !== "collaborative_clinic") notFound();

  return <ReferralDetailClient referralId={referralId} />;
}
