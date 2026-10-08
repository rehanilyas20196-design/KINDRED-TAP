import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReceivedReferralsClient } from "@/components/clinic/referral-list";

export const metadata: Metadata = {
  title: "Received Referrals",
};

/**
 * Collaborative Clinic portal. The role is checked again here as well as by the
 * API and by the shared portal guard - all three have to agree, so a URL cannot
 * render a page for a portal the signed-in account does not belong to.
 */
export default async function Page({ params }: { params: Promise<{ role: string; id: string }> }) {
  const { role } = await params;
  if (role !== "collaborative_clinic") notFound();

  return <ReceivedReferralsClient />;
}
