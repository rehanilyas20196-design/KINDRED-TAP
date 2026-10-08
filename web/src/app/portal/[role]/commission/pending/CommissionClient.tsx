import type { Metadata } from "next";
import { CommissionClient } from "@/components/clinic/commission";

export const metadata: Metadata = {
  title: "Pending Commission",
};

/**
 * Collaborative Clinic portal. The role is checked again here as well as by the
 * API and by the shared portal guard - all three have to agree, so a URL cannot
 * render a page for a portal the signed-in account does not belong to.
 */
export default function Page() {
  return <CommissionClient initialView="pending" />;
}
