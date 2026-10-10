import type { Metadata } from "next";
import { VerificationNotice } from "@/components/verification-notice";

export const metadata: Metadata = {
  title: "Account not approved",
  robots: { index: false, follow: false },
};

export default function VerificationRejectedPage() {
  return <VerificationNotice />;
}
