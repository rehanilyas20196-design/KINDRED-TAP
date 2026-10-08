import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SettingsClient from "./settings-client";
import AdvisorSettingsClient from "./advisor-settings-client";
import SupervisorSettingsClient from "./supervisor-settings-client";
import { SettingsClient as ClinicSettingsClient } from "@/components/clinic/workspace";

export const metadata: Metadata = {
  title: "Settings",
};

/**
 * Settings is shared by URL: the therapist edits their own practice, the
 * advisor edits clinic-wide configuration, permissions and the audit log.
 */
export default async function SettingsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role === "collaborative_clinic") return <ClinicSettingsClient />;
  if (role === "clinical_advisor") return <AdvisorSettingsClient />;
  if (role === "clinical_supervisor") return <SupervisorSettingsClient />;
  if (role !== "therapist") notFound();

  return <SettingsClient />;
}
