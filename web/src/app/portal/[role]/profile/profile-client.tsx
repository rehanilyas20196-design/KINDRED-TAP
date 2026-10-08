"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, messageFor, toFieldErrors } from "@/lib/api";
import { portalFor } from "@/lib/portals";
import { profileSpecs, initialProfileValues } from "@/lib/profile-specs";
import {
  usePortalGuard,
  GuardSplash,
  SignedOutPanel,
  WrongPortalPanel,
} from "@/components/portal-guard";
import { PortalPageShell, ProfileForm, type ProfileValues } from "@/components/profile-form";
import { LinkButton } from "@/components/ui";

export default function ProfileClient({ role }: { role: string }) {
  const guard = usePortalGuard(role);
  const [banner, setBanner] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [savedNext, setSavedNext] = useState<string | null>(null);

  const spec = profileSpecs[role];
  const portal = portalFor(role);

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <WrongPortalPanel expected={guard.expected} actual={guard.actual} />;
  }

  if (!spec || !portal) {
    return (
      <GuardSplash label="">
        <div className="card max-w-sm p-6 text-center">
          <h1 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Unknown portal
          </h1>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            This link does not point at a portal we know.{" "}
            <Link href="/login" className="font-semibold text-teal-700 dark:text-teal-300">
              Back to login
            </Link>
          </p>
        </div>
      </GuardSplash>
    );
  }

  const { user, profile } = guard;

  async function onSubmit(values: ProfileValues) {
    setPending(true);
    setBanner(null);
    setErrors({});

    const payload: Record<string, unknown> = { ...values, termsAccepted: true };
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) delete payload[key];
    }

    try {
      const data = await apiFetch<{ next: string }>(`/api/profiles/${role}`, {
        method: "PUT",
        body: payload,
      });
      setSavedNext(data.next ?? `/portal/${role}`);
    } catch (error) {
      setBanner(messageFor(error));
      setErrors(toFieldErrors(error));
    } finally {
      setPending(false);
    }
  }

  if (savedNext) {
    return (
      <GuardSplash label="">
        <div className="card p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true" focusable="false">
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
            {portal.portal} is ready
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Your profile has been saved, {user.fullName?.split(" ")[0] ?? "welcome"}.
          </p>
          <LinkButton href={savedNext} className="mt-6 w-full">
            Continue
          </LinkButton>
        </div>
      </GuardSplash>
    );
  }

  return (
    <PortalPageShell
      portal={portal}
      title={portal.requiresEthics ? "Set up your practice profile" : "Tell us about you"}
      subtitle={
        portal.requiresEthics
          ? `${portal.description} The details below help us route cases and keep standards high.`
          : `${portal.description} Only what you share here is used to find your match.`
      }
    >
      <ProfileForm
        spec={spec}
        initial={initialProfileValues(spec, profile)}
        submitLabel="Save and continue"
        pending={pending}
        banner={banner}
        errors={errors}
        onSubmit={onSubmit}
      />
    </PortalPageShell>
  );
}
