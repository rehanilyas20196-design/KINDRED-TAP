import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TherapistDirectory from "./directory-client";

export const metadata: Metadata = {
  title: "All therapists",
};

export default async function TherapistDirectoryPage({
  params,
}: PageProps<"/portal/[role]/matching/directory">) {
  const { role } = await params;

  if (role !== "user") notFound();

  return <TherapistDirectory />;
}