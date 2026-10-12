"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import {
  usePortalGuard,
  GuardSplash,
  SignedOutPanel,
  WrongPortalPanel,
} from "@/components/portal-guard";
import { portalFor } from "@/lib/portals";
import type { PortalMeta } from "@/lib/portals";
import type { AuthUser } from "@/lib/api";
import { Icon } from "@/components/icons";
import type { IconName } from "@/components/icons";

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

export interface AdvisorNavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Match this path exactly instead of by prefix. */
  exact?: boolean;
}

export interface AdvisorNavGroup {
  label: string;
  items: AdvisorNavItem[];
}

const ROLE = "clinical_advisor";
const root = `/portal/${ROLE}`;

export const ADVISOR_NAV: AdvisorNavGroup[] = [
  {
    label: "Clinical oversight",
    items: [
      { href: root, label: "Dashboard", icon: "home", exact: true },
      { href: `${root}/clinical-standards`, label: "Clinical standards", icon: "standards" },
      { href: `${root}/supervision`, label: "Supervision", icon: "supervision" },
      { href: `${root}/safety`, label: "Safety escalations", icon: "safety" },
      { href: `${root}/ethics`, label: "Ethics", icon: "ethics" },
    ],
  },
  {
    label: "Clinic operations",
    items: [
      { href: `${root}/therapists`, label: "Therapists", icon: "therapists" },
      { href: `${root}/clients`, label: "Clients", icon: "clients" },
      { href: `${root}/matching`, label: "Matching", icon: "search" },
      { href: `${root}/appointments`, label: "Appointments", icon: "calendar" },
      { href: `${root}/assessments`, label: "Assessments", icon: "assessments" },
    ],
  },
  {
    label: "Insight",
    items: [
      { href: `${root}/outcomes`, label: "Outcomes", icon: "outcomes" },
      { href: `${root}/analytics`, label: "Analytics", icon: "analytics" },
      { href: `${root}/reports`, label: "Reports", icon: "reports" },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: `${root}/messages`, label: "Messages", icon: "messages" },
      { href: `${root}/notifications`, label: "Notifications", icon: "notifications" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: `${root}/settings`, label: "Settings", icon: "settings" },
      { href: `${root}/profile`, label: "My Profile", icon: "profile" },
    ],
  },
];

const ALL_ITEMS: AdvisorNavItem[] = ADVISOR_NAV.flatMap((group) => group.items);

function isActive(pathname: string, item: AdvisorNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname }: { item: AdvisorNavItem; pathname: string }) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="nav-item"
    >
      <Icon name={item.icon} className="nav-item-icon h-4.5 w-4.5 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

/**
 * The frame every advisor page renders inside: the shared portal header plus
 * a persistent nav grouped by duty - oversight, operations, insight and
 * administration. On small screens the nav becomes a horizontally
 * scrollable strip so nothing hides behind a menu the keyboard cannot reach.
 */
export function AdvisorShell({
  portal,
  user,
  children,
}: {
  portal: PortalMeta;
  user: AuthUser;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-slate-100">
      <DashboardHeader portal={portal} user={user} />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <nav
          aria-label="Clinical advisor portal"
          className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:hidden"
        >
          {ALL_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item) ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                isActive(pathname, item)
                  ? "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200 dark:bg-teal-900/40 dark:text-teal-200"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:text-white"
              }`}
            >
              <Icon name={item.icon} className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex gap-6 pb-10 pt-4 lg:gap-8 lg:pt-6">
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-24 mt-6 max-h-[calc(100dvh-8rem)] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs">
              {ADVISOR_NAV.map((group) => (
                <div key={group.label}>
                  <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <NavLink key={item.href} item={item} pathname={pathname} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">{children}</main>
        </div>
      </div>
    </div>
  );
}

/**
 * Route entry for an advisor page: runs the shared portal guard (the role
 * comes from the API, never the URL) and puts the page inside the shell.
 * Every advisor route renders this and only supplies its own body.
 */
export function AdvisorPage({ children }: { children: ReactNode }) {
  const guard = usePortalGuard(ROLE);
  const portal = portalFor(ROLE);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }

  return <AdvisorShell portal={portal!} user={guard.user}>{children}</AdvisorShell>;
}
