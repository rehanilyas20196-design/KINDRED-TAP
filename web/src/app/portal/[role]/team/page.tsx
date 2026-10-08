import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorTeamClient from "./supervisor-team-client";

export const metadata: Metadata = {
  title: "Therapists & Supporters",
};

export default async function TeamPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorTeamClient />;
}
