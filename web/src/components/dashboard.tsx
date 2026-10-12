"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PortalIcon } from "@/components/portal-icon";
import { BrandMark } from "@/components/auth";
import { apiFetch, clearSession, type AuthUser } from "@/lib/api";
import type { PortalMeta } from "@/lib/portals";
import { Icon } from "@/components/icons";
import { Badge, Card, EmptyState, ProgressBar } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

interface HeaderLink {
  href: string;
  label: string;
  exact?: boolean;
}

/** Primary navigation shown inside the shared header, per portal. */
const HEADER_NAV: Record<string, HeaderLink[]> = {
  user: [
    { href: "/portal/user", label: "Home", exact: true },
    { href: "/portal/user/assessment", label: "Assessment" },
    { href: "/portal/user/matching", label: "Matches" },
    { href: "/portal/user/messages", label: "Messages" },
    { href: "/portal/user/support", label: "Support" },
    { href: "/portal/user/profile", label: "Profile" },
  ],
  // The supporter portal has no section nav of its own — the header is the
  // only way to reach the session room, so it has to carry these. (Messages
  // and notifications are deliberately closed to this role.)
  supporter: [
    { href: "/portal/supporter", label: "Home", exact: true },
    { href: "/portal/supporter/supporter-session", label: "Session room" },
    { href: "/portal/supporter/supporter-tools", label: "Tools" },
    { href: "/portal/supporter/support", label: "Support" },
    { href: "/portal/supporter/profile", label: "Profile" },
  ],
};

function isCurrent(pathname: string, link: HeaderLink) {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function DashboardHeader({ portal, user }: { portal: PortalMeta; user: AuthUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const links = HEADER_NAV[portal.key] ?? [];

  async function signOut() {
    setBusy(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST", body: {} });
    } catch {
      // The token dies server side in 7 days regardless; clear and move on.
    }
    clearSession();
    router.replace("/login");
    router.refresh();
  }

  const initials =
    user.fullName
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") ?? user.email.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href={`/portal/${portal.key}`}
          className="flex min-w-0 items-center gap-2.5 rounded-lg"
        >
          <BrandMark className="h-8 w-8" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold tracking-tight text-slate-900">
              {portal.portal}
            </span>
            <span className="block truncate text-[11px] text-slate-500">Kindred Tap</span>
          </span>
        </Link>

        {links.length > 0 ? (
          <nav aria-label="Portal" className="hidden min-w-0 flex-1 items-center gap-1 md:flex">
            {links.map((link) => {
              const active = isCurrent(pathname, link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-teal-50 text-teal-800"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden text-right text-xs leading-tight sm:block">
            <span className="block font-medium text-slate-700">{user.fullName ?? user.email}</span>
            <span className="block text-slate-500">{portal.label}</span>
          </span>
          <Link
            href={`/portal/${portal.key}/profile`}
            aria-label="Open your profile"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-200 transition hover:bg-teal-100"
          >
            {initials}
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="btn btn-ghost btn-sm"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>

      {links.length > 0 ? (
        <nav
          aria-label="Portal sections"
          className="flex gap-1 overflow-x-auto border-t border-slate-200 px-4 py-1.5 md:hidden"
        >
          {links.map((link) => {
            const active = isCurrent(pathname, link);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                  active ? "bg-teal-50 text-teal-800" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Page body                                                           */
/* ------------------------------------------------------------------ */

export function DashboardShell({
  portal,
  user,
  children,
}: {
  portal: PortalMeta;
  user: AuthUser;
  children: ReactNode;
}) {
  const firstName = user.fullName?.split(" ")[0] ?? "there";

  return (
    <div className="min-h-dvh bg-slate-100">
      <DashboardHeader portal={portal} user={user} />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 py-7 outline-none sm:px-6 sm:py-9 lg:px-8"
      >
        <div className="flex items-start gap-4">
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 ring-1 ring-slate-200 sm:flex">
            <PortalIcon role={portal.key} className="h-5.5 w-5.5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              Welcome back, {firstName}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
              {portal.tagline}. {portal.description}
            </p>
          </div>
        </div>
        <div className="mt-7">{children}</div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Journey roadmap                                                     */
/* ------------------------------------------------------------------ */

const STEP_ACTIONS: Record<string, { label: string; href: string } | undefined> = {
  Assessment: { label: "Start", href: "/portal/user/assessment" },
  "Describe your feelings": { label: "Continue", href: "/portal/user/assessment" },
  "Match with therapists": { label: "View matches", href: "/portal/user/matching" },
  "Sign up and accept the ethical agreement": undefined,
  "Receive matched requests": undefined,
  "Provide peer support": undefined,
  "Escalate concerns": undefined,
  "Complete the session": undefined,
  "Receive AI-matched cases": undefined,
  "Provide professional therapy": undefined,
  "Document the session": undefined,
  "Follow up and escalate when needed": undefined,
  "Oversee clinical standards": undefined,
  "Supervise practitioners": undefined,
  "Review safety escalations": undefined,
  "Maintain ethical guidelines": undefined,
  "Monitor safety": undefined,
  "Review escalations": undefined,
  "Supervise supporters and therapists": undefined,
  "Intervene when needed": undefined,
  "Maintain clinical and ethical oversight": undefined,
  "Receive and send referrals": undefined,
  "Promote services": undefined,
  "Track clients": undefined,
  "Track commission": undefined,
  "Manage partnerships": undefined,
};

function StepMarker({ state, index }: { state: "done" | "next" | "todo"; index: number }) {
  if (state === "done") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white">
        <Icon name="check" className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
        state === "next"
          ? "bg-teal-100 text-teal-800 ring-1 ring-inset ring-teal-300/60"
          : "bg-white text-slate-500 ring-1 ring-inset ring-slate-300"
      }`}
    >
      {index + 1}
    </span>
  );
}

export function JourneyCard({
  portal,
  completedCount,
}: {
  portal: PortalMeta;
  completedCount: number;
}) {
  const total = portal.journey.length;
  const done = Math.min(completedCount, total);

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight text-slate-900">
          Your journey
        </h2>
        <Badge tone="neutral">
          {done} of {total}
        </Badge>
      </div>

      <div className="mt-3.5">
        <ProgressBar value={done} total={total} label="Journey progress" />
      </div>

      <ol className="mt-4">
        {portal.journey.map((step, index) => {
          const state = index < done ? "done" : index === done ? "next" : "todo";
          const action = STEP_ACTIONS[step];
          return (
            <li
              key={step}
              className="flex flex-wrap items-center gap-3 border-t border-slate-100 py-2.5 first:border-t-0"
            >
              <StepMarker state={state} index={index} />
              <span
                className={`min-w-0 flex-1 text-sm ${
                  state === "todo" ? "text-slate-500" : "font-medium text-slate-700"
                }`}
              >
                {step}
              </span>
              {state === "next" && action ? (
                <Link
                  href={action.href}
                  className="btn btn-primary btn-sm"
                >
                  {action.label}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

export function PortalComingSoon({ step }: { step: string }) {
  return (
    <EmptyState
      icon={<Icon name="clock" className="h-5 w-5" />}
      title={step}
      description="This part of the journey is coming next. The foundation is in place — matching, sessions and oversight tools build on top of the profiles and accounts already live."
    />
  );
}

export function DashboardCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight text-slate-900">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}
