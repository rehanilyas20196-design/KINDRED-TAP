import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PortalDashboardClient from "./dashboard-client";
import { portalFor } from "@/lib/portals";

export const metadata: Metadata = {
  title: "Portal",
};

export default async function PortalDashboardPage({ params }: PageProps<"/portal/[role]">) {
  const { role } = await params;

  if (!portalFor(role)) notFound();

  return <PortalDashboardClient role={role} />;
}
