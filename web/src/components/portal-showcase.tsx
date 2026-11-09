"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PORTALS, loginPath, signupPath, type Role, type PortalMeta, ETHICS_VERSION } from "@/lib/portals";
import { PortalIcon } from "@/components/portal-icon";

type CategoryFilter = "all" | "individuals" | "care" | "oversight" | "clinic";

interface RoleTheme {
  category: CategoryFilter;
  categoryLabel: string;
  badgeLabel: string;
  badgeClass: string;
  highlightText: string;
}

const ROLE_THEMES: Record<Role, RoleTheme> = {
  user: {
    category: "individuals",
    categoryLabel: "Seeking Support",
    badgeLabel: "Direct Access",
    badgeClass: "bg-[#97d7ff] text-[#086288] border border-[#8bc0de]",
    highlightText: "Conversational intake · Match in minutes",
  },
  supporter: {
    category: "care",
    categoryLabel: "Peer Support",
    badgeLabel: "Lived Experience",
    badgeClass: "bg-[#FFEFC4] text-[#086288] border border-[#f0dfa8]",
    highlightText: "Peer matching · Supervised escalations",
  },
  therapist: {
    category: "care",
    categoryLabel: "Licensed Practice",
    badgeLabel: "Therapist Portal",
    badgeClass: "bg-[#086288] text-white",
    highlightText: "Encrypted SOAP notes · AI case triage",
  },
  clinical_advisor: {
    category: "oversight",
    categoryLabel: "Clinical Governance",
    badgeLabel: "Advisor Portal",
    badgeClass: "bg-[#086288] text-[#FFEFC4]",
    highlightText: "Protocol guidelines · Advisory boards",
  },
  clinical_supervisor: {
    category: "oversight",
    categoryLabel: "Safety Oversight",
    badgeLabel: "Supervisor Portal",
    badgeClass: "bg-[#97d7ff] text-[#086288] border border-[#8bc0de]",
    highlightText: "Live intervention · Safety triage",
  },
  collaborative_clinic: {
    category: "clinic",
    categoryLabel: "Multi-Provider",
    badgeLabel: "Partner Clinic",
    badgeClass: "bg-[#FFEFC4] text-[#086288] border border-[#f0dfa8]",
    highlightText: "Referral tracking · Outcome metrics",
  },
};

const CATEGORIES: { id: CategoryFilter; label: string; count: number }[] = [
  { id: "all", label: "All Portals", count: 6 },
  { id: "individuals", label: "Individuals", count: 1 },
  { id: "care", label: "Therapists & Peers", count: 2 },
  { id: "oversight", label: "Clinical Oversight", count: 2 },
  { id: "clinic", label: "Partner Clinics", count: 1 },
];

export function PortalShowcase() {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPortals = useMemo(() => {
    return PORTALS.filter((portal) => {
      const theme = ROLE_THEMES[portal.key];
      const matchesCategory =
        activeCategory === "all" || theme.category === activeCategory;
      const matchesSearch =
        searchQuery.trim() === "" ||
        portal.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        portal.portal.toLowerCase().includes(searchQuery.toLowerCase()) ||
        portal.tagline.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  return (
    <div className="mt-8">
      {/* Category Pills & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Filter portals by category"
          className="no-scrollbar flex gap-1.5 overflow-x-auto py-1"
        >
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveCategory(cat.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-[#086288] text-[#FFEFC4]"
                    : "bg-white text-[#086288]/70 border border-[#f0dfa8] hover:border-[#086288] hover:text-[#086288]"
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded px-1 text-[10px] font-mono ${
                    isActive ? "bg-white/20 text-[#FFEFC4]" : "bg-[#FFEFC4] text-[#086288]/70"
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Quick Search */}
        <div className="relative w-full sm:w-60">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search roles..."
            className="w-full rounded-md border border-[#f0dfa8] bg-white py-1.5 pl-3 pr-8 text-xs text-[#086288] placeholder-[#086288]/40 outline-none focus:border-[#086288] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-[#086288]/40 hover:text-[#086288]"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Portals Grid */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filteredPortals.map((portal) => {
          const theme = ROLE_THEMES[portal.key];

          return (
            <article
              key={portal.key}
              className="group flex flex-col justify-between rounded-xl border border-[#f0dfa8] bg-white p-6 shadow-xs hover:border-[#4d8dba] hover:shadow-md transition-all duration-200"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFEFC4] text-[#086288]">
                    <PortalIcon role={portal.key} className="h-5 w-5" />
                  </span>

                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${theme.badgeClass}`}
                  >
                    {theme.badgeLabel}
                  </span>
                </div>

                {/* Title & Tagline */}
                <div className="mt-4">
                  <h3 className="font-display text-lg font-bold text-[#086288]">
                    {portal.portal}
                  </h3>
                  <p className="mt-1 text-xs text-[#086288]/65 leading-relaxed">
                    {portal.tagline}
                  </p>
                </div>

                {/* Key feature chip */}
                <p className="mt-4 font-mono text-[11px] text-[#086288]/50 uppercase tracking-wide">
                  {theme.highlightText}
                </p>

                {/* Short workflow */}
                <ul className="mt-3.5 space-y-1.5 border-t border-[#f0dfa8] pt-3">
                  {portal.journey.slice(0, 3).map((step, idx) => (
                    <li key={step} className="flex items-center gap-2 text-xs text-[#086288]/70">
                      <span className="font-mono text-[10px] text-[#086288] font-semibold">{idx + 1}.</span>
                      <span className="truncate">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions */}
              <div className="mt-6 flex items-center gap-2 border-t border-[#f0dfa8] pt-4">
                <Link
                  href={loginPath(portal.key)}
                  className="flex-1 rounded-md border border-[#f0dfa8] bg-white py-2 text-center text-xs font-medium text-[#086288] hover:border-[#086288] transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href={signupPath(portal.key)}
                  className="flex-1 rounded-md bg-[#086288] py-2 text-center text-xs font-medium text-[#FFEFC4] hover:bg-[#064e6b] hover:text-white transition-colors"
                >
                  Open Portal
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
