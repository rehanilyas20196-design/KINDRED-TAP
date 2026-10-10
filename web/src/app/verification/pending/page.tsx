import type { Metadata } from "next";
import { VerificationNotice } from "@/components/verification-notice";

export const metadata: Metadata = {
  title: "Verification pending",
  robots: { index: false, follow: false },
};

export default function VerificationPendingPage() {
  return <VerificationNotice />;
}
