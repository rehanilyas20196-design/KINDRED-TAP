"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Spinner, primaryButtonClass } from "@/components/ui";
import { PortalIcon } from "@/components/portal-icon";
import type { PortalMeta } from "@/lib/portals";

/* ------------------------------------------------------------------ */
/* Page shell                                                          */
/* ------------------------------------------------------------------ */

export function PortalPageShell({
  portal,
  title,
  subtitle,
  children,
  footer,
}: {
  portal: PortalMeta;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-100 dark:bg-slate-950">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-5 py-8 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
            <PortalIcon role={portal.key} className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-teal-700 dark:text-teal-400">
              {portal.portal}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              One page, then you are in.
            </p>
          </div>
        </div>

        <div className="card mt-6 p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-6">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Field specs                                                         */
/* ------------------------------------------------------------------ */

export interface FieldSpecBase {
  name: string;
  label: string;
  hint?: string;
  group?: string;
  /** Starting value when the API has nothing saved yet. */
  initial?: string | number;
}

export type FieldSpec =
  | (FieldSpecBase & {
      kind: "text" | "email" | "tel" | "date";
      required?: boolean;
      placeholder?: string;
      maxLength?: number;
    })
  | (FieldSpecBase & {
      kind: "textarea";
      required?: boolean;
      placeholder?: string;
      rows?: number;
      maxLength?: number;
    })
  | (FieldSpecBase & { kind: "select"; options: string[]; required?: boolean; placeholder?: string })
  | (FieldSpecBase & { kind: "multiselect"; options: string[] })
  | (FieldSpecBase & { kind: "number"; required?: boolean; min?: number; max?: number; initial?: number })
  | (FieldSpecBase & { kind: "toggle"; required?: boolean });

export type ProfileValues = Record<string, string | number | boolean | string[] | undefined>;

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

function inputClass(invalid: boolean): string {
  return `block w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-500 focus:ring-2 dark:bg-slate-950 dark:text-slate-100 ${
    invalid
      ? "border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/60"
      : "border-slate-300 focus:border-teal-600 focus:ring-teal-600/20 dark:border-slate-700 dark:focus:border-teal-500"
  }`;
}

function NoteText({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  const note = error ?? hint;
  if (!note) return null;
  return (
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
  );
}

function Label({ id, children }: { id: string; children: ReactNode }) {
  return (
    <label
      htmlFor={id}
      className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
    >
      {children}
    </label>
  );
}

function MultiSelect({
  id,
  options,
  value,
  onChange,
  error,
}: {
  id: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
}) {
  function toggle(option: string) {
    onChange(
      value.includes(option) ? value.filter((item) => item !== option) : [...value, option]
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" id={id} role="group">
        {options.map((option) => {
          const active = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(option)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                active
                  ? "border-teal-700 bg-teal-700 text-white dark:border-teal-500 dark:bg-teal-500 dark:text-slate-950"
                  : "border-slate-200 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-teal-500 dark:hover:text-teal-300"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      <NoteText id={id} error={error} hint={value.length ? `${value.length} selected` : undefined} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

export function ProfileForm({
  spec,
  initial,
  submitLabel,
  pending,
  banner,
  errors,
  onSubmit,
}: {
  spec: FieldSpec[];
  initial: ProfileValues;
  submitLabel: string;
  pending: boolean;
  banner: string | null;
  errors: Record<string, string>;
  onSubmit: (values: ProfileValues) => void;
}) {
  const [values, setValues] = useState<ProfileValues>(initial);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  function setValue(name: string, value: ProfileValues[string]) {
    setValues((current) => ({ ...current, [name]: value }));
    setClientErrors((current) => {
      if (!(name in current)) return current;
      const rest = { ...current };
      delete rest[name];
      return rest;
    });
  }

  function validate(): Record<string, string> {
    const nextErrors: Record<string, string> = {};
    for (const field of spec) {
      const value = values[field.name];

      if (field.kind === "number") {
        if (value === undefined || value === "") {
          if (field.required) nextErrors[field.name] = `${field.label} is required`;
          continue;
        }
        const numeric = Number(value);
        if (Number.isNaN(numeric)) {
          nextErrors[field.name] = `${field.label} must be a number`;
        } else if (field.min !== undefined && numeric < field.min) {
          nextErrors[field.name] = `${field.label} cannot be below ${field.min}`;
        } else if (field.max !== undefined && numeric > field.max) {
          nextErrors[field.name] = `${field.label} cannot be above ${field.max}`;
        }
        continue;
      }

      if (field.kind === "toggle" || field.kind === "multiselect") continue;

      if (field.required && (value === undefined || value === "")) {
        nextErrors[field.name] = `${field.label} is required`;
      }
    }
    return nextErrors;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate();
    setClientErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit(values);
  }

  const groups: { name: string | undefined; fields: FieldSpec[] }[] = [];
  for (const field of spec) {
    const last = groups[groups.length - 1];
    if (last && last.name === field.group) {
      last.fields.push(field);
    } else {
      groups.push({ name: field.group, fields: [field] });
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {banner ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {banner}
        </div>
      ) : null}

      {groups.map((group, groupIndex) => (
        <fieldset key={group.name ?? `group-${groupIndex}`} className="space-y-4">
          {group.name ? (
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {group.name}
            </legend>
          ) : null}

          {group.fields.map((field) => {
            const fieldId = `field-${field.name}`;
            const error = clientErrors[field.name] ?? errors[field.name];
            const value = values[field.name];

            return (
              <div key={field.name}>
                {field.kind === "toggle" ? (
                  <div className="flex items-start gap-2.5">
                    <input
                      id={fieldId}
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) => setValue(field.name, event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-teal-700 dark:border-slate-600"
                    />
                    <div>
                      <label
                        htmlFor={fieldId}
                        className="cursor-pointer text-sm leading-5 text-slate-600 dark:text-slate-400"
                      >
                        {field.label}
                      </label>
                      <NoteText id={fieldId} error={error} hint={field.hint} />
                    </div>
                  </div>
                ) : (
                  <>
                    <Label id={fieldId}>
                      {field.label}
                      {"required" in field && field.required ? (
                        <span className="ml-1 text-red-500">*</span>
                      ) : null}
                    </Label>

                    {field.kind === "textarea" ? (
                      <textarea
                        id={fieldId}
                        rows={field.rows ?? 4}
                        maxLength={field.maxLength}
                        placeholder={field.placeholder}
                        value={typeof value === "string" ? value : ""}
                        onChange={(event) => setValue(field.name, event.target.value)}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ?? field.hint ? `${fieldId}-note` : undefined}
                        className={inputClass(Boolean(error))}
                      />
                    ) : field.kind === "select" ? (
                      <select
                        id={fieldId}
                        value={typeof value === "string" ? value : ""}
                        onChange={(event) => setValue(field.name, event.target.value)}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ?? field.hint ? `${fieldId}-note` : undefined}
                        className={inputClass(Boolean(error))}
                      >
                        <option value="">
                          {field.placeholder ?? `Choose ${field.label.toLowerCase()}...`}
                        </option>
                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : field.kind === "multiselect" ? (
                      <MultiSelect
                        id={fieldId}
                        options={field.options}
                        value={Array.isArray(value) ? value : []}
                        onChange={(next) => setValue(field.name, next)}
                        error={error}
                      />
                    ) : (
                      <input
                        id={fieldId}
                        type={field.kind === "number" ? "number" : field.kind === "tel" ? "tel" : field.kind === "email" ? "email" : field.kind === "date" ? "date" : "text"}
                        inputMode={field.kind === "number" ? "numeric" : undefined}
                        min={field.kind === "number" ? field.min : undefined}
                        max={field.kind === "number" ? field.max : undefined}
                        maxLength={field.kind === "number" ? undefined : field.maxLength}
                        placeholder={field.kind === "number" ? undefined : field.placeholder}
                        value={
                          field.kind === "number"
                            ? value === undefined || value === ""
                              ? ""
                              : String(value)
                            : typeof value === "string"
                              ? value
                              : ""
                        }
                        onChange={(event) =>
                          setValue(
                            field.name,
                            field.kind === "number"
                              ? event.target.value === ""
                                ? undefined
                                : Number(event.target.value)
                              : event.target.value
                          )
                        }
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ?? field.hint ? `${fieldId}-note` : undefined}
                        className={inputClass(Boolean(error))}
                      />
                    )}

                    <NoteText id={fieldId} error={error} hint={field.hint} />
                  </>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? (
            <>
              <Spinner className="h-4 w-4" />
              Saving…
            </>
          ) : (
            submitLabel
          )}
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          You can change any of this later.
        </p>
      </div>
    </form>
  );
}
