/**
 * Kindred Tap UI primitives.
 *
 * Every surface, button, badge and empty state in the product is built from
 * these so a screen never invents its own radius, shadow or colour. Pages
 * compose them; they never re-declare the styles below.
 */

import Link from "next/link";
import { useEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Cubee } from "@/components/cubee";

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

function buttonCore(variant: ButtonVariant, size: ButtonSize, className: string) {
  return `btn ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`.trim();
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonCore(variant, size, className)}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Link {...rest} className={buttonCore(variant, size, className)}>
      {children}
    </Link>
  );
}

export const primaryButtonClass = buttonCore("primary", "md", "");
export const secondaryButtonClass = buttonCore("secondary", "md", "");

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  className = "",
  children,
  ...rest
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section {...rest} className={`card p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  action,
  description,
  as: Tag = "h2",
}: {
  title: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Tag className="text-[0.9375rem] font-semibold tracking-tight text-slate-900">
          {title}
        </Tag>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Typography                                                          */
/* ------------------------------------------------------------------ */

export function PageTitle({
  children,
  eyebrow,
  description,
  action,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.09em] text-teal-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.75rem]">
          {children}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({
  children,
  detail,
}: {
  children: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-base font-semibold tracking-tight text-slate-900">
        {children}
      </h2>
      {detail ? <span className="text-xs font-medium text-slate-500">{detail}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  accent: "bg-teal-50 text-teal-800 ring-teal-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
};

const DOT_CLASS: Record<Tone, string> = {
  neutral: "bg-slate-400",
  accent: "bg-teal-600",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className = "",
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONE_CLASS[tone]} ${className}`}
    >
      {dot ? <span className={`status-dot ${DOT_CLASS[tone]}`} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function Alert({
  tone = "danger",
  title,
  children,
  action,
}: {
  tone?: "danger" | "warning" | "success" | "info";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const styles = {
    danger: "border-red-200 bg-red-50 text-red-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  }[tone];

  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 ${styles}`}>
      {title ? <p className="text-sm font-semibold">{title}</p> : null}
      {children ? (
        <div className={`${title ? "mt-1" : ""} text-sm leading-6`}>{children}</div>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Skeleton({
  className = "",
  count = 1,
}: {
  className?: string;
  count?: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={`skeleton block ${className}`} aria-hidden="true" />
      ))}
    </>
  );
}

/** Wraps content that is still loading so screen readers announce it. */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500"
    >
      <Spinner className="h-4 w-4 text-teal-700" />
      {label}…
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-10 text-center">
      {icon ? (
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-teal-700 ring-1 ring-slate-200"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : (
        <Cubee size={64} />
      )}
      <p className="mt-3.5 text-sm font-semibold text-slate-900">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export function ProgressBar({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-teal-600 transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-slate-200 ${className}`} />;
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

export function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

/**
 * The single modal in the product. Handles escape-to-close, scroll lock,
 * a scrim that matches the page, and an entrance that collapses to a fade
 * under prefers-reduced-motion.
 */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  tone = "neutral",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  tone?: "neutral" | "danger";
  children: ReactNode;
  footer?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const accent = tone === "danger" ? "text-rose-700" : "text-teal-700";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px] sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.1 : 0.16 }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={`my-auto w-full max-w-lg rounded-2xl border bg-white p-6 shadow-lg outline-none ${
              tone === "danger" ? "border-rose-200" : "border-slate-200"
            }`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: reduce ? 0.1 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="min-w-0">
                <h2 className={`text-base font-semibold tracking-tight ${accent}`}>{title}</h2>
                {subtitle ? (
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{subtitle}</p>
                ) : null}
              </div>
              <IconButton label="Close dialog" onClick={onClose}>
                <XIcon />
              </IconButton>
            </div>

            <div className="mt-5">{children}</div>

            {footer ? <div className="mt-6 flex justify-end gap-2.5">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
