"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, messageFor } from "@/lib/api";
import { titleCaseList } from "@/lib/support";
import type { CurrentMatches, MatchedTherapist } from "@/lib/clinical";
import {
  EmptyRow,
  LoadingRow,
  NoteTone,
  Pill,
  SupportSection,
  initialsFor,
  secondaryActionClass,
} from "./parts";
import { Button, LinkButton } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * The therapist the matching system already put in front of the person.
 *
 * There is no search box here on purpose: the whole point of the assessment is
 * that they should not have to go looking.
 */
export function TherapistSection({
  matches,
  loading,
  error,
}: {
  matches: CurrentMatches | null;
  loading: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const therapist: MatchedTherapist | null = matches?.therapists[0] ?? null;

  async function startChat() {
    if (!therapist) return;
    setBusy(true);
    setActionError(null);
    try {
      const created = await apiFetch<{ conversationId: string }>("/api/support/conversations", {
        method: "POST",
        body: { therapistId: therapist.id },
      });
      router.push(`/portal/user/messages/${created.conversationId}`);
    } catch (err) {
      setActionError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <SupportSection
      id="therapist"
      icon={<Icon name="messages" className="h-5 w-5" />}
      title="Your therapist"
      intro="Matched to you from your assessment. You do not need to search - start here."
      action={
        <LinkButton href="/portal/user/matching" variant="ghost" size="sm">
          All matches
        </LinkButton>
      }
    >
      {loading ? (
        <LoadingRow label="Loading your matched therapist" />
      ) : error ? (
        <NoteTone tone="danger">{error}</NoteTone>
      ) : !matches?.hasCurrentConcern ? (
        <div className="space-y-4">
          <EmptyRow>
            We do not have a current concern for you yet, so there is nobody to match against
            yet.
          </EmptyRow>
          <LinkButton href="/portal/user/assessment">Start the assessment</LinkButton>
        </div>
      ) : !therapist ? (
        <div className="space-y-4">
          <EmptyRow>
            Nobody with this specialty is available right now. That is a real gap, not a bug -
            you can still message anyone in the directory.
          </EmptyRow>
          <LinkButton href="/portal/user/matching/directory">
            Browse all therapists
          </LinkButton>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-sm font-semibold text-teal-800 dark:bg-teal-500/15 dark:text-teal-300"
            >
              {initialsFor(therapist.fullName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {therapist.fullName}
                </h3>
                {therapist.registrationVerified ? <Pill tone="completed">Verified</Pill> : null}
                <Pill tone={therapist.acceptingNewCases ? "scheduled" : "cancelled"}>
                  <span
                    aria-hidden="true"
                    className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                      therapist.acceptingNewCases ? "bg-teal-500" : "bg-slate-400"
                    }`}
                  />
                  {therapist.acceptingNewCases ? "Online — available" : "Offline right now"}
                </Pill>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {therapist.discipline}
                {therapist.yearsExperience ? ` · ${therapist.yearsExperience} years experience` : ""}
              </p>
            </div>
          </div>

          {therapist.bio ? (
            <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {therapist.bio}
            </p>
          ) : null}

          <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-500 dark:text-slate-500">Specialization</dt>
              <dd className="text-slate-700 dark:text-slate-200">
                {titleCaseList(therapist.matchedSpecialties) ||
                  titleCaseList(therapist.specialties) ||
                  "Not listed yet"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500 dark:text-slate-500">Matched on</dt>
              <dd className="text-slate-700 dark:text-slate-200">{therapist.matchedOn}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500 dark:text-slate-500">Availability</dt>
              <dd className="text-slate-700 dark:text-slate-200">
                {therapist.availabilityHoursPerWeek
                  ? `${therapist.availabilityHoursPerWeek} hrs a week`
                  : "Not listed yet"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500 dark:text-slate-500">Session types</dt>
              <dd className="text-slate-700 dark:text-slate-200">
                {titleCaseList(therapist.sessionModes) || "Online"}
              </dd>
            </div>
          </dl>

          {actionError ? (
            <div className="mt-4">
              <NoteTone tone="danger">{actionError}</NoteTone>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={startChat} loading={busy}>
              {busy ? "Opening..." : "Start chat"}
            </Button>
            <a href="#sessions" className={secondaryActionClass}>
              Book session
            </a>
            <LinkButton
              href={`/portal/user/matching/${therapist.id}`}
              variant="secondary"
              size="sm"
            >
              View profile
            </LinkButton>
          </div>
        </div>
      )}
    </SupportSection>
  );
}
