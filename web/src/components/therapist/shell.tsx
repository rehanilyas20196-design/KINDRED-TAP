"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardHeader, DashboardShell } from "@/components/dashboard";
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
import { AdvisorShell } from "@/components/advisor/shell";
import { SupervisorShell } from "@/components/supervisor/shell";
import { ClinicShell } from "@/components/clinic/shell";

/* ------------------------------------------------------------------ */
/* Icons (shared glyph registry in @/components/icons)                 */
/* ------------------------------------------------------------------ */

export { Icon as TherapistIcon };
export type TherapistIconName = IconName;

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

export interface NavItem {
  href: string;
  label: string;
  icon: TherapistIconName;
  /** Match this path exactly instead of by prefix. */
  exact?: boolean;
}

export const THERAPIST_NAV: NavItem[] = [
  { href: "/portal/therapist", label: "Dashboard", icon: "home", exact: true },
  { href: "/portal/therapist/clients", label: "Clients", icon: "clients" },
  { href: "/portal/therapist/sessions", label: "Sessions", icon: "sessions" },
  { href: "/portal/therapist/calendar", label: "Calendar", icon: "calendar" },
  { href: "/portal/therapist/assessments", label: "Assessments", icon: "assessments" },
  { href: "/portal/therapist/treatment-plans", label: "Treatment plans", icon: "plans" },
  { href: "/portal/therapist/progress", label: "Progress", icon: "progress" },
  { href: "/portal/therapist/messages", label: "Messages", icon: "messages" },
  { href: "/portal/therapist/notifications", label: "Notifications", icon: "notifications" },
  { href: "/portal/therapist/settings", label: "Settings", icon: "settings" },
  { href: "/portal/therapist/profile", label: "My Profile", icon: "profile" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
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
 * The frame every therapist page renders inside: the shared portal header
 * plus a persistent section nav. On small screens the nav becomes a
 * horizontally scrollable strip so nothing is hidden behind a menu the
 * keyboard cannot reach.
 */
export function TherapistShell({
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
          aria-label="Therapist portal"
          className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:hidden"
        >
          {THERAPIST_NAV.map((item) => (
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
          <aside className="hidden w-52 shrink-0 lg:block">
            <div className="sticky top-24 mt-6 max-h-[calc(100dvh-8rem)] space-y-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs">
              <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                Practice
              </p>
              {THERAPIST_NAV.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
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
 * Route entry for a therapist page: runs the shared portal guard (role comes
 * from the API, never the URL) and puts the page inside the shell. Every
 * therapist route renders this and only supplies its own body.
 */
export function TherapistPage({ children }: { children: ReactNode }) {
  const guard = usePortalGuard("therapist");
  const portal = portalFor("therapist");

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }

  return <TherapistShell portal={portal!} user={guard.user}>{children}</TherapistShell>;
}

/**
 * Shared pages (messages, profile, support) belong to more than one portal.
 * They pick their frame from the role so a therapist keeps the section nav
 * while a client keeps the original single-column shell.
 */
export function RoleShell({
  role,
  portal,
  user,
  children,
}: {
  role: string;
  portal: PortalMeta;
  user: AuthUser;
  children: ReactNode;
}) {
  if (role === "therapist") {
    return <TherapistShell portal={portal} user={user}>{children}</TherapistShell>;
  }
  if (role === "clinical_advisor") {
    return <AdvisorShell portal={portal} user={user}>{children}</AdvisorShell>;
  }
  if (role === "clinical_supervisor") {
    return <SupervisorShell portal={portal} user={user}>{children}</SupervisorShell>;
  }
  if (role === "collaborative_clinic") {
    return <ClinicShell portal={portal} user={user}>{children}</ClinicShell>;
  }
  return <DashboardShell portal={portal} user={user}>{children}</DashboardShell>;
}
