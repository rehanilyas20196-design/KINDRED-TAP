import type { ReactNode } from "react";
import type { Role } from "@/lib/portals";

const GLYPHS: Record<Role, ReactNode> = {
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.7 3.6-5.6 7-5.6s6.2 1.9 7 5.6" />
    </>
  ),
  supporter: (
    <>
      <path d="M12 9.4c-1.2-2.4-5-2-5 .9 0 2.2 2.8 3.9 5 5.5 2.2-1.6 5-3.3 5-5.5 0-2.9-3.8-3.3-5-.9Z" />
      <path d="M8.2 20.2c1.2-.9 2.5-1.2 3.8-1 1.3-.2 2.6.1 3.8 1" />
    </>
  ),
  therapist: (
    <>
      <path d="M6 3v4a6 6 0 0 0 12 0V3" />
      <path d="M12 13v3a4 4 0 0 0 4 4h1" />
      <circle cx="19" cy="20" r="2" />
    </>
  ),
  clinical_advisor: (
    <>
      <rect x="4.5" y="4.5" width="15" height="17" rx="2" />
      <path d="M9 2.5h6v4H9z" />
      <path d="M9 12.5h6M9 16.5h4" />
    </>
  ),
  clinical_supervisor: (
    <>
      <path d="M12 3 5 5.4v5.3c0 4.4 2.9 7.9 7 9.3 4.1-1.4 7-4.9 7-9.3V5.4L12 3Z" />
      <path d="m9.2 11.7 2 2 3.6-3.7" />
    </>
  ),
  collaborative_clinic: (
    <>
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21" />
      <path d="M14 9.5h3.5A1.5 1.5 0 0 1 19 11v10" />
      <path d="M2.5 21h19" />
      <path d="M7 8h4M7 12h4M7 16h4M17 13h.01M17 17h.01" />
    </>
  ),
};

export function PortalIcon({ role, className }: { role: Role; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {GLYPHS[role]}
    </svg>
  );
}
