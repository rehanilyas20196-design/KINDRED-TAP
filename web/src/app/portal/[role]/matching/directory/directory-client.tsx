"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "@/components/ui";
import { apiFetch, messageFor } from "@/lib/api";
import { portalFor } from "@/lib/portals";
import { formatFee, titleCaseList, type DirectoryResponse, type Therapist } from "@/lib/support";

const ROLE = "user";

const TITLE_PATTERN = /^(dr|mr|mrs|ms|miss|prof|professor|rev)\.?$/i;

function initialsFor(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part && !TITLE_PATTERN.test(part))
    .slice(0, 2);
  if (!parts.length) return "?";
  return parts.map((part) => part[0]?.toUpperCase()).join("");
}

function TherapistCard({ therapist, onMessage }: {
  therapist: Therapist;
  onMessage: (therapist: Therapist) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <article className="card card-interactive p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-sm font-semibold text-teal-800 dark:bg-teal-500/10 dark:text-teal-300">
          {initialsFor(therapist.fullName)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {therapist.fullName}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {therapist.discipline}
          </p>
          {therapist.registrationVerified ? (
            <Badge tone="success" dot>
              Registration verified
            </Badge>
          ) : null}
        </div>
      </div>

      {therapist.bio ? (
        <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{therapist.bio}</p>
      ) : null}

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500 dark:text-slate-400">Works with</dt>
          <dd className="text-slate-700 dark:text-slate-200">
            {titleCaseList(therapist.clinicalAreas) || "Not listed yet"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500 dark:text-slate-400">Approaches</dt>
          <dd className="text-slate-700 dark:text-slate-200">
            {titleCaseList(therapist.modalities) || "Not listed yet"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500 dark:text-slate-400">Languages</dt>
          <dd className="text-slate-700 dark:text-slate-200">
            {titleCaseList(therapist.languages) || "Not listed yet"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500 dark:text-slate-400">Experience</dt>
          <dd className="text-slate-700 dark:text-slate-200">
            {therapist.yearsExperience} {therapist.yearsExperience === 1 ? "year" : "years"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500 dark:text-slate-400">Session fee</dt>
          <dd className="text-slate-700 dark:text-slate-200">
            {formatFee(therapist.sessionFee, therapist.currency)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500 dark:text-slate-400">Availability</dt>
          <dd className="text-slate-700 dark:text-slate-200">
            {therapist.acceptingNewCases ? "Taking new people" : "Waiting list"}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await onMessage(therapist);
            setBusy(false);
          }}
        >
          Message
        </Button>
        <LinkButton href={`/portal/user/matching/${therapist.id}`} variant="secondary" size="sm">
          View profile
        </LinkButton>
        {!therapist.acceptingNewCases ? (
          <span className="text-xs text-slate-500 dark:text-slate-500">
            They will reply when they have space.
          </span>
        ) : null}
      </div>
    </article>
  );
}

export default function TherapistDirectory() {
  const router = useRouter();
  const guard = usePortalGuard(ROLE);
  const portal = portalFor(ROLE);

  const [therapists, setTherapists] = useState<Therapist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [area, setArea] = useState("");
  const [language, setLanguage] = useState("");

  const load = useCallback(async (nextArea: string, nextLanguage: string) => {
    setTherapists(null);
    setError(null);
    try {
      const search = new URLSearchParams();
      if (nextArea) search.set("area", nextArea);
      if (nextLanguage) search.set("language", nextLanguage);
      const suffix = search.toString() ? `?${search}` : "";
      const data = await apiFetch<DirectoryResponse>(`/api/support/therapists${suffix}`);
      setTherapists(data.therapists);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    if (guard.kind !== "ready") return;
    const timer = window.setTimeout(() => {
      void load(area, language);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [guard.kind, area, language, load]);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <GuardSplash label="This page is for the Person seeking support portal." />;
  }

  async function startConversation(therapist: Therapist) {
    try {
      const data = await apiFetch<{ conversationId: string }>("/api/support/conversations", {
        method: "POST",
        body: { therapistId: therapist.id },
      });
      router.push(`/portal/user/messages/${data.conversationId}`);
    } catch (err) {
      setError(messageFor(err));
    }
  }

  return (
    <DashboardShell portal={portal!} user={guard.user}>
      <div className="space-y-6">
        <PageTitle
          eyebrow="Directory"
          description="Anyone here can be messaged directly. Nothing is shared with a therapist until you write first."
          action={
            <LinkButton href="/portal/user/messages" variant="secondary" size="sm">
              My messages
            </LinkButton>
          }
        >
          Therapists available to you
        </PageTitle>

        <section className="flex flex-wrap gap-3">
          <label className="block text-xs">
            <span className="mb-1.5 block font-semibold text-slate-600 dark:text-slate-300">
              Concern
            </span>
            <input
              value={area}
              onChange={(event) => setArea(event.target.value)}
              placeholder="anxiety"
              className="field w-full sm:w-44"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1.5 block font-semibold text-slate-600 dark:text-slate-300">
              Language
            </span>
            <input
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder="English"
              className="field w-full sm:w-44"
            />
          </label>
        </section>

        {error && therapists === null ? (
          <EmptyState
            title="We could not load the directory"
            description={error}
            action={<Button onClick={() => void load(area, language)}>Try again</Button>}
          />
        ) : therapists === null ? (
          <LoadingState label="Loading therapists" />
        ) : (
          <>
            {error ? <Alert tone="warning">{error}</Alert> : null}
            {therapists.length === 0 ? (
              <EmptyState
                title="No therapists match that yet"
                description="Clear the filters to see everyone available to you."
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setArea("");
                      setLanguage("");
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <div className="space-y-4">
                {therapists.map((therapist) => (
                  <TherapistCard
                    key={therapist.id}
                    therapist={therapist}
                    onMessage={startConversation}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
