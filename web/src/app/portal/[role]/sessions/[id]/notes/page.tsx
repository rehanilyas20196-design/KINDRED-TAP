import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NotesClient from "./notes-client";

export const metadata: Metadata = {
  title: "Session note",
};

export default async function SessionNotesPage({
  params,
}: {
  params: Promise<{ role: string; id: string }>;
}) {
  const { role, id } = await params;
  if (role !== "therapist") notFound();

  return <NotesClient sessionId={id} />;
}
