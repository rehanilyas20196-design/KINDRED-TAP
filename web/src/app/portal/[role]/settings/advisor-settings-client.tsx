"use client";

import { useCallback, useEffect, useState } from "react";
import { AdvisorPage } from "@/components/advisor/shell";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { Panel, SearchField, SegmentedControl, inputClass } from "@/components/therapist/ui";
import { messageFor } from "@/lib/api";
import {
  fetchAudit,
  fetchPermissions,
  fetchSettings,
  formatDateTime,
  savePermissions,
  saveSettings,
  type AuditEntry,
  type ClinicSettingRow,
  type PermissionRow,
} from "@/lib/advisor";

type Section = "clinic" | "permissions" | "audit";
type Notice = { tone: "success" | "danger"; message: string } | null;

function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function SettingInput({
  label,
  setting,
  canManage,
  value,
  onChange,
}: {
  label: string;
  setting: ClinicSettingRow;
  canManage: boolean;
  value: string;
  onChange: (next: string) => void;
}) {
  const disabled = !setting.canEdit || !canManage;
  if (typeof setting.value === "boolean") {
    return (
      <select
        aria-label={label}
        className={inputClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (typeof setting.value === "number") {
    return (
      <input
        type="number"
        aria-label={label}
        className={inputClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <input
      aria-label={label}
      className={inputClass}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default function AdvisorSettingsClient() {
  const [section, setSection] = useState<Section>("clinic");
  const [settings, setSettings] = useState<ClinicSettingRow[] | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [canManage, setCanManage] = useState(false);
  const [permissions, setPermissions] = useState<PermissionRow[] | null>(null);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetchSettings();
      setSettings(response.settings);
      setCanManage(response.canManage);
      setDrafts(
        Object.fromEntries(
          response.settings.map((row) => [row.key, JSON.stringify(row.value ?? null)])
        )
      );
      setSettingsError(null);
    } catch (err) {
      setSettingsError(messageFor(err));
    }
  }, []);

  const loadPermissions = useCallback(async () => {
    try {
      const response = await fetchPermissions();
      setPermissions(response.permissions);
      setPermissionsError(null);
    } catch (err) {
      setPermissionsError(messageFor(err));
    }
  }, []);

  const loadAudit = useCallback(async (nextFilter: string) => {
    try {
      const response = await fetchAudit({
        limit: 100,
        action: nextFilter.trim() || undefined,
      });
      setEntries(response.entries);
      setAuditError(null);
    } catch (err) {
      setAuditError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadSettings();
    })();
  }, [loadSettings]);

  useEffect(() => {
    void (async () => {
      await loadPermissions();
    })();
  }, [loadPermissions]);

  useEffect(() => {
    void (async () => {
      await loadAudit(actionFilter);
    })();
  }, [actionFilter, reload, loadAudit]);

  function reloadAudit() {
    setEntries(null);
    setAuditError(null);
    setReload((value) => value + 1);
  }

  function parseDraft(setting: ClinicSettingRow, raw: string): unknown {
    if (typeof setting.value === "number") return Number(raw);
    if (typeof setting.value === "boolean") return raw === "true";
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async function persistSettings() {
    if (!settings) return;
    setBusy(true);
    setNotice(null);
    try {
      const changed = settings
        .filter((setting) => canManage && setting.canEdit && drafts[setting.key] !== undefined)
        .map((setting) => ({
          key: setting.key,
          value: parseDraft(setting, drafts[setting.key]),
        }))
        .filter((item) => {
          const original = settings.find((row) => row.key === item.key);
          return original ? JSON.stringify(original.value) !== JSON.stringify(item.value) : false;
        });
      if (changed.length === 0) {
        setNotice({ tone: "success", message: "Nothing to save." });
      } else {
        const response = await saveSettings(changed);
        setNotice({
          tone: "success",
          message: `Saved ${response.changed.length} setting(s).`,
        });
        const refreshed = await fetchSettings();
        setSettings(refreshed.settings);
        setCanManage(refreshed.canManage);
      }
    } catch (err) {
      setNotice({ tone: "danger", message: messageFor(err) });
    } finally {
      setBusy(false);
    }
  }

  function togglePermission(permission: string) {
    setPermissions((prev) =>
      (prev ?? []).map((row) =>
        row.permission === permission ? { ...row, granted: !row.granted } : row
      )
    );
  }

  async function persistPermissions() {
    if (!permissions) return;
    setBusy(true);
    setNotice(null);
    try {
      await savePermissions(
        "self",
        permissions.filter((row) => row.granted).map((row) => row.permission)
      );
      setNotice({ tone: "success", message: "Permissions saved." });
      await loadPermissions();
    } catch (err) {
      setNotice({ tone: "danger", message: messageFor(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdvisorPage>
      <PageTitle
        eyebrow="Administration"
        description="Clinic-wide configuration, advisor permissions and the audit trail of every privileged action."
      >
        Settings
      </PageTitle>

      <div className="mb-5">
        <SegmentedControl
          ariaLabel="Settings section"
          value={section}
          onChange={setSection}
          options={[
            { value: "clinic", label: "Clinic" },
            { value: "permissions", label: "Permissions" },
            { value: "audit", label: "Audit log" },
          ]}
        />
      </div>

      {notice ? (
        <div className="mb-5">
          <Alert tone={notice.tone}>{notice.message}</Alert>
        </div>
      ) : null}

      {section === "clinic" ? (
        settingsError && settings === null ? (
          <EmptyState
            title="We could not load the clinic settings"
            description={settingsError}
            action={
              <Button
                onClick={() => {
                  setSettings(null);
                  setSettingsError(null);
                  void loadSettings();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : settings === null ? (
          <LoadingState label="Loading clinic settings" />
        ) : (
          <>
          {settingsError ? (
            <div className="mb-4">
              <Alert tone="danger">
                We could not refresh these settings: {settingsError}
              </Alert>
            </div>
          ) : null}
          <Panel
            title="Clinic configuration"
            action={
              <Button
                loading={busy}
                disabled={!canManage}
                onClick={() => void persistSettings()}
              >
                Save changes
              </Button>
            }
          >
            {!canManage ? (
              <div className="mb-4">
                <Alert tone="warning">
                  You can read these settings, but editing them needs the settings.manage
                  permission.
                </Alert>
              </div>
            ) : null}
            <ul className="space-y-4">
              {settings.map((setting) => {
                const label = humanize(setting.key);
                return (
                  <li key={setting.key} className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {label}
                        {setting.adminOnly ? (
                          <span className="ml-2">
                            <Badge tone="neutral">admin only</Badge>
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {setting.description}
                      </p>
                    </div>
                    <div>
                      <SettingInput
                        label={label}
                        setting={setting}
                        canManage={canManage}
                        value={drafts[setting.key] ?? ""}
                        onChange={(next) =>
                          setDrafts((prev) => ({ ...prev, [setting.key]: next }))
                        }
                      />
                      {!setting.canEdit ? (
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                          Locked{setting.adminOnly ? " - managed by the platform admin" : ""}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
          </>
        )
      ) : null}

      {section === "permissions" ? (
        permissionsError && permissions === null ? (
          <EmptyState
            title="We could not load your permissions"
            description={permissionsError}
            action={
              <Button
                onClick={() => {
                  setPermissions(null);
                  setPermissionsError(null);
                  void loadPermissions();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : permissions === null ? (
          <LoadingState label="Loading permissions" />
        ) : (
          <>
          {permissionsError ? (
            <div className="mb-4">
              <Alert tone="danger">
                We could not refresh your permissions: {permissionsError}
              </Alert>
            </div>
          ) : null}
          <Panel
            title="Your permissions"
            action={
              <Button loading={busy} onClick={() => void persistPermissions()}>
                Save permissions
              </Button>
            }
          >
            <p className="mb-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
              These gate what this advisor account can do. The API enforces them independently -
              hiding a button is never the control.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {permissions.map((row) => (
                <li key={row.permission}>
                  <label className="card card-interactive flex cursor-pointer items-start gap-3 p-4">
                    <input
                      type="checkbox"
                      checked={row.granted}
                      onChange={() => togglePermission(row.permission)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {row.label}
                      </span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-500">
                        {row.permission}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Panel>
          </>
        )
      ) : null}

      {section === "audit" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchField
              value={actionFilter}
              onChange={(value) => {
                if (value === actionFilter) return;
                setEntries(null);
                setAuditError(null);
                setActionFilter(value);
              }}
              placeholder="Filter by action, e.g. standard.updated"
            />
            <Button
              variant="secondary"
              loading={entries === null && !auditError}
              onClick={reloadAudit}
            >
              Refresh
            </Button>
          </div>

          <Panel title="Recent privileged actions">
            {auditError && entries === null ? (
              <EmptyState
                title="We could not load the audit log"
                description={auditError}
                action={
                  <Button variant="secondary" onClick={reloadAudit}>
                    Try again
                  </Button>
                }
              />
            ) : entries === null ? (
              <LoadingState label="Loading audit log" />
            ) : entries.length === 0 ? (
              <EmptyState
                title="No audit entries"
                description={
                  actionFilter
                    ? "No privileged action matches that filter yet."
                    : "Every privileged action performed by an advisor shows up here as it happens."
                }
              />
            ) : (
              <>
              {auditError ? (
                <div className="mb-3">
                  <Alert tone="danger">We could not refresh the audit log: {auditError}</Alert>
                </div>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">
                    Recent privileged actions performed in this clinic
                  </caption>
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                      <th scope="col" className="py-2 pr-4 font-semibold">When</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Action</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Actor</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Target</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-slate-100 text-slate-600 last:border-0 dark:border-slate-800 dark:text-slate-300"
                      >
                        <td className="whitespace-nowrap py-2 pr-4">
                          <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4 font-semibold text-slate-800 dark:text-slate-100">
                          {entry.action}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4">
                          {entry.actorName ?? "—"}
                          {entry.actorRole ? ` (${humanize(entry.actorRole)})` : ""}
                        </td>
                        <td className="py-2 pr-4">
                          {entry.targetType}
                          {entry.targetId ? ` · ${entry.targetId.slice(0, 8)}` : ""}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4">
                          <Badge tone={entry.result === "ok" ? "success" : "danger"} dot>
                            {entry.result === "ok" ? "Success" : humanize(entry.result)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </Panel>
        </div>
      ) : null}
    </AdvisorPage>
  );
}
