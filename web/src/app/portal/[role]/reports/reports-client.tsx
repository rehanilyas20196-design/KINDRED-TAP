"use client";

import { useCallback, useEffect, useState } from "react";
import { AdvisorPage } from "@/components/advisor/shell";
import { Panel } from "@/components/therapist/ui";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LoadingState,
  PageTitle,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import {
  fetchReports,
  formatDateTime,
  generateReport,
  type GeneratedReport,
} from "@/lib/advisor";

function downloadCsv(report: GeneratedReport) {
  const blob = new Blob([report.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${report.key}-${report.generatedAt.slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ReportsClient() {
  const [catalog, setCatalog] = useState<{ key: string; title: string; columns: string[] }[] | null>(
    null
  );
  const [history, setHistory] = useState<
    { id: string; reportKey: string; format: string; rowCount: number; createdAt: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchReports();
      setCatalog(response.reports);
      setHistory(response.history);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  const reload = useCallback(() => {
    setCatalog(null);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function run(key: string) {
    setBusy(key);
    setNotice(null);
    setResult(null);
    try {
      const report = await generateReport(key, "csv");
      setResult(report);
      await load();
    } catch (err) {
      setNotice(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdvisorPage>
      <PageTitle description="Generate clinic reports on demand. Each generation is recorded in the audit log with the row count.">
        Reports
      </PageTitle>

      {notice ? (
        <div className="mb-5">
          <Alert tone="danger" title="We could not generate that report">
            {notice}
          </Alert>
        </div>
      ) : null}

      {error && catalog === null ? (
        <EmptyState
          title="We could not load your reports"
          description={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : catalog === null ? (
        <LoadingState label="Loading report catalogue" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((item) => (
              <div key={item.key} className="card flex flex-col p-5">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
                <p className="mt-1 flex-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {item.columns.join(", ")}
                </p>
                <div className="mt-4">
                  <Button
                    loading={busy === item.key}
                    disabled={busy !== null}
                    onClick={() => void run(item.key)}
                  >
                    {busy === item.key ? "Generating..." : "Generate CSV"}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {result ? (
            <Panel
              title={`${result.title} · ${result.rowCount} rows`}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => downloadCsv(result)}>
                    Download CSV
                  </Button>
                  <Badge tone="neutral">
                    <time dateTime={result.generatedAt}>{formatDateTime(result.generatedAt)}</time>
                  </Badge>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                      {result.columns.map((column) => (
                        <th key={column} className="whitespace-nowrap py-2 pr-4 font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 12).map((row, index) => (
                      <tr
                        key={index}
                        className="border-b border-slate-100 text-slate-600 last:border-0 dark:border-slate-800 dark:text-slate-300"
                      >
                        {result.columns.map((column) => (
                          <td key={column} className="whitespace-nowrap py-2 pr-4">
                            {row[column] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.rows.length > 12 ? (
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-500">
                  Showing the first 12 of {result.rows.length} rows - download the CSV for all.
                </p>
              ) : null}
            </Panel>
          ) : null}

          <Panel title="Generation history">
            {history.length === 0 ? (
              <EmptyState
                title="No reports generated yet"
                description="Every generation is logged with its row count for accountability."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.slice(0, 12).map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                      {row.reportKey}
                    </span>
                    <Badge tone="neutral">{row.format}</Badge>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {row.rowCount} rows
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-500">
                      <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </AdvisorPage>
  );
}
