"use client";

import dynamic from "next/dynamic";

const TherapyScene = dynamic(() => import("./therapy-scene"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden="true"
      className="absolute inset-0 bg-white"
    />
  ),
});

/**
 * Client-only wrapper so the three.js bundle never touches the server
 * render pass. Used by the landing-page hero in place of the old
 * support-path.png illustration.
 */
export function HeroScene({ className }: { className?: string }) {
  return <TherapyScene className={className} />;
}
