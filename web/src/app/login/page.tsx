import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";
import { PORTALS, portalFor } from "@/lib/portals";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to your Kindred Tap portal.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const requested = typeof params.portal === "string" ? params.portal : undefined;
  const portal = portalFor(requested);

  // /login?portal=therapist is the old link format — send it to the portal's
  // own sign-in page.
  if (requested && portal) redirect(`/login/${portal.key}`);

  return <LoginForm initialPortal={PORTALS[0]} />;
}
