import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProfileClient from "./profile-client";
import { portalFor } from "@/lib/portals";

export const metadata: Metadata = {
  title: "Portal profile",
};

export default async function PortalProfilePage({
  params,
}: PageProps<"/portal/[role]/profile">) {
  const { role } = await params;

  // Unknown roles 404 right away; known roles render the client guard, which
  // handles signed-out and wrong-portal states itself.
  if (!portalFor(role)) notFound();

  return <ProfileClient role={role} />;
}
