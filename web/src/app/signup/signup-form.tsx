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
  ETHICS_VERSION,
  loginPath,
  portalFor,
  type PortalMeta,
  type Role,
} from "@/lib/portals";
import { useSessionGate } from "@/lib/session-gate";
import {
  AuthCard,
  AuthLayout,
  Checkbox,
  FormAlert,
  PasswordField,
  PortalPicker,
  SessionNoticeCard,
  SubmitButton,
  SuccessPanel,
  TextField,
} from "@/components/auth";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export default function SignupForm({
  initialPortal,
  locked = false,
}: {
  initialPortal: PortalMeta | null;
  locked?: boolean;
}) {
  const [portal, setPortal] = useState<PortalMeta | null>(initialPortal);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ethicsAccepted, setEthicsAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AuthResponse | null>(null);
  const router = useRouter();
  const { state: gate, signOut } = useSessionGate(portal?.key ?? "user");

  function selectPortal(next: PortalMeta) {
    setPortal(next);
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => key !== "role" && key !== "ethicsAccepted"
        )
      )
    );
  }

  function selectPortalByRole(key: Role) {
    const next = portalFor(key);
    if (next) selectPortal(next);
  }

  function validate(): Record<string, string> {
    const nextErrors: Record<string, string> = {};

    if (fullName.trim().length < 2) nextErrors.fullName = "Enter your full name";
    if (!EMAIL_PATTERN.test(email.trim())) nextErrors.email = "Enter a valid email address";

    if (password.length < 8) {
      nextErrors.password = "Use at least 8 characters";
    } else if (!(/[A-Za-z]/.test(password) && /\d/.test(password))) {
      nextErrors.password = "Include at least one letter and one number";
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Confirm your password";
    } else if (confirmPassword !== password) {
      nextErrors.confirmPassword = "Passwords do not match";
    }

    if (!portal) nextErrors.role = "Choose the portal you are signing up for";
    if (!termsAccepted) nextErrors.termsAccepted = "You must accept the terms to continue";
    if (portal?.requiresEthics && !ethicsAccepted) {
      nextErrors.ethicsAccepted = "Professionals must accept the ethical agreement";
    }

    return nextErrors;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !portal) return;

    setPending(true);
    setBanner(null);

    try {
      const data = await apiPost<AuthResponse>("/api/auth/signup", {
        email: email.trim(),
        password,
        confirmPassword,
        fullName: fullName.trim(),
        role: portal.key,
        termsAccepted: true,
        ethicsAccepted: portal.requiresEthics ? true : false,
      });

      if (data.user.role !== portal.key) {
        clearSession();
        setBanner(`That account was created for a different portal. Sign up for the ${portal.portal} instead.`);
        return;
      }

      saveSession(data.token);
      setResult(data);
    } catch (error) {
      setBanner(messageFor(error));
      setErrors(toFieldErrors(error));
    } finally {
      setPending(false);
    }
  }

  const signedUpPortal = result ? portalFor(result.user.role) : null;

  return (
    <AuthLayout mode="signup" portal={portal} onSelectPortal={selectPortalByRole} locked={locked}>
      {result ? (
        <SuccessPanel
          title={`Welcome to ${signedUpPortal?.portal ?? "Kindred Tap"}`}
          detail={`Account created for ${result.user.email}.`}
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
          title={`Create a ${portal?.portal ?? "Kindred Tap"} account`}
          detail={
            gate.actual
              ? `You are signed in as ${gate.user.email}, a ${gate.actual.portal} account.`
              : `You are signed in as ${gate.user.email}, which does not belong to a portal yet.`
          }
          note={`Sign-up is per portal. Sign out to create a ${
            portal?.portal ?? "Kindred Tap"
          } account, or open your ${gate.actual?.portal ?? "other"} portal if you already have one.`}
          primaryLabel="Sign out and continue"
          onPrimary={() => void signOut()}
          secondaryLabel={gate.actual ? `Go to the ${gate.actual.portal}` : undefined}
          onSecondary={
            gate.actual ? () => router.push(`/portal/${gate.actual!.key}`) : undefined
          }
        />
      ) : gate.kind === "same" && portal ? (
        <SessionNoticeCard
          title={`You already have a ${portal.portal} account`}
          detail={gate.user.email}
          note="Sign out first if you want to create a different account."
          primaryLabel="Go to my portal"
          onPrimary={() => window.location.assign(gate.next)}
          secondaryLabel="Sign out"
          onSecondary={() => void signOut()}
        />
      ) : (
        <AuthCard>
          <header>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {portal ? `Join the ${portal.portal}` : "Create your account"}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {portal ? portal.tagline : "Choose your portal and we will set everything up."}
            </p>
          </header>

          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
            {banner ? <FormAlert>{banner}</FormAlert> : null}

            <TextField
              label="Full name"
              type="text"
              autoComplete="name"
              placeholder="Alex Morgan"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              error={errors.fullName}
              required
            />

            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={errors.email}
              required
            />

            <PasswordField
              label="Password"
              autoComplete="new-password"
              placeholder="Create a password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={errors.password}
              hint="At least 8 characters, including a letter and a number."
              required
            />

            <PasswordField
              label="Confirm password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              error={errors.confirmPassword}
              required
            />

            {locked && portal ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                Creating a <span className="font-semibold">{portal.portal}</span> account.
                {portal.requiresEthics ? " The ethical agreement applies." : ""}
              </div>
            ) : (
              <PortalPicker value={portal} onChange={selectPortal} error={errors.role} />
            )}

            <Checkbox
              checked={termsAccepted}
              onChange={setTermsAccepted}
              error={errors.termsAccepted}
              label="I agree to the Terms of Service and the Privacy Policy."
            />

            {portal?.requiresEthics ? (
              <Checkbox
                checked={ethicsAccepted}
                onChange={setEthicsAccepted}
                error={errors.ethicsAccepted}
                label={`I accept the professional code of conduct and ethical agreement (v${ETHICS_VERSION}), including confidentiality, safeguarding and escalation duties.`}
              />
            ) : null}

            <SubmitButton pending={pending}>
              {pending ? "Creating account..." : "Create account"}
            </SubmitButton>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {portal ? `Already have a ${portal.portal} account?` : "Already have an account?"}{" "}
            <Link
              href={loginPath(portal?.key)}
              className="font-semibold text-teal-700 hover:underline dark:text-teal-300"
            >
              Sign in
            </Link>
          </p>
        </AuthCard>
      )}
    </AuthLayout>
  );
}
