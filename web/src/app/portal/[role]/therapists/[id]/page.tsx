import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TherapistProfileClient from "./therapist-profile-client";

export const metadata: Metadata = {
  title: "Therapist profile",
};

export default async function TherapistProfilePage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role !== "clinical_advisor") notFound();

  return <TherapistProfileClient therapistId={id} />;
}
