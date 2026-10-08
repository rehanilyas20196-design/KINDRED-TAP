import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TherapistProfile from "./profile-client";

export const metadata: Metadata = {
  title: "Therapist profile",
};

export default async function TherapistProfilePage({
  params,
}: PageProps<"/portal/[role]/matching/[therapistId]">) {
  const { role, therapistId } = await params;

  if (role !== "user") notFound();
  if (!therapistId) notFound();

  return <TherapistProfile therapistId={therapistId} />;
}