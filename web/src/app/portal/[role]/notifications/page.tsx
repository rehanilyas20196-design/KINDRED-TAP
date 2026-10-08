import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NotificationsClient from "./notifications-client";
import { NotificationsClient as ClinicNotificationsClient } from "@/components/clinic/workspace";

export const metadata: Metadata = {
  title: "Notifications",
};

/** Notifications reach therapists and the advisor through their own routes. */
const NOTIFICATION_ROLES = ["therapist", "clinical_advisor", "clinical_supervisor", "collaborative_clinic"];

export default async function NotificationsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role === "collaborative_clinic") return <ClinicNotificationsClient />;
  if (!NOTIFICATION_ROLES.includes(role)) notFound();

  return <NotificationsClient role={role} />;
}
