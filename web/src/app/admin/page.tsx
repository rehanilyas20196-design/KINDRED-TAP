import type { Metadata } from "next";
import { AdminPanel } from "@/components/admin/admin-panel";

export const metadata: Metadata = {
  title: "Admin",
  // The panel is not linked from the product and should not turn up in search.
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminPanel />;
}
