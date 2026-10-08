import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupervisorTeamProfileClient from "./supervisor-team-profile-client";

export const metadata: Metadata = {
  title: "Practitioner profile",
};

export default async function TeamProfilePage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role !== "clinical_supervisor") notFound();

  return <SupervisorTeamProfileClient memberId={id} />;
}
