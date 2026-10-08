"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GuardSplash,
  SignedOutPanel,
  WrongPortalPanel,
  usePortalGuard,
} from "@/components/portal-guard";
import { DashboardShell } from "@/components/dashboard";
import { Icon } from "@/components/icons";
import { portalFor } from "@/lib/portals";
import { fetchSupportTickets, fetchMatches, type CurrentMatches, type SupportTicket } from "@/lib/clinical";
import { fetchSessions, type TherapySession } from "@/lib/sessions";
import { EmergencySection } from "./emergency-section";
import { TherapistSection } from "./therapist-section";
import { SessionsSection } from "./sessions-section";
import { AiSupportSection } from "./ai-support-section";
import { TicketsSection } from "./tickets-section";
import { PrivacySection } from "./privacy-section";

const ROLE = "user";

const TILES = [
  {
    href: "#therapist",
    icon: "messages" as const,
    title: "Therapist",
    description: "Contact your matched therapist",
  },
  {
    href: "#sessions",
    icon: "calendar" as const,
    title: "My sessions",
    description: "View and manage appointments",
  },
  {
    href: "#ai",
    icon: "assistant" as const,
    title: "AI support",
    description: "Get guidance and prepare for therapy",
  },
  {
    href: "#tickets",
    icon: "ticket" as const,
    title: "Support request",
    description: "Report a problem or ask for help",
  },
] as const;

/** The profile arrives from the API with its own column names; try both spellings. */
function profileText(profile: Record<string, unknown> | null, camel: string): string | null {
  if (!profile) return null;
  const snake = camel.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
  const value = profile[camel] ?? profile[snake];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The support and safety bridge: urgent help, the therapist the matching
 * system found, the diary, the assistant, tickets and privacy - one page,
 * in the order a person actually needs them.
 */
export default function SupportClient() {
  const guard = usePortalGuard(ROLE);
  const portal = portalFor(ROLE);

  const [matches, setMatches] = useState<CurrentMatches | null>(null);
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [prefillCategory, setPrefillCategory] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState<string>(TILES[0].href);

  useEffect(() => {
    if (guard.kind !== "ready" || typeof IntersectionObserver !== "function") return;

    const targets = TILES.map((tile) => document.getElementById(tile.href.slice(1))).filter(
      (element): element is HTMLElement => element !== null
    );
    if (targets.length === 0) return;

    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => ratios.set(entry.target.id, entry.intersectionRatio));
        const [best] = Array.from(ratios.entries()).sort((a, b) => b[1] - a[1]);
        if (best && best[1] > 0) setCurrentSection(`#${best[0]}`);
      },
      { rootMargin: "-35% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    targets.forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, [guard.kind]);

  useEffect(() => {
    if (guard.kind !== "ready") return;
    let cancelled = false;

    // Settled individually: one broken endpoint must not blank the whole page.
    void (async () => {
      const [matchResult, sessionResult, ticketResult] = await Promise.allSettled([
        fetchMatches(),
        fetchSessions(),
        fetchSupportTickets(),
      ]);
      if (cancelled) return;

      const nextErrors: Record<string, string> = {};

      if (matchResult.status === "fulfilled") setMatches(matchResult.value);
      else nextErrors.matches = matchResult.reason?.message ?? "Could not load your therapist match.";

      if (sessionResult.status === "fulfilled") setSessions(sessionResult.value.sessions);
      else nextErrors.sessions = sessionResult.reason?.message ?? "Could not load your sessions.";

      if (ticketResult.status === "fulfilled") setTickets(ticketResult.value.tickets);
      else nextErrors.tickets = ticketResult.reason?.message ?? "Could not load your support requests.";

      setErrors(nextErrors);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [guard.kind]);

  const reportConcern = useCallback(() => setPrefillCategory("privacy_concern"), []);
  const clearPrefill = useCallback(() => setPrefillCategory(null), []);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }

  const therapist = matches?.therapists[0] ?? null;
  const profile = guard.profile;

  return (
    <DashboardShell portal={portal!} user={guard.user}>
      <div className="space-y-6">
        <section>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            How can we help you?
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            We are here to help you navigate your mental-health journey - from urgent help to the
            therapist matching found for you.
          </p>

          <nav aria-label="Support sections" className="mt-5 grid gap-4 sm:grid-cols-2">
            {TILES.map((tile) => (
              <a
                key={tile.href}
                href={tile.href}
                aria-current={currentSection === tile.href ? "page" : undefined}
                className="card card-interactive group flex items-start gap-3.5 p-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100 transition group-hover:bg-teal-700 group-hover:text-white group-hover:ring-teal-700">
                  <Icon name={tile.icon} className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    {tile.title}
                    <Icon
                      name="arrowRight"
                      className="h-4 w-4 -translate-x-1 text-slate-500 transition group-hover:translate-x-0 group-hover:text-teal-700"
                    />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {tile.description}
                  </span>
                </span>
              </a>
            ))}
          </nav>
        </section>

        <EmergencySection
          contactName={profileText(profile, "emergencyContactName")}
          contactPhone={profileText(profile, "emergencyContactPhone")}
          contactRelation={profileText(profile, "emergencyContactRelation")}
        />

        <TherapistSection matches={matches} loading={loading} error={errors.matches ?? null} />

        <SessionsSection
          sessions={sessions}
          therapist={therapist}
          loading={loading}
          error={errors.sessions ?? null}
          onChanged={setSessions}
        />

        <AiSupportSection
          concernLabel={matches?.primaryIssue?.label ?? null}
          therapistName={therapist?.fullName ?? null}
        />

        <TicketsSection
          tickets={tickets}
          loading={loading}
          error={errors.tickets ?? null}
          prefillCategory={prefillCategory}
          onPrefillUsed={clearPrefill}
          onChanged={setTickets}
        />

        <PrivacySection onReportConcern={reportConcern} />

        <p className="pb-2 text-center text-[11px] leading-5 text-slate-500 dark:text-slate-500">
          Kindred Tap support · nothing on this page replaces emergency services or clinical
          advice.
        </p>
      </div>
    </DashboardShell>
  );
}
