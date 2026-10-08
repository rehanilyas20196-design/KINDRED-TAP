import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EthicsClient from "./ethics-client";

export const metadata: Metadata = {
  title: "Ethics",
};

export default async function EthicsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "clinical_advisor") notFound();

  return <EthicsClient />;
}
