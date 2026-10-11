"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  apiPost,
  clearSession,
  messageFor,
  saveSession,
  toFieldErrors,
  type AuthResponse,
} from "@/lib/api";
import {
  describeNextStep,
  portalFor,
  signupPath,
  type PortalMeta,
  type Role,
} from "@/lib/portals";
import { useSessionGate } from "@/lib/session-gate";
import { useCubeeForm } from "@/hooks/use-cubee-form";
import { emailState, passwordState, withError } from "@/lib/cubee-form";
import {
  AuthCard,
  AuthLayout,
  FormAlert,
  PasswordField,
  SessionNoticeCard,
  SubmitButton,
  SuccessPanel,
  TextField,
} from "@/components/auth";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export default function LoginForm({
  initialPortal,
  locked = false,
}: {
  initialPortal: PortalMeta;
  locked?: boolean;
}) {
  const [portal, setPortal] = useState<PortalMeta>(initialPortal);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AuthResponse | null>(null);
  const [accepted, setAccepted] = useState<boolean | undefined>(undefined);
  /**
   * Set when the server refuses the sign-in.
   *
   * The API answers "Incorrect email or password" as a banner, not a field
   * error, because it genuinely cannot know which one is wrong - so nothing
   * in `errors` would ever mark the password, and the field whose correctness
   * is unknowable before submit would be the one face that never reacted.
   * The refusal lands there instead, and the banner still carries the full
   * message. Cleared the moment anything is edited: a verdict on old text
   * must not outlive the text.
   */
  const [rejected, setRejected] = useState(false);
  const router = useRouter();
  const { state: gate, signOut } = useSessionGate(portal.key);

  // Live shape, with the form's own error folded in - the rules below cannot
  // see that the server rejected a password, and `errors` is the authoritative
  // word on that. Submit still owns the real check; nothing here can allow one.
  const fields = {
    email: withError(emailState(email), errors.email),
    password: rejected || errors.password ? "wrong" : passwordState(password),
  };
  const { mood } = useCubeeForm(fields, accepted);

  function selectPortal(key: Role) {
    const next = portalFor(key);
    if (next) setPortal(next);
    setAccepted(undefined);
  }

  /** Any edit retires the last outcome - a reaction must never outlive its cause. */
  function resetOutcome() {
    if (accepted !== undefined) setAccepted(undefined);
    if (rejected) setRejected(false);
  }

  /**
   * Retires a field's error as soon as it is edited. Without this a password
   * the server rejected would keep Cubee angry while it was being fixed, and
   * the field's own live state - which says the shape is right again - would
   * be overruled by a verdict on text that no longer exists.
   */
  function clearFieldError(key: string) {
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccepted(undefined);
    setRejected(false);

    const nextErrors: Record<string, string> = {};
    if (!EMAIL_PATTERN.test(email.trim())) nextErrors.email = "Enter a valid email address";
    if (!password) nextErrors.password = "Password is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setAccepted(false);
      return;
    }

    setPending(true);
    setBanner(null);

    try {
      const data = await apiPost<AuthResponse>("/api/auth/login", {
        email: email.trim(),
        password,
        portal: portal.key,
      });

      // Each portal keeps its own accounts: never keep a session that was
      // issued for a different portal.
      if (data.user.role !== portal.key) {
        clearSession();
        const other = portalFor(data.user.role);
        setBanner(
          `That account belongs to the ${other?.portal ?? "platform"}. Sign in there, or create a ${portal.portal} account.`
        );
        setAccepted(false);
        return;
      }

      saveSession(data.token);
      setAccepted(true);
      setResult(data);
    } catch (error) {
      setBanner(messageFor(error));
      setErrors(toFieldErrors(error));
      setRejected(true);
      setAccepted(false);
    } finally {
      setPending(false);
    }
  }

  const signedInPortal = result ? portalFor(result.user.role) : null;

  return (
    <AuthLayout
      mode="login"
      portal={portal}
      onSelectPortal={selectPortal}
      formMood={mood}
      locked={locked}
    >
      {result ? (
        <SuccessPanel
          title={result.user.fullName ? `Welcome back, ${result.user.fullName}` : "Welcome back"}
          detail={`Signed in to the ${signedInPortal?.portal ?? "Kindred Tap"} as ${result.user.email}.`}
          nextStep={describeNextStep(result.next)}
          actionLabel="Continue"
          onContinue={() => window.location.assign(result.next)}
        />
      ) : gate.kind === "checking" ? (
        <AuthCard>
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Checking your session...
          </p>
        </AuthCard>
      ) : gate.kind === "wrong" ? (
        <SessionNoticeCard
          title={`This page signs you in to the ${portal.portal}`}
          detail={
            gate.actual
              ? `You are signed in as ${gate.user.email}, a ${gate.actual.portal} account.`
              : `You are signed in as ${gate.user.email}, which does not belong to a portal yet.`
          }
          note={`Every portal has its own account. Sign out to use a ${portal.portal} account, or create one if you do not have it yet.`}
          primaryLabel="Sign out and continue"
          onPrimary={() => void signOut()}
          secondaryLabel={gate.actual ? `Go to the ${gate.actual.portal}` : undefined}
          onSecondary={
            gate.actual ? () => router.push(`/portal/${gate.actual!.key}`) : undefined
          }
        />
      ) : gate.kind === "same" ? (
        <SessionNoticeCard
          title={`You are signed in to the ${portal.portal}`}
          detail={`${gate.user.email}${gate.user.fullName ? ` · ${gate.user.fullName}` : ""}`}
          primaryLabel="Continue to my portal"
          onPrimary={() => window.location.assign(gate.next)}
          secondaryLabel="Sign out"
          onSecondary={() => void signOut()}
        />
      ) : (
        <AuthCard>
          <header>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Sign in to the {portal.portal}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{portal.tagline}</p>
          </header>

          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
            {banner ? <FormAlert>{banner}</FormAlert> : null}

            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearFieldError("email");
                resetOutcome();
              }}
              error={errors.email}
              cubee={fields.email}
              required
            />

            <PasswordField
              label="Password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFieldError("password");
                resetOutcome();
              }}
              error={errors.password}
              cubee={fields.password}
              required
            />

            <SubmitButton pending={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </SubmitButton>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No {portal.portal} account yet?{" "}
            <Link
              href={signupPath(portal.key)}
              className="font-semibold text-teal-700 hover:underline dark:text-teal-300"
            >
              Create one
            </Link>
          </p>
        </AuthCard>
      )}
    </AuthLayout>
  );
}
