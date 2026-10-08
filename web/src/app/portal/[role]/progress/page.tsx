import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProgressClient from "./progress-client";

export const metadata: Metadata = {
  title: "Progress",
};

export default async function ProgressPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "therapist") notFound();

  return <ProgressClient />;
}
