"use client";

import { useCallback, useEffect, useState } from "react";
import { SupervisorPage } from "@/components/supervisor/shell";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageTitle,
  SectionTitle,
} from "@/components/ui";
import { messageFor } from "@/lib/api";
import {
  fetchReports,
  formatDateTime,
  generateReport,
  type GeneratedReport,
  type ReportCatalogItem,
  type ReportHistoryRow,
} from "@/lib/supervisor";

function humanLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/(^|\s)\S/g, (chunk) => chunk.toUpperCase());
}

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

export default function SupervisorReportsClient() {
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [history, setHistory] = useState<ReportHistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchReports();
      setCatalog(result.reports);
      setHistory(result.history);
      setError(null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function generate(key: string) {
    setBusy(key);
    setNotice(null);
    try {
      const report = await generateReport(key, "csv");
      setPreview(report);
      downloadCsv(report);
      await load();
    } catch (err) {
      setNotice(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SupervisorPage>
      <PageTitle description="Supervision, workload, safety, escalation, intervention and oversight reports. Every report respects role permissions and privacy.">
        Reports
      </PageTitle>

      <div className="mt-5">
        {error ? (
          <EmptyState
            title="We could not load reports"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : loading ? (
          <LoadingState label="Loading reports" />
        ) : (
          <div className="space-y-6">
            {notice ? <Alert tone="danger">{notice}</Alert> : null}

            <Card>
              <SectionTitle detail={`${catalog.length} available`}>Available reports</SectionTitle>
              {catalog.length === 0 ? (
                <div className="mt-4">
                  <EmptyState title="No reports" description="No report definitions are available." />
                </div>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {catalog.map((report) => (
                    <li key={report.key} className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-800">{report.title}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{report.columns.join(" · ")}</p>
                      <Button
                        className="mt-3"
                        size="sm"
                        loading={busy === report.key}
                        onClick={() => void generate(report.key)}
                      >
                        Generate CSV
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {preview ? (
              <Card>
                <SectionTitle detail={`${preview.rowCount} rows`}>{preview.title}</SectionTitle>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <caption className="sr-only">{preview.title} preview</caption>
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                        {preview.columns.map((column) => (
                          <th key={column} scope="col" className="py-2 pr-3">{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.slice(0, 20).map((row, index) => (
                        <tr key={index}>
                          {preview.columns.map((column) => (
                            <td key={column} className="py-1.5 pr-3 text-slate-600">
                              {row[column] === null || row[column] === undefined ? "-" : String(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 20 ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Showing the first 20 rows. The CSV contains all {preview.rowCount}.
                  </p>
                ) : null}
              </Card>
            ) : null}

            <Card>
              <SectionTitle detail={`${history.length} total`}>Recent exports</SectionTitle>
              {history.length === 0 ? (
                <div className="mt-4">
                  <EmptyState title="No exports yet" description="Reports you generate will be listed here." />
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {history.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="text-slate-700">{humanLabel(row.reportKey)}</span>
                      <span className="flex items-center gap-3 text-[11px] text-slate-500">
                        <Badge tone="neutral">{row.format.toUpperCase()}</Badge>
                        {row.rowCount} rows
                        <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                        {row.createdByName ? ` · ${row.createdByName}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </SupervisorPage>
  );
}
