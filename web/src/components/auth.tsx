"use client";

import {
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PORTALS, type PortalMeta, type Role } from "@/lib/portals";
import type { FormMood } from "@/lib/cubee-form";
import { PortalIcon } from "@/components/portal-icon";
import { Button, primaryButtonClass as uiPrimaryButtonClass } from "@/components/ui";
import { Cubee } from "@/components/cubee";
import { Logo } from "@/components/logo";

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

interface AuthLayoutProps {
  mode: "login" | "signup";
  portal: PortalMeta | null;
  onSelectPortal: (key: Role) => void;
  /**
   * Set on `/login/<portal>` and `/signup/<portal>`: this page stays on its
   * own portal, so clicking a different one opens that portal's page.
   */
  locked?: boolean;
  children: ReactNode;
}

export function AuthLayout({
  mode,
  portal,
  onSelectPortal,
  locked = false,
  children,
}: AuthLayoutProps) {
  const router = useRouter();

  const pickPortal = (key: Role) => {
    if (locked && key !== portal?.key) {
      router.push(`/${mode}/${key}`);
      return;
    }
    onSelectPortal(key);
  };
  return (
    <div className="auth-shell min-h-dvh bg-slate-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <aside className="hidden flex-col justify-center border-r border-slate-200 bg-[#f8f6f1] p-8 lg:flex lg:p-10">
          <div className="mx-auto w-full max-w-xl">
            <Link href="/" aria-label="Kindred Tap home" className="inline-flex rounded-md">
              <Logo className="h-12 w-auto" />
            </Link>
            <h2 className="mt-10 max-w-lg text-3xl font-medium leading-tight tracking-tight text-slate-900">
              {mode === "login"
                ? "A separate workspace for every role in care"
                : "Choose the care space that fits your role"}
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">
              {mode === "login"
                ? locked
                  ? `Every portal has its own account. This page is for the ${
                      portal?.portal ?? "selected portal"
                    }.`
                  : "Choose the portal that matches your role. Each one has its own account and workspace."
                : "Each portal has a separate account and workspace. Professional portals include an ethical agreement as part of signup."}
            </p>

            {mode === "login" ? (
              <>
                <p className="mt-8 text-xs font-medium text-slate-500">
                  {locked ? "Portals" : "Your portal"}
                </p>
                <div
                  className="mt-2 grid gap-1 border-y border-slate-200 py-2"
                  role="radiogroup"
                  aria-label="Portal"
                >
        {PORTALS.filter((item) => item.key !== "clinical_supervisor").map((item) => {
                    const active = portal?.key === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => pickPortal(item.key)}
                        className={`flex min-h-10 items-center gap-3 border-l-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 auth-focus ${
                          active
                            ? "border-transparent auth-accent-selected"
                            : "border-transparent text-slate-600 hover:bg-white"
                        }`}
                      >
                        <PortalIcon
                          role={item.key}
                          className={`h-4 w-4 ${active ? "auth-accent" : "text-slate-500"}`}
                        />
                        <span className="flex-1 font-medium">{item.portal}</span>
                        {item.requiresEthics ? (
                          <span className="text-xs text-slate-500">Ethics agreement</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {portal ? (
                  <div className="mt-6 border-t border-slate-200 pt-5">
                    <p className="text-sm font-medium text-slate-900">{portal.tagline}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{portal.description}</p>
                    <ol className="mt-4 space-y-2">
                      {portal.journey.map((step, index) => (
                        <li key={step} className="flex items-start gap-3 text-sm text-slate-600">
                          <span className="w-5 shrink-0 font-mono text-xs tabular-nums auth-accent">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </aside>

        {/* Form column */}
        <main className="flex flex-1 flex-col justify-center px-5 py-8 sm:px-8 lg:px-12">
          {mode === "login" ? (
            <div className="w-full max-w-lg lg:hidden">
              <Link href="/" aria-label="Kindred Tap home" className="inline-flex rounded-md">
                <Logo className="h-11 w-auto" />
              </Link>
              <p className="mt-3 text-sm text-slate-600">
                {locked && portal
                  ? `Sign in to the ${portal.portal}.`
                  : portal?.tagline ?? "Choose your portal to get started."}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Portal">
                {PORTALS.map((item) => {
                  const active = portal?.key === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => pickPortal(item.key)}
                      className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 auth-focus sm:text-sm ${
                        active
                          ? "auth-accent-fill"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <PortalIcon role={item.key} className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="lg:hidden">
              <Link href="/" aria-label="Kindred Tap home" className="inline-flex rounded-md">
                <Logo className="h-11 w-auto" />
              </Link>
            </div>
          )}

          <div className="mt-6 w-full max-w-lg lg:mt-0">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return <div className="card rounded-xl p-6 shadow-none sm:p-8">{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Form primitives                                                     */
/* ------------------------------------------------------------------ */

export const primaryButtonClass = `${uiPrimaryButtonClass} w-full`;

export function AuthCubee({ mood }: { mood: FormMood }) {
  return (
    <span
      className="shrink-0 self-start animate-cubee-react"
      aria-hidden="true"
    >
      <Cubee mood={mood} size={64} label="" />
    </span>
  );
}

interface FieldProps extends Omit<ComponentPropsWithoutRef<"input">, "className"> {
  label: string;
  error?: string;
  hint?: string;
}

function FieldShell({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const note = error ?? hint;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {note ? (
        <p
          id={`${id}-note`}
          className={
            error
              ? "mt-1.5 text-xs font-medium text-red-600 dark:text-red-400"
              : "mt-1.5 text-xs text-slate-500 dark:text-slate-400"
          }
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({ label, error, hint, id, ...inputProps }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint}>
      <input
        id={fieldId}
        {...inputProps}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ?? hint ? `${fieldId}-note` : undefined}
        className="field"
      />
    </FieldShell>
  );
}

export function PasswordField({
  label,
  error,
  hint,
  id,
  ...inputProps
}: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [visible, setVisible] = useState(false);

  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint}>
      <div className="relative">
        <input
          id={fieldId}
          {...inputProps}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ?? hint ? `${fieldId}-note` : undefined}
          className="field pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
        >
          {visible ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4.5 w-4.5"
              aria-hidden="true"
            >
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
              <path d="M6.6 6.7C4.7 7.9 3.2 9.8 2.5 12c1.5 4 5.2 6.5 9.5 6.5 1.6 0 3.1-.4 4.4-1.1" />
              <path d="M17.9 15.4c1.6-1.2 2.8-2.8 3.6-3.4-1.5-4-5.2-6.5-9.5-6.5-.8 0-1.6.1-2.3.3" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4.5 w-4.5"
              aria-hidden="true"
            >
              <path d="M2.5 12C4 8 7.7 5.5 12 5.5s8 2.5 9.5 6.5C20 16 16.3 18.5 12 18.5S4 16 2.5 12Z" />
              <circle cx="12" cy="12" r="2.8" />
            </svg>
          )}
        </button>
      </div>
    </FieldShell>
  );
}

export function Checkbox({
  id,
  label,
  checked,
  onChange,
  error,
}: {
  id?: string;
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div>
      <div className="flex items-start gap-2.5">
        <input
          id={fieldId}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-teal-700 dark:border-slate-600"
        />
        <label
          htmlFor={fieldId}
          className="cursor-pointer text-sm leading-5 text-slate-600 dark:text-slate-400"
        >
          {label}
        </label>
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4.5M12 16h.01" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" loading={pending} className="w-full">
      {children}
    </Button>
  );
}

export function SuccessPanel({
  title,
  detail,
  nextStep,
  actionLabel,
  onContinue,
}: {
  title: string;
  detail: string;
  nextStep: string;
  actionLabel: string;
  onContinue: () => void;
}) {
  return (
    <AuthCard>
      <div className="flex flex-col items-center py-4 text-center">
        <span aria-hidden="true" className="animate-cubee-react">
          <Cubee mood="happy" size={72} label="" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{detail}</p>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{nextStep}</p>
        <button type="button" onClick={onContinue} className={`mt-6 ${primaryButtonClass}`}>
          {actionLabel}
        </button>
      </div>
    </AuthCard>
  );
}

/* ------------------------------------------------------------------ */
/* Session notice (shown instead of the form)                          */
/* ------------------------------------------------------------------ */

/**
 * Used by both auth pages when a session already exists: the account either
 * belongs to this portal (continue) or to another one (sign out first, then
 * use an account for this portal).
 */
export function SessionNoticeCard({
  title,
  detail,
  note,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  detail: string;
  note?: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <AuthCard>
      <div className="flex flex-col items-center py-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <circle cx="12" cy="8.5" r="3.5" />
            <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
          </svg>
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{detail}</p>
        {note ? (
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-300">
            {note}
          </p>
        ) : null}
        <button type="button" onClick={onPrimary} className={`mt-6 ${primaryButtonClass}`}>
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            className="mt-3 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </AuthCard>
  );
}

/* ------------------------------------------------------------------ */
/* Portal picker (signup)                                              */
/* ------------------------------------------------------------------ */

export function PortalPicker({
  value,
  onChange,
  error,
}: {
  value: PortalMeta | null;
  onChange: (portal: PortalMeta) => void;
  error?: string;
}) {
  return (
    <div>
      <p className="field-label">Choose a portal</p>
      <div
        className="grid grid-cols-2 gap-2"
        role="radiogroup"
        aria-label="Portal"
        aria-invalid={error ? true : undefined}
      >
        {PORTALS.map((item) => {
          const active = value?.key === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(item)}
              className={`auth-focus flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                active
                  ? "auth-accent-selected font-medium"
                  : "border-slate-200 bg-white font-medium text-slate-600 hover:border-slate-400"
              }`}
            >
              <PortalIcon
                role={item.key}
                className={`h-4 w-4 shrink-0 ${active ? "auth-accent" : "text-slate-500"}`}
              />
              <span className="leading-5">{item.portal}</span>
            </button>
          );
        })}
      </div>
      {value ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          <span className="font-medium text-slate-700">{value.portal}.</span>{" "}
          {value.description}
          {value.requiresEthics ? " Requires the professional ethical agreement." : ""}
        </p>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
