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
import { portalFor, type PortalMeta } from "@/lib/portals";
import type { AuthUser } from "@/lib/api";
import { Icon, type IconName } from "@/components/icons";

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

export const SUPERVISOR_ROLE = "clinical_supervisor";
export const supervisorRoot = `/portal/${SUPERVISOR_ROLE}`;

export interface SupervisorNavItem {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
}

export interface SupervisorNavGroup {
  label: string;
  items: SupervisorNavItem[];
}

export const SUPERVISOR_NAV: SupervisorNavGroup[] = [
  {
    label: "Day-to-day supervision",
    items: [
      { href: supervisorRoot, label: "Dashboard", icon: "home", exact: true },
      { href: `${supervisorRoot}/safety`, label: "Safety Monitoring", icon: "safety" },
      { href: `${supervisorRoot}/escalations`, label: "Escalations", icon: "clock" },
      { href: `${supervisorRoot}/team`, label: "Therapists & Supporters", icon: "therapists" },
      { href: `${supervisorRoot}/supervision`, label: "Supervision", icon: "supervision" },
      { href: `${supervisorRoot}/case-reviews`, label: "Case Reviews", icon: "standards" },
      { href: `${supervisorRoot}/session-reviews`, label: "Session Reviews", icon: "sessions" },
      { href: `${supervisorRoot}/interventions`, label: "Interventions", icon: "check" },
    ],
  },
  {
    label: "Oversight",
    items: [
      { href: `${supervisorRoot}/clients`, label: "Clients", icon: "clients" },
      { href: `${supervisorRoot}/workload`, label: "Workload", icon: "analytics" },
      { href: `${supervisorRoot}/performance`, label: "Performance", icon: "progress" },
      { href: `${supervisorRoot}/oversight`, label: "Clinical & Ethical Oversight", icon: "ethics" },
    ],
  },
  {
    label: "Coordination",
    items: [
      { href: `${supervisorRoot}/calendar`, label: "Calendar", icon: "calendar" },
      { href: `${supervisorRoot}/messages`, label: "Messages", icon: "messages" },
      { href: `${supervisorRoot}/notifications`, label: "Notifications", icon: "notifications" },
      { href: `${supervisorRoot}/reports`, label: "Reports", icon: "reports" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: `${supervisorRoot}/settings`, label: "Settings", icon: "settings" },
      { href: `${supervisorRoot}/profile`, label: "My Profile", icon: "profile" },
    ],
  },
];

const ALL_ITEMS: SupervisorNavItem[] = SUPERVISOR_NAV.flatMap((group) => group.items);

function isActive(pathname: string, item: SupervisorNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname }: { item: SupervisorNavItem; pathname: string }) {
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
 * The frame every supervisor page renders inside: the shared portal header plus
 * a persistent nav grouped by duty. On small screens the nav becomes a
 * horizontally scrollable strip so nothing hides behind a menu the keyboard
 * cannot reach.
 */
export function SupervisorShell({
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
          aria-label="Clinic supervisor portal"
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
          <aside className="hidden w-60 shrink-0 lg:block">
            <div className="sticky top-24 mt-6 max-h-[calc(100dvh-8rem)] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs">
              {SUPERVISOR_NAV.map((group) => (
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
 * Route entry for a supervisor page: runs the shared portal guard (the role
 * comes from the API, never the URL) and puts the page inside the shell.
 */
export function SupervisorPage({ children }: { children: ReactNode }) {
  const guard = usePortalGuard(SUPERVISOR_ROLE);
  const portal = portalFor(SUPERVISOR_ROLE);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }

  return (
    <SupervisorShell portal={portal!} user={guard.user}>
      {children}
    </SupervisorShell>
  );
}
