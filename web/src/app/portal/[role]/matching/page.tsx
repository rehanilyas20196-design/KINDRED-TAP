import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import MatchResults from "./match-results-client";
import AdvisorMatchingClient from "./advisor-matching-client";

export const metadata: Metadata = {
  title: "Matching",
};

export default async function MatchingPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;

  // The match results page is the user journey's destination; the advisor
  // sees the clinic-wide decision queue. Other portals get a 404 rather than
  // a page the guard would immediately bounce.
  if (role === "clinical_advisor") return <AdvisorMatchingClient />;
  if (role !== "user") notFound();

  // `useSearchParams` needs a Suspense boundary, because the safety redirect
  // arrives here as a query parameter.
  return (
    <Suspense fallback={null}>
      <MatchResults />
    </Suspense>
  );
}
