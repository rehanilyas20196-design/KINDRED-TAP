import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LoginForm from "../login-form";
import { portalFor } from "@/lib/portals";

export async function generateMetadata({
  params,
}: PageProps<"/login/[portal]">): Promise<Metadata> {
  const { portal } = await params;
  const meta = portalFor(portal);
  return {
    title: meta ? `Sign in — ${meta.portal}` : "Log in",
    description: meta
      ? `Sign in to your ${meta.portal} account.`
      : "Sign in to your Kindred Tap portal.",
  };
}

export default async function PortalLoginPage({ params }: PageProps<"/login/[portal]">) {
  const { portal } = await params;
  const meta = portalFor(portal);
  if (!meta) notFound();

  return <LoginForm initialPortal={meta} locked />;
}
