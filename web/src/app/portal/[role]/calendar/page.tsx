import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CalendarClient from "./calendar-client";
import SupervisorCalendarClient from "./supervisor-calendar-client";

export const metadata: Metadata = {
  title: "Calendar",
};

export default async function CalendarPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role === "clinical_supervisor") return <SupervisorCalendarClient />;
  if (role !== "therapist") notFound();

  return <CalendarClient />;
}
