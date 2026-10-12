/**
 * The single glyph registry shared by every portal shell.
 *
 * Shells pick an icon by name (`NavItem.icon`) so navigation stays a plain
 * data structure; the SVG lives here once instead of being re-declared per
 * portal.
 */

export const GLYPHS = {
  home: (
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6.5 10.5V20h11v-9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  clients: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.9-4.8 5.5-4.8s4.9 1.6 5.5 4.8" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6" />
      <path d="M17.5 14.4c1.9.6 3 2.1 3.4 4.6" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c.7-3.6 3.4-5.4 7-5.4s6.3 1.8 7 5.4" />
    </>
  ),
  sessions: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      <path d="M8.5 14h3M8.5 17h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
    </>
  ),
  assessments: (
    <>
      <path d="M7 4.5h10A1.5 1.5 0 0 1 18.5 6v13.5A1.5 1.5 0 0 1 17 21H7a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 7 4.5Z" />
      <path d="M9 3.5h6v3H9z" />
      <path d="M9 11h6M9 14.5h4" />
    </>
  ),
  plans: (
    <>
      <path d="M4.5 7.5 12 4l7.5 3.5L12 11 4.5 7.5Z" />
      <path d="M4.5 12 12 15.5 19.5 12" />
      <path d="M4.5 16.5 12 20l7.5-3.5" />
    </>
  ),
  progress: (
    <>
      <path d="M4 19.5V4.5" />
      <path d="M4 19.5h16" />
      <path d="M7.5 16V11M12 16V7.5M16.5 16v-3" />
    </>
  ),
  messages: (
    <>
      <path d="M4.5 6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 18 16H9l-4.5 3.5V6.5Z" />
      <path d="M8.5 9.5h7M8.5 12.5h4" />
    </>
  ),
  notifications: (
    <>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" />
      <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
    </>
  ),
  standards: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="M8 4v16" />
      <path d="M11 9h4M11 12.5h4" />
    </>
  ),
  supervision: (
    <>
      <circle cx="9.5" cy="8" r="3" />
      <path d="M4 18.5c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
      <path d="M16.5 6.5a3.4 3.4 0 0 1 0 6.2" />
      <path d="M19 14.5h1.5A1.5 1.5 0 0 1 22 16v3l-2.5-1.5H15" />
    </>
  ),
  safety: (
    <>
      <path d="M12 3.5 19 6v5.4c0 4.2-2.8 7.4-7 9.1-4.2-1.7-7-4.9-7-9.1V6l7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  ethics: (
    <>
      <path d="M12 4.5v15M8 19.5h8M12 7.5 7.5 9M12 7.5l4.5 1.5" />
      <path d="M4.5 15 7.5 9l3 6Z" />
      <path d="M14.5 15l3-6 3 6Z" />
    </>
  ),
  therapists: (
    <>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4 19.5c.7-3.4 3.1-5.2 6-5.2 1.2 0 2.3.3 3.2.9" />
      <path d="m15 17 2 2 4-4.5" />
    </>
  ),
  outcomes: (
    <>
      <path d="M4 19.5V4.5" />
      <path d="M4 19.5h16" />
      <path d="m7 15.5 4-4 3 3 4.5-5.5" />
      <path d="M15.5 9H19v3.5" />
    </>
  ),
  analytics: (
    <>
      <path d="M3.5 19.5h17" />
      <path d="M6.5 19.5v-5.5M11 19.5V7M15.5 19.5v-8M20 19.5V10.5" />
    </>
  ),
  reports: (
    <>
      <path d="M7 3.5h7l4.5 4.5V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M13.5 3.5V8.5H18" />
      <path d="M8.5 13h7M8.5 16.5h5" />
    </>
  ),
  audit: (
    <>
      <rect x="5" y="5" width="14" height="15.5" rx="1.5" />
      <path d="M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="m8.5 12.5 2 2 4.5-4.5" />
      <path d="M8.5 17.5h7" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  search: (
    <>
      <circle cx="11" cy="11" r="5.5" />
      <path d="m15.5 15.5 4 4" />
    </>
  ),
  arrowLeft: <path d="M14.5 6 9 12l5.5 6" />,
  arrowRight: <path d="m9.5 6 5.5 6-5.5 6" />,
  check: <path d="m5.5 12.5 4 4 9-9" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  dots: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </>
  ),
  assistant: (
    <>
      <rect x="4" y="7.5" width="16" height="11.5" rx="3" />
      <path d="M12 4v3.5" />
      <circle cx="12" cy="3.4" r="1.1" />
      <path d="M9 12.5h.01M15 12.5h.01" />
      <path d="M9.5 16h5" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v2a1.75 1.75 0 0 0 0 3.5v2A1.5 1.5 0 0 1 18.5 17h-13A1.5 1.5 0 0 1 4 15.5v-2a1.75 1.75 0 0 0 0-3.5v-2Z" />
      <path d="M13 7v10" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <path d="M12 14.5v2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 21 19.5H3L12 4.5Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  notes: (
    <>
      <path d="M6 3.5h8.5L19 8v12.5H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5Z" />
      <path d="M14 3.5V8.5H19" />
      <path d="M8.5 12.5h7M8.5 16h4.5" />
    </>
  ),
};

export type IconName = keyof typeof GLYPHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
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
      {GLYPHS[name]}
    </svg>
  );
}
