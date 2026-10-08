"use client";

import { useCallback, useEffect, useState } from "react";
import { SupervisorPage } from "@/components/supervisor/shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  LoadingState,
  PageTitle,
  SectionTitle,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { messageFor } from "@/lib/api";
import { fetchSettings, type SupervisorSettings } from "@/lib/supervisor";

function humanLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/(^|\s)\S/g, (chunk) => chunk.toUpperCase());
}

function settingValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function SupervisorSettingsClient() {
  const [data, setData] = useState<SupervisorSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchSettings()
      .then(setData)
      .catch((err) => setError(messageFor(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <SupervisorPage>
      <PageTitle
        description="Your permissions and the clinic settings that apply to supervision. Clinic-wide configuration is managed by the advisor and platform administrator."
        action={
          <LinkButton href="/portal/clinical_supervisor/profile" variant="secondary">
            Edit my profile
            <Icon name="arrowRight" className="h-4 w-4" />
          </LinkButton>
        }
      >
        Settings
      </PageTitle>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load settings"
            description={error}
            action={<Button onClick={load}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading settings" />
        ) : !data ? (
          <EmptyState title="No settings yet" description="Settings could not be loaded." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle detail={`${data.permissions.length} granted`}>My permissions</SectionTitle>
              <p className="mt-3 text-xs text-slate-500">
                A supervisor is authorised, not unrestricted. These are the actions this account may perform.
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {data.permissions.map((permission) => (
                  <li key={permission.permission}>
                    <Badge tone="accent">{permission.label}</Badge>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <SectionTitle detail={`${data.settings.length} shown`}>Clinic settings</SectionTitle>
              {data.settings.length === 0 ? (
                <div className="mt-4">
                  <EmptyState title="Nothing to show" description="No clinic settings are visible to this role." />
                </div>
              ) : (
                <dl className="mt-4 divide-y divide-slate-100">
                  {data.settings.map((setting) => (
                    <div key={setting.key} className="flex items-start justify-between gap-4 py-2.5">
                      <dt className="text-xs text-slate-500">
                        {humanLabel(setting.key)}
                        <span className="mt-0.5 block text-[11px] text-slate-500">{setting.description}</span>
                      </dt>
                      <dd className="text-right text-sm text-slate-700">{settingValue(setting.value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
          </div>
        )}
      </div>
    </SupervisorPage>
  );
}
