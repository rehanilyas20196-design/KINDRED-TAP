import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MessageThread from "./thread-client";

export const metadata: Metadata = {
  title: "Conversation",
};

const MESSAGING_ROLES = ["user", "therapist", "clinical_advisor", "clinical_supervisor"];

export default async function MessageThreadPage({
  params,
}: PageProps<"/portal/[role]/messages/[conversationId]">) {
  const { role, conversationId } = await params;

  if (!MESSAGING_ROLES.includes(role)) notFound();
  if (!conversationId) notFound();

  return <MessageThread role={role} conversationId={conversationId} />;
}