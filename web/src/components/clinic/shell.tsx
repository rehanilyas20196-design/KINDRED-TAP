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

export const CLINIC_ROLE = "collaborative_clinic";
export const clinicRoot = `/portal/${CLINIC_ROLE}`;

export interface ClinicNavItem {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
}

export interface ClinicNavGroup {
  label: string;
  items: ClinicNavItem[];
}

/**
 * Grouped by the partnership journey rather than by database table, so a clinic
 * reads it as "referrals, clients, services, money, paperwork". Hiding a link
 * here is a convenience; the API re-checks every permission regardless.
 */
export const CLINIC_NAV: ClinicNavGroup[] = [
  {
    label: "Overview",
    items: [{ href: clinicRoot, label: "Dashboard", icon: "home", exact: true }],
  },
  {
    label: "Referrals",
    items: [
      { href: `${clinicRoot}/referrals/received`, label: "Received Referrals", icon: "sessions" },
      { href: `${clinicRoot}/referrals/sent`, label: "Sent Referrals", icon: "arrowRight" },
      { href: `${clinicRoot}/referrals/history`, label: "Referral History", icon: "clock" },
    ],
  },
  {
    label: "Clients",
    items: [{ href: `${clinicRoot}/clients`, label: "Clients", icon: "clients" }],
  },
  {
    label: "Services",
    items: [
      { href: `${clinicRoot}/services`, label: "Available Services", icon: "plans" },
      { href: `${clinicRoot}/promote`, label: "Promote Services", icon: "reports" },
      { href: `${clinicRoot}/promote/materials`, label: "Marketing Materials", icon: "audit" },
    ],
  },
  {
    label: "Partnerships",
    items: [{ href: `${clinicRoot}/partnerships`, label: "Partnerships", icon: "supervision" }],
  },
  {
    label: "Commission",
    items: [
      { href: `${clinicRoot}/commission`, label: "Overview & Earnings", icon: "outcomes" },
      { href: `${clinicRoot}/commission/pending`, label: "Pending", icon: "clock" },
      { href: `${clinicRoot}/payouts`, label: "Payouts", icon: "check" },
    ],
  },
  {
    label: "Coordination",
    items: [
      { href: `${clinicRoot}/appointments`, label: "Appointments", icon: "calendar" },
      { href: `${clinicRoot}/messages`, label: "Messages", icon: "messages" },
      { href: `${clinicRoot}/notifications`, label: "Notifications", icon: "notifications" },
      { href: `${clinicRoot}/reports`, label: "Reports", icon: "analytics" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: `${clinicRoot}/organization`, label: "Organization Profile", icon: "clients" },
      { href: `${clinicRoot}/settings`, label: "Settings", icon: "settings" },
    ],
  },
];

const ALL_ITEMS: ClinicNavItem[] = CLINIC_NAV.flatMap((group) => group.items);

function isActive(pathname: string, item: ClinicNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname }: { item: ClinicNavItem; pathname: string }) {
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
 * The frame every collaborative clinic page renders inside: the shared portal
 * header plus a persistent nav grouped by duty. On small screens the nav becomes
 * a horizontally scrollable strip so nothing hides behind a menu the keyboard
 * cannot reach. Signing out lives in the shared header, as it does in every
 * other portal, rather than as a nav item - that is the project convention and
 * duplicating it would give two places that look like they do different things.
 */
export function ClinicShell({
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
          aria-label="Collaborative clinic portal"
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
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-24 mt-6 max-h-[calc(100dvh-8rem)] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs">
              <p className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                Collaborative Clinic
              </p>
              {CLINIC_NAV.map((group) => (
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
 * Route entry for a collaborative clinic page: runs the shared portal guard (the
 * role comes from the API, never the URL) and puts the page inside the shell.
 */
export function ClinicPage({ children }: { children: ReactNode }) {
  const guard = usePortalGuard(CLINIC_ROLE);
  const portal = portalFor(CLINIC_ROLE);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }

  return (
    <ClinicShell portal={portal!} user={guard.user}>
      {children}
    </ClinicShell>
  );
}
