import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SafetyClient from "./safety-client";
import SupervisorSafetyClient from "./supervisor-safety-client";

export const metadata: Metadata = {
  title: "Safety escalations",
};

/**
 * The safety queue is a shared URL: the advisor reviews escalations and the
 * clinic supervisor monitors concerns. Each role renders its own view and the
 * API decides what that view is allowed to see.
 */
export default async function SafetyPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role === "clinical_supervisor") return <SupervisorSafetyClient />;
  if (role !== "clinical_advisor") notFound();

  return <SafetyClient />;
}
