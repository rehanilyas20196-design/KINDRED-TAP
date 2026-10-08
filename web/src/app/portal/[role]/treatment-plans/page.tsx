import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlansClient from "./plans-client";

export const metadata: Metadata = {
  title: "Treatment plans",
};

export default async function TreatmentPlansPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "therapist") notFound();

  return (
    <Suspense fallback={null}>
      <PlansClient />
    </Suspense>
  );
}
