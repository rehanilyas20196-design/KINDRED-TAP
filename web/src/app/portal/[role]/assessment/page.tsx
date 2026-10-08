import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AssessmentWizard from "./assessment-client";

export const metadata: Metadata = {
  title: "Assessment",
};

export default async function AssessmentPage({
  params,
}: PageProps<"/portal/[role]/assessment">) {
  const { role } = await params;

  if (role !== "user") notFound();

  return <AssessmentWizard />;
}