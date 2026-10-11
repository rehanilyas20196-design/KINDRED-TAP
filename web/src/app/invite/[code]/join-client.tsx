"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { messageFor } from "@/lib/api";
import { fetchInviteStatus, scanInvite, type ScannerView } from "@/lib/invites";
import { Logo } from "@/components/logo";
import { primaryButtonClass } from "@/components/ui";

/**
 * The scanner side of the QR invite flow — reached by scanning the printed
 * or shared code. Three stages:
 *
 *  1. Form — the person says who they are (email is the identity).
 *  2. Waiting — the request sits on the owner's account until they accept.
 *  3. Outcome — accepted: claim the session straight away and continue to
 *     the profile page; declined/closed: "authentication failed".
 */
export default function InviteJoinClient({ code }: { code: string }) {
  const [state, setState] = useState<ScannerView | null>(null);
  const [stage, setStage] = useState<"loading" | "form" | "waiting" | "accepted" | "failed">(
    "loading"
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());

  /** Map the public status to a stage, without ever showing owner details. */
  const applyView = useCallback((view: ScannerView) => {
    setState(view);
    if (view.state === "awaiting_decision") {
      setStage("waiting");
      setEmail(view.email ?? email);
    } else if (view.state === "pending") {
      setStage("form");
    } else if (view.state === "used") {
      // Only used-and-approved views surface here through refresh; the live
      // acceptance flow hands the token straight to the joiner below.
      setStage("failed");
      setError(
        "This QR code has already been completed. Ask the person who shared it for the next step."
      );
    } else {
      setStage("failed");
      setError(
        view.state === "declined"
          ? "Authentication failed — your request was not accepted by the account that shared this code."
          : "Authentication failed — this QR code is no longer active."
      );
    }
  }, [email]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const view = await fetchInviteStatus(code);
        if (!cancelled) applyView(view);
      } catch (err) {
        if (!cancelled) {
          setStage("failed");
          setError(messageFor(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [code, applyView]);

  /** While waiting, poll the status so Accept lands the joiner right away. */
  function startPolling() {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const view = await fetchInviteStatus(code);
        if (view.state === "used") {
          stopPolling();
          await claimSession();
        } else if (view.state !== "pending" && view.state !== "awaiting_decision") {
          stopPolling();
          applyView(view);
        }
      } catch {
        // Transient network trouble: keep polling on the next tick.
      }
    }, 3_000);
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  async function claimSession() {
    setJoining(true);
    try {
      const { apiPost, saveSession } = await import("@/lib/api");
      const data = await apiPost<{ ok: boolean; token: string; next: string }>(
        `/api/invites/${encodeURIComponent(code)}/claim`,
        {}
      );
      saveSession(data.token);
      window.location.assign(data.next);
    } catch (err) {
      setStage("failed");
      setError(messageFor(err));
      setJoining(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (fullName.trim().length < 2) {
      setError("Enter your full name");
      return;
    }
    if (!isEmail(email)) {
      setError("Enter a valid email address");
      return;
    }

    setPending(true);
    try {
      const result = await scanInvite(code, {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        note: note.trim() || undefined,
        device: navigator.userAgent.slice(0, 200),
      });
      setState(result);
      setStage("waiting");
      setEmail(result.email ?? email);
      startPolling();
    } catch (err) {
      const message = messageFor(err);
      setError(message);
      // A used or declined code is terminal; a timing clash can be retried.
      if (/already|expired|no longer/i.test(message)) setStage("failed");
    } finally {
      setPending(false);
    }
  }

  const portalName =
    state?.role === "collaborative_clinic"
      ? "Collaborative Clinic Portal"
      : state?.role === "supporter"
        ? "Supporter Portal"
        : "Kindred Tap";

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <header className="px-6 py-5">
        <Logo className="h-8 w-auto" />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-16">
        <div className="w-full max-w-md">
          {stage === "loading" ? (
            <div className="card p-8 text-center text-sm text-slate-500">Reading the QR code…</div>
          ) : null}

          {stage === "form" ? (
            <div className="card p-6 sm:p-8">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                You scanned a {portalName} invite
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Confirm who you are below. A message will be sent to the account that generated
                this code, and only when they accept it can you use the platform — otherwise you
                will see “authentication failed”.
              </p>

              <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
                {error ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                  >
                    {error}
                  </div>
                ) : null}

                <div>
                  <label htmlFor="join-fullname" className="field-label">
                    Full name
                  </label>
                  <input
                    id="join-fullname"
                    className="field"
                    value={fullName}
                    autoComplete="name"
                    onChange={(event) => setFullName(event.target.value)}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="join-email" className="field-label">
                    Email
                  </label>
                  <input
                    id="join-email"
                    type="email"
                    className="field"
                    value={email}
                    autoComplete="email"
                    placeholder="you@example.com"
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    If you already have a Kindred Tap account, use that email — the invitation
                    attaches to it.
                  </p>
                </div>

                <div>
                  <label htmlFor="join-note" className="field-label">
                    Message to the account owner <span className="font-normal">(optional)</span>
                  </label>
                  <input
                    id="join-note"
                    className="field"
                    value={note}
                    maxLength={500}
                    placeholder="Who you are and why they should accept"
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>

                <button type="submit" className={primaryButtonClass} disabled={pending}>
                  {pending ? "Sending…" : "Request access"}
                </button>
              </form>

              <p className="mt-5 text-center text-xs leading-5 text-slate-400">
                This code is one-time and personal to the person who shared it. Nothing is granted
                until they accept.
              </p>
            </div>
          ) : null}

          {stage === "waiting" ? (
            <div className="card p-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" strokeLinecap="round" />
                </svg>
              </span>
              <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Waiting for authentication
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Your details {state?.email ? `(${state.email}) ` : ""}were sent to the account that
                shared this QR code. Keep this page open — as soon as they accept, you go straight
                in. If they reject it, you will see “authentication failed”.
              </p>
              {error ? (
                <div className="mt-4">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              ) : null}
              {joining ? (
                <p className="mt-4 text-sm font-medium text-teal-700 dark:text-teal-300">
                  Accepted — opening your portal…
                </p>
              ) : null}
              <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">
                Already have access? Sign in instead
              </Link>
            </div>
          ) : null}

          {stage === "accepted" && joining ? (
            <div className="card p-8 text-center text-sm text-slate-500">
              Accepted — opening your portal…
            </div>
          ) : null}

          {stage === "failed" ? (
            <div className="card p-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-6 w-6" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="m9 9 6 6M15 9l-6 6" />
                </svg>
              </span>
              <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Authentication failed
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {error ?? "Your request was not accepted."}
              </p>
              <div className="mt-6 flex flex-col items-center gap-3">
                <Link href="/login" className={primaryButtonClass}>
                  Go to sign in
                </Link>
                <Link
                  href="/signup"
                  className="text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  Create your own account
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
