import type { Metadata } from "next";
import SupportClient from "./support-client";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Urgent help, your matched therapist, sessions, AI support, support requests and privacy in one place.",
};

/** Static route: the portal is fixed to the person seeking support. */
export default function SupportPage() {
  return <SupportClient />;
}
