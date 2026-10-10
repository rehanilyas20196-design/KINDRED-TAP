"use client";

import { useState, type FormEvent } from "react";
import {
  FormAlert,
  PasswordField,
  SubmitButton,
  TextField,
} from "@/components/auth";
import { Logo } from "@/components/logo";
import { adminFetch, saveAdminSession } from "@/lib/admin";
import { messageFor, toFieldErrors } from "@/lib/api";

/**
 * The only door into the admin panel. The credentials are not a row in the
 * database: they come from ADMIN_EMAIL and ADMIN_PASSWORD_HASH on the API, so
 * there is no account here for anybody else to list, approve or reset.
 */
export function AdminLogin({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: Record<string, string> = {};
    if (!email.trim()) nextErrors.email = "Enter the admin email";
    if (!password) nextErrors.password = "Password is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);
    setBanner(null);

    try {
      const data = await adminFetch<{ token: string; email: string }>("/api/admin/login", {
        method: "POST",
        body: { email: email.trim(), password },
      });
      saveAdminSession(data.token);
      onSignedIn(data.email);
    } catch (error) {
      setBanner(messageFor(error));
      setErrors(toFieldErrors(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 px-5 py-10 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          <Logo className="h-12 w-auto" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Kindred Tap admin
          </h1>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Sign in to review account requests and manage every portal.
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {banner ? <FormAlert>{banner}</FormAlert> : null}

            <TextField
              label="Admin email"
              type="email"
              autoComplete="username"
              placeholder="admin@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={errors.email}
              required
            />

            <PasswordField
              label="Password"
              autoComplete="current-password"
              placeholder="Your admin password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={errors.password}
              required
            />

            <SubmitButton pending={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </SubmitButton>
          </form>
        </div>

        <p className="mt-4 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
          This panel is not linked from the app. Sessions expire after seven days and can be
          revoked by signing out.
        </p>
      </div>
    </div>
  );
}
