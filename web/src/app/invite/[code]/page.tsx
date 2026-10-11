import type { Metadata } from "next";
import InviteJoinClient from "./join-client";

export const metadata: Metadata = {
  title: "Scan in to Kindred Tap",
  description:
    "You scanned a Kindred Tap QR invite. Confirm who you are and wait for the account owner's approval.",
  robots: { index: false },
};

export default async function InviteJoinPage({ params }: PageProps<"/invite/[code]">) {
  const { code } = await params;
  return <InviteJoinClient code={code} />;
}
