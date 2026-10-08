"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePortalGuard, GuardSplash, SignedOutPanel } from "@/components/portal-guard";
import { DashboardShell } from "@/components/dashboard";
import { Alert, Badge, Button, EmptyState, LoadingState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiFetch, messageFor } from "@/lib/api";
import { portalFor } from "@/lib/portals";
import { titleCaseList } from "@/lib/support";
import type { MatchedTherapist } from "@/lib/clinical";

const ROLE = "user";

interface TherapistDetailResponse {
  therapist: MatchedTherapist;
  coversYourConcern: { key: string; label: string }[];
  available: boolean;
}

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

/**
 * A single therapist, reached from the match results.
 *
 * Reads `GET /api/matching/therapists/:id`, which returns the safe matching
 * projection plus which of the caller's concerns this person covers. It
 * deliberately does not reuse the directory endpoint: this page is reached from
 * a matched context and needs the match explanation. Both project away contact
 * details.
 */
export default function TherapistProfile({ therapistId }: { therapistId: string }) {
  const router = useRouter();
  const guard = usePortalGuard(ROLE);
  const portal = portalFor(ROLE);

  const [data, setData] = useState<TherapistDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(
        await apiFetch<TherapistDetailResponse>(
          `/api/matching/therapists/${therapistId}`,
          { method: "GET" }
        )
      );
    } catch (err) {
      setError(messageFor(err));
    }
  }, [therapistId]);

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

  async function startConversation() {
    if (!data) return;
    setBusy(true);
    try {
      const created = await apiFetch<{ conversationId: string }>("/api/support/conversations", {
        method: "POST",
        body: { therapistId: data.therapist.id },
      });
      router.push(`/portal/user/messages/${created.conversationId}`);
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  const t = data?.therapist;

  return (
    <DashboardShell portal={portal!} user={guard.user}>
      <div className="space-y-6">
        <Link
          href="/portal/user/matching"
          className="inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-teal-700 transition hover:text-teal-900 hover:underline dark:text-teal-300 dark:hover:text-teal-100"
        >
          <Icon name="arrowLeft" className="h-3.5 w-3.5" />
          Back to your matches
        </Link>

        {data !== null && error ? <Alert tone="warning">{error}</Alert> : null}

        {data === null && error ? (
          <EmptyState
            title="We could not load this profile"
            description={error}
            action={<Button onClick={() => void load()}>Try again</Button>}
          />
        ) : data === null ? (
          <LoadingState label="Loading profile" />
        ) : t ? (
          <article className="card p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-sm font-semibold text-teal-800 dark:bg-teal-500/10 dark:text-teal-300">
                {initialsFor(t.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  {t.fullName}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {t.discipline}
                  {t.registrationBody ? ` · ${t.registrationBody}` : ""}
                </p>
                {t.registrationVerified ? (
                  <Badge tone="success" dot>
                    Registration verified
                  </Badge>
                ) : null}
              </div>
            </div>

            {data.coversYourConcern.length > 0 ? (
              <p className="mt-4 rounded-2xl bg-teal-50 px-4 py-3 text-xs leading-5 text-teal-900 dark:bg-teal-500/10 dark:text-teal-100">
                Works with{" "}
                <span className="font-semibold">
                  {sentence(titleCaseList(data.coversYourConcern.map((c) => c.label)))}
                </span>
                , which you told us you are dealing with.
              </p>
            ) : null}

            {t.bio ? (
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{t.bio}</p>
            ) : null}

            <dl className="mt-5 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Specialties</dt>
                <dd className="mt-0.5 text-slate-700 dark:text-slate-200">
                  {titleCaseList(t.specialties) || "Not listed yet"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Approaches</dt>
                <dd className="mt-0.5 text-slate-700 dark:text-slate-200">
                  {titleCaseList(t.modalities) || "Not listed yet"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Languages</dt>
                <dd className="mt-0.5 text-slate-700 dark:text-slate-200">
                  {titleCaseList(t.languages) || "Not listed yet"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Experience</dt>
                <dd className="mt-0.5 text-slate-700 dark:text-slate-200">
                  {t.yearsExperience ? `${t.yearsExperience} years` : "Not listed"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Availability</dt>
                <dd className="mt-0.5 text-slate-700 dark:text-slate-200">
                  {data.available ? (
                    <>
                      {typeof t.availabilityHoursPerWeek === "number"
                        ? `${t.availabilityHoursPerWeek} hrs/week`
                        : "Hours not listed"}
                      {t.acceptingNewCases ? " · taking new people" : ""}
                    </>
                  ) : (
                    "Not taking new people at the moment"
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Session fee</dt>
                <dd className="mt-0.5 text-slate-700 dark:text-slate-200">
                  {t.sessionFee === null || t.sessionFee === undefined
                    ? "Not listed"
                    : `${t.currency ?? ""} ${t.sessionFee}`.trim()}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex items-center gap-3">
              <Button loading={busy} onClick={startConversation}>
                Message
              </Button>
              {!data.available ? (
                <span className="text-xs text-slate-500 dark:text-slate-500">
                  They will reply when they have space.
                </span>
              ) : null}
            </div>
          </article>
        ) : null}
      </div>
    </DashboardShell>
  );
}
