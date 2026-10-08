"use client";

import {
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { PORTALS, type PortalMeta, type Role } from "@/lib/portals";
import { PortalIcon } from "@/components/portal-icon";
import { Button, primaryButtonClass as uiPrimaryButtonClass } from "@/components/ui";
import { Logo } from "@/components/logo";

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */

export function BrandMark({
  className = "h-9 w-9",
  variant = "solid",
}: {
  className?: string;
  variant?: "solid" | "onDark";
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  if (!logoFailed) {
    return (
      <span className={`flex shrink-0 items-center justify-center overflow-hidden ${className}`}>
        <Image
          src="/logo-mark.png"
          alt="Kindred Tap"
          width={96}
          height={96}
          className="h-full w-full object-contain"
          onError={() => setLogoFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl ${
        variant === "onDark" ? "bg-white text-teal-800" : "bg-teal-700 text-white"
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-1/2 w-1/2" aria-hidden="true">
        <path d="M12 20.4C7.1 16.5 3.6 13.4 3.6 9.8 3.6 7.2 5.7 5.2 8 5.2c1.6 0 3.1.8 4 2.1.9-1.3 2.4-2.1 4-2.1 2.3 0 4.4 2 4.4 4.6 0 3.6-3.5 6.7-8.4 10.6Z" />
      </svg>
    </span>
  );
}

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
    <div className="min-h-dvh bg-slate-100">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        {/* Brand panel — desktop */}
        <aside className="relative isolate hidden flex-col justify-between gap-10 overflow-hidden bg-teal-900 p-10 text-teal-50 lg:flex">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-teal-600/25 blur-3xl"
          />
          <div className="relative flex items-center gap-4">
            <Logo variant="onDark" className="h-11 w-auto" />
            <p className="text-xs text-teal-200">Mental health support platform</p>
          </div>

          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-teal-100/80">
              {locked
                ? `Every portal has its own account. This page only signs you in to the ${
                    portal?.portal ?? "selected portal"
                  }.`
                : "Choose where you work and the platform signs you in to that portal's account."}
            </p>

            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-teal-300">
              {locked ? "Portals" : "Your portal"}
            </p>
            <div className="mt-3 grid gap-1.5" role="radiogroup" aria-label="Portal">
              {PORTALS.map((item) => {
                const active = portal?.key === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => pickPortal(item.key)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      active
                        ? "bg-white/15 ring-1 ring-inset ring-teal-200/40"
                        : "hover:bg-white/[0.07]"
                    }`}
                  >
                    <PortalIcon
                      role={item.key}
                      className={`h-5 w-5 ${active ? "text-teal-100" : "text-teal-300"}`}
                    />
                    <span className="flex-1 font-medium text-white">{item.portal}</span>
                    {item.requiresEthics ? (
                      <span className="rounded-full bg-teal-300/15 px-2 py-0.5 text-[10px] font-medium text-teal-100">
                        Ethics agreement
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative rounded-2xl bg-white/[0.07] p-5 ring-1 ring-inset ring-white/10">
            {portal ? (
              <>
                <p className="text-sm font-semibold text-white">{portal.tagline}</p>
                <p className="mt-1 text-xs leading-5 text-teal-100/80">{portal.description}</p>
                <ol className="mt-4 space-y-2">
                  {portal.journey.map((step, index) => (
                    <li key={step} className="flex items-start gap-2.5 text-xs text-teal-100/90">
                      <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-300/20 text-[9px] font-semibold text-teal-100">
                        {index + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-sm text-teal-100/80">
                Select a portal to preview the journey it follows.
              </p>
            )}
          </div>
        </aside>

        {/* Form column */}
        <main className="flex flex-1 flex-col justify-center px-5 py-8 sm:px-10 lg:px-12">
          <div className="lg:hidden">
            <div className="flex items-center gap-2.5">
              <Logo className="h-9 w-auto" />
            </div>
            <div className="no-scrollbar -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {PORTALS.map((item) => {
                const active = portal?.key === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickPortal(item.key)}
                    className={`flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-teal-700 bg-teal-700 text-white"
                        : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    <PortalIcon role={item.key} className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {locked && portal
                ? `This page signs you in to the ${portal.portal}.`
                : portal
                  ? portal.tagline
                  : "Choose your portal to get started."}
            </p>
          </div>

          <div className="mt-6 w-full max-w-md lg:mt-0">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return <div className="card p-6 sm:p-8">{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Form primitives                                                     */
/* ------------------------------------------------------------------ */

export const primaryButtonClass = `${uiPrimaryButtonClass} w-full`;

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

export function PasswordField({ label, error, hint, id, ...inputProps }: FieldProps) {
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
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 transition hover:text-slate-600 dark:hover:text-slate-200"
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
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="m5 12.5 4.5 4.5L19 7" />
          </svg>
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
      <p className="field-label">Which portal are you joining?</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Portal">
        {PORTALS.map((item) => {
          const active = value?.key === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(item)}
              className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs transition ${
                active
                  ? "border-2 border-teal-700 bg-teal-50 font-semibold text-teal-800 dark:border-teal-500 dark:bg-teal-500/10 dark:text-teal-200"
                  : "border border-slate-200 bg-white font-medium text-slate-600 hover:border-teal-400 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-teal-500 dark:hover:text-teal-300"
              }`}
            >
              <PortalIcon role={item.key} className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </div>
      {value ? (
        <p className="mt-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-5 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300">{value.portal}.</span>{" "}
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
