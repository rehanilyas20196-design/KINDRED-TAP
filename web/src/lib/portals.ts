/**
 * Portal metadata for the auth pages.
 *
 * Mirrors `api/src/lib/roles.js` — the API stays the source of truth for
 * validation; this copy only drives the UI so the pages render instantly
 * without a network round trip.
 */

export type Role =
  | "user"
  | "supporter"
  | "therapist"
  | "clinical_advisor"
  | "clinical_supervisor"
  | "collaborative_clinic";

export interface PortalMeta {
  key: Role;
  label: string;
  portal: string;
  tagline: string;
  description: string;
  journey: string[];
  requiresEthics: boolean;
}

export const PORTALS: PortalMeta[] = [
  {
    key: "user",
    label: "User",
    portal: "User Portal",
    tagline: "Find the right support for how you feel",
    description:
      "Complete a brief assessment, describe what you are dealing with, and we will match you with a trained supporter or psychologist.",
    journey: ["Assessment", "Describe your feelings", "Match with therapists"],
    requiresEthics: false,
  },
  {
    key: "supporter",
    label: "Supporter",
    portal: "Supporter Portal",
    tagline: "Peer support for people you care about",
    description:
      "Offer lived-experience support, work matched requests and escalate anything urgent.",
    journey: [
      "Sign up and accept the ethical agreement",
      "Receive matched requests",
      "Provide peer support",
      "Escalate concerns",
      "Complete the session",
    ],
    requiresEthics: true,
  },
  {
    key: "therapist",
    label: "Therapist",
    portal: "Therapist Portal",
    tagline: "Deliver professional therapy",
    description:
      "Take AI-matched cases, deliver therapy, document sessions and escalate concerns.",
    journey: [
      "Sign up and accept the ethical agreement",
      "Receive AI-matched cases",
      "Provide professional therapy",
      "Document the session",
      "Follow up and escalate when needed",
    ],
    requiresEthics: true,
  },
  {
    key: "clinical_advisor",
    label: "Clinical Advisor",
    portal: "Clinical Advisor Portal",
    tagline: "Hold the clinical standard",
    description:
      "Set clinical standards, supervise practitioners and keep ethical guidelines current.",
    journey: [
      "Oversee clinical standards",
      "Supervise practitioners",
      "Review safety escalations",
      "Maintain ethical guidelines",
    ],
    requiresEthics: true,
  },
  {
    key: "clinical_supervisor",
    label: "Clinical Supervisor",
    portal: "Clinical Supervisor Portal",
    tagline: "Safety and ethical oversight",
    description:
      "Monitor safety, review escalations, supervise the team and intervene when needed.",
    journey: [
      "Monitor safety",
      "Review escalations",
      "Supervise supporters and therapists",
      "Intervene when needed",
      "Maintain clinical and ethical oversight",
    ],
    requiresEthics: true,
  },
  {
    key: "collaborative_clinic",
    label: "Collaborative Clinic",
    portal: "Collaborative Clinic Portal",
    tagline: "Partner clinics, referrals and outcomes",
    description:
      "Send and receive referrals, promote your services and track clients and commission.",
    journey: [
      "Receive and send referrals",
      "Promote services",
      "Track clients",
      "Track commission",
      "Manage partnerships",
    ],
    requiresEthics: true,
  },
];

/** Must match ETHICS_VERSION in `api/src/lib/roles.js`. */
export const ETHICS_VERSION = "2026.1";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && PORTALS.some((p) => p.key === value);
}

export function portalFor(key?: string | null): PortalMeta | null {
  if (!key) return null;
  return PORTALS.find((p) => p.key === key) ?? null;
}

/** Route for a portal's own sign-in page; unknown roles fall back to the picker. */
export function loginPath(role?: string | null): string {
  return isRole(role) ? `/login/${role}` : "/login";
}

/** Route for a portal's own sign-up page; unknown roles fall back to the picker. */
export function signupPath(role?: string | null): string {
  return isRole(role) ? `/signup/${role}` : "/signup";
}

/**
 * Human phrase for the `next` path the API attaches to every auth response
 * (`/portal/<role>` or `/portal/<role>/profile`).
 */
export function describeNextStep(next: string): string {
  if (!next || next === "/login") return "You are signed in.";
  if (next === "/choose-portal") return "Choose the portal you want to work in to continue.";

  const portal = portalFor(next.split("/")[2]);
  if (next.endsWith("/profile")) {
    return `Finish setting up your ${portal?.portal ?? "portal"} profile to continue.`;
  }
  return portal ? `Continue to your ${portal}.` : "Continue to your portal.";
}
