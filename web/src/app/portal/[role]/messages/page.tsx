import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ConversationList from "./conversations-client";
import SupervisorMessagesClient from "./supervisor-messages-client";
import { MessagesClient as ClinicMessagesClient } from "@/components/clinic/workspace";

export const metadata: Metadata = {
  title: "Messages",
};

/**
 * Open to the person seeking support, therapists, the clinical advisor and the
 * clinic supervisor. All are participants in the same threads, and the API
 * checks participation on every read and write - the role check here is only
 * about which portal to draw. The supervisor view deliberately reaches staff,
 * never clients.
 */
const MESSAGING_ROLES = ["user", "therapist", "clinical_advisor", "clinical_supervisor", "collaborative_clinic"];

export default async function MessagesPage({ params }: PageProps<"/portal/[role]/messages">) {
  const { role } = await params;
  if (role === "collaborative_clinic") return <ClinicMessagesClient />;

  if (!MESSAGING_ROLES.includes(role)) notFound();
  if (role === "clinical_supervisor") return <SupervisorMessagesClient />;

  return <ConversationList role={role} />;
}