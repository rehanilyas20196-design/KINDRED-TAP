import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SessionsClient from "./sessions-client";

export const metadata: Metadata = {
  title: "Sessions",
};

export default async function SessionsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "therapist") notFound();

  // The session filter reads ?status= from the URL, so the client component
  // must sit under a suspense boundary for prerendering.
  return (
    <Suspense fallback={null}>
      <SessionsClient />
    </Suspense>
  );
}
