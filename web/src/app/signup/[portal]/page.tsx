import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SignupForm from "../signup-form";
import { portalFor } from "@/lib/portals";

export async function generateMetadata({
  params,
}: PageProps<"/signup/[portal]">): Promise<Metadata> {
  const { portal } = await params;
  const meta = portalFor(portal);
  return {
    title: meta ? `Create account — ${meta.portal}` : "Create account",
    description: meta
      ? `Create your ${meta.portal} account.`
      : "Create your Kindred Tap account and join one of the six portals.",
  };
}

export default async function PortalSignupPage({ params }: PageProps<"/signup/[portal]">) {
  const { portal } = await params;
  const meta = portalFor(portal);
  if (!meta) notFound();

  return <SignupForm initialPortal={meta} locked />;
}
