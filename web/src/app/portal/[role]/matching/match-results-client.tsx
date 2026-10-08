"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePortalGuard, GuardSplash, SignedOutPanel } from "@/components/portal-guard";
import { DashboardShell } from "@/components/dashboard";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LinkButton,
  LoadingState,
  PageTitle,
  SectionTitle,
} from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion-presets";
import { Icon } from "@/components/icons";
import { apiFetch, messageFor } from "@/lib/api";
import { portalFor } from "@/lib/portals";
import { titleCaseList } from "@/lib/support";
import { fetchMatches, type CurrentMatches, type MatchedTherapist } from "@/lib/clinical";

const ROLE = "user";

function initialsFor(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function sentence(value: string): string {
  const second = value.charAt(1);
  if (second && second === second.toUpperCase() && second !== second.toLowerCase()) {
    return value;
  }
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function MatchCard({
  therapist,
  onMessage,
  rank,
}: {
  therapist: MatchedTherapist;
  onMessage: (therapist: MatchedTherapist) => void;
  rank: number;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <article className="card p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-sm font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">
          {initialsFor(therapist.fullName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[0.9375rem] font-semibold tracking-tight text-slate-900">
              {therapist.fullName}
            </h3>
            {rank === 1 ? <Badge tone="accent">Best match</Badge> : null}
            {therapist.registrationVerified ? (
              <Badge tone="success" dot>
                Verified
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{therapist.discipline}</p>
        </div>
        <span className="hidden text-right sm:block">
          <span className="block text-lg font-semibold tabular-nums text-teal-700">
            {`#${rank}`}
          </span>
          <span className="block text-[11px] text-slate-500">of your matches</span>
        </span>
      </div>

      {/* Why this person is here. Without it the ranking looks arbitrary. */}
      <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600 ring-1 ring-inset ring-slate-100">
        Works with{" "}
        <span className="font-semibold text-slate-900">{sentence(therapist.matchedOn)}</span>
        {therapist.secondaryOverlap > 0
          ? `, and also with ${therapist.secondaryOverlap} of your other listed concerns`
          : ""}
        .
      </p>

      {therapist.bio ? (
        <p className="mt-4 text-sm leading-6 text-slate-600">{therapist.bio}</p>
      ) : null}

      <dl className="mt-4 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500">Specialties</dt>
          <dd className="mt-0.5 text-slate-700">
            {titleCaseList(therapist.specialties) || "Not listed yet"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Approaches</dt>
          <dd className="mt-0.5 text-slate-700">
            {titleCaseList(therapist.modalities) || "Not listed yet"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Languages</dt>
          <dd className="mt-0.5 text-slate-700">
            {titleCaseList(therapist.languages) || "Not listed yet"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Availability</dt>
          <dd className="mt-0.5 text-slate-700">
            {typeof therapist.availabilityHoursPerWeek === "number"
              ? `${therapist.availabilityHoursPerWeek} hrs/week`
              : "Hours not listed"}
            {therapist.acceptingNewCases ? " · taking new people" : ""}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
        <Button
          size="sm"
          onClick={async () => {
            setBusy(true);
            await onMessage(therapist);
            setBusy(false);
          }}
          disabled={busy}
          loading={busy}
        >
          {busy ? "Opening…" : "Message"}
        </Button>
        <LinkButton href={`/portal/user/matching/${therapist.id}`} variant="secondary" size="sm">
          View profile
        </LinkButton>
      </div>
    </article>
  );
}

/**
 * The results of the assessment: therapists whose specialties cover the
 * person's current concern, best first.
 *
 * Every card comes from `therapist_specialties`, so a therapist who has not
 * recorded any specialties never appears - an unranked list of everyone would
 * misrepresent what matching actually does.
 */
export default function MatchResults() {
  const router = useRouter();
  const guard = usePortalGuard(ROLE);
  const portal = portalFor(ROLE);
  const searchParams = useSearchParams();
  const highRisk = searchParams.get("highRisk") === "1";

  const [data, setData] = useState<CurrentMatches | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchMatches();
      setData(result);
      // No current concern means nothing to match on, rather than an empty
      // result set worth rendering as "nobody available".
      if (!result.hasCurrentConcern) setBlocked("no-concern");
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    if (guard.kind === "ready") {
      void (async () => {
        await load();
      })();
    }
  }, [guard.kind, load]);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <GuardSplash label="This page is for the Person seeking support portal." />;
  }

  async function startConversation(therapist: MatchedTherapist) {
    try {
      const created = await apiFetch<{ conversationId: string }>("/api/support/conversations", {
        method: "POST",
        body: { therapistId: therapist.id },
      });
      router.push(`/portal/user/messages/${created.conversationId}`);
    } catch (err) {
      setError(messageFor(err));
    }
  }

  return (
    <DashboardShell portal={portal!} user={guard.user}>
      <div className="space-y-6">
        <PageTitle
          eyebrow="Your matches"
          description={
            data?.primaryIssue
              ? `Based on what you described, these people work with ${sentence(data.primaryIssue.label)} and are taking new people.`
              : "These people work with what you described and are taking new people."
          }
          action={
            <LinkButton href="/portal/user/messages" variant="secondary" size="sm">
              My messages
            </LinkButton>
          }
        >
          Therapists matched to you
        </PageTitle>

        {highRisk ? (
          // Reached by redirecting straight from the assessment, so the safety
          // message has to be rendered here rather than on a page we skipped.
          <Alert
            tone="warning"
            title="Please talk to someone now"
            action={
              <div className="flex flex-wrap gap-2">
                <a href="tel:112" className="btn btn-primary btn-sm">
                  Call emergency services
                </a>
                <LinkButton href="/portal/user/support" variant="secondary" size="sm">
                  Open urgent support
                </LinkButton>
              </div>
            }
          >
            What you described suggests you may be in danger. A therapist appointment is not the
            right support for this right now. Please contact your local emergency number or go to
            your nearest emergency department. If you can, tell someone you trust how you are
            feeling.
          </Alert>
        ) : null}

        <SectionTitle>Your matches</SectionTitle>

        {blocked === "no-concern" ? (
          <EmptyState
            icon={<Icon name="assessments" className="h-5 w-5" />}
            title="No current concern on file"
            description="We do not have a current concern for you yet, so there is nothing to match against. The assessment takes a few minutes."
            action={
              <LinkButton href="/portal/user/assessment">Start the assessment</LinkButton>
            }
          />
        ) : data === null && error ? (
          <EmptyState
            title="We could not load your matches"
            description={error}
            action={<Button onClick={() => void load()}>Try again</Button>}
          />
        ) : data === null ? (
          <LoadingState label="Finding therapists for you" />
        ) : (
          <>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {data.therapists.length === 0 ? (
              <EmptyState
                icon={<Icon name="therapists" className="h-5 w-5" />}
                title="No exact specialty match right now"
                description="No one is listed as a match for that just now. You can still message anyone in the full directory, or check back later."
                action={
                  <LinkButton href="/portal/user/matching/directory">
                    Browse all therapists
                  </LinkButton>
                }
              />
            ) : (
              <Stagger className="space-y-4">
                {data.therapists.map((therapist, index) => (
                  <StaggerItem key={therapist.id}>
                    <MatchCard
                      therapist={therapist}
                      onMessage={startConversation}
                      rank={index + 1}
                    />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
