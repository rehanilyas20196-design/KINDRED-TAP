import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignupForm from "./signup-form";
import { portalFor } from "@/lib/portals";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your Kindred Tap account and join one of the six portals.",
};

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const requested = typeof params.portal === "string" ? params.portal : undefined;
  const portal = portalFor(requested);

  // /signup?portal=therapist is the old link format — send it to the portal's
  // own sign-up page.
  if (requested && portal) redirect(`/signup/${portal.key}`);

  return <SignupForm initialPortal={null} />;
}
