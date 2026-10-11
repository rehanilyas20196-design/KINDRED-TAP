"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { messageFor } from "@/lib/api";
import {
  acceptInvite,
  declineInvite,
  generateInvite,
  listInvites,
  listPendingRequests,
  revokeInvite,
  type InviteRecord,
  type InviteRole,
} from "@/lib/invites";
import { Alert, Badge, Button } from "@/components/ui";

/**
 * The owner side of the QR invite flow.
 *
 * Generate -> QR shows with the one-time warning -> print / download / copy
 * the join link. While the code is in the wild the same card is the
 * authentication inbox: a scan raises a pending request here, and the two
 * buttons on it are the only way the scanner ever gets in or is refused.
 */
export default function QrInviteCard({ role }: { role: InviteRole }) {
  const rolePortal =
    role === "collaborative_clinic" ? "Collaborative Clinic Portal" : "Supporter Portal";

  const [invite, setInvite] = useState<InviteRecord | null>(null);
  const [requests, setRequests] = useState<InviteRecord[]>([]);
  const [history, setHistory] = useState<InviteRecord[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(
    null
  );

  const load = useCallback(async () => {
    try {
      const [list, pending] = await Promise.all([listInvites(), listPendingRequests()]);
      const live = list.invites.find((i) => i.status === "pending") ?? null;
      setInvite(live);
      setRequests(pending.requests);
      setHistory(list.invites.filter((i) => i.status !== "pending").slice(0, 5));
    } catch (err) {
      setNotice({ tone: "danger", text: messageFor(err) });
    }
  }, []);

  // A scan lands on the owner's account asynchronously, so the pending list
  // is refreshed on an interval while the card is on screen. The initial
  // load yields first, keeping the effect body free of synchronous setState.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    })();
    const timer = setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load]);

  // Render (or clear) the QR whenever the live invite changes. Every state
  // write happens after an await so the effect body itself stays clear of
  // cascading renders.
  useEffect(() => {
    let cancelled = false;

    async function syncQr() {
      await Promise.resolve();
      if (cancelled) return;
      if (!invite || invite.status !== "pending") {
        setQrDataUrl(null);
        setJoinUrl(null);
        return;
      }
      const url = `${window.location.origin}/invite/${invite.code}`;
      try {
        const dataUrl = await QRCode.toDataURL(url, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: "M",
        });
        if (cancelled) return;
        setQrDataUrl(dataUrl);
        setJoinUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    }

    void syncQr();
    return () => {
      cancelled = true;
    };
  }, [invite]);

  async function onGenerate() {
    setBusy(true);
    setNotice(null);
    try {
      const data = await generateInvite(role);
      setNotice({ tone: "success", text: data.message });
      await load();
    } catch (err) {
      setNotice({ tone: "danger", text: messageFor(err) });
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, accept: boolean) {
    setActingOn(id);
    setNotice(null);
    try {
      if (accept) {
        await acceptInvite(id);
        setNotice({
          tone: "success",
          text: "Accepted — the person who scanned can now complete their profile and use the portal.",
        });
      } else {
        await declineInvite(id);
        setNotice({
          tone: "danger",
          text: "Declined — the scanner will see “authentication failed”.",
        });
      }
      await load();
    } catch (err) {
      setNotice({ tone: "danger", text: messageFor(err) });
    } finally {
      setActingOn(null);
    }
  }

  async function onRevoke(id: string) {
    setActingOn(id);
    setNotice(null);
    try {
      await revokeInvite(id);
      setNotice({ tone: "info", text: "That QR code is now retired and cannot be scanned in." });
      await load();
    } catch (err) {
      setNotice({ tone: "danger", text: messageFor(err) });
    } finally {
      setActingOn(null);
    }
  }

  function onDownload() {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `kindred-tap-${role}-invite-qr.png`;
    link.click();
    setNotice({ tone: "success", text: "QR code downloaded — keep a copy somewhere safe." });
  }

  function onPrint() {
    if (!qrDataUrl) return;
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      document.body.removeChild(frame);
      return;
    }
    doc.open();
    doc.write(
      `<!doctype html><html><head><title>Kindred Tap QR invite</title>` +
        `<style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px}` +
        `h1{font-size:18px}img{width:320px;height:320px}p{color:#555;font-size:12px;max-width:420px;margin:12px auto}` +
        `.code{font-family:monospace;font-size:12px;color:#333}</style></head><body>` +
        `<h1>Kindred Tap — ${rolePortal} invite</h1>` +
        `<img src="${qrDataUrl}" alt="QR code" />` +
        `<p>Scan with a phone camera to request access. This code is one-time and still needs the account owner's approval.</p>` +
        `<p class="code">${joinUrl ?? ""}</p>` +
        `</body></html>`
    );
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => document.body.removeChild(frame), 1_000);
  }

  async function onCopyLink() {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setNotice({ tone: "success", text: "Join link copied — share it the same way as the QR." });
    } catch {
      setNotice({
        tone: "danger",
        text: "Could not copy the link — copy it from the text below the QR.",
      });
    }
  }

  return (
    <section className="card p-6" aria-labelledby="qr-invite-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Badge tone="accent" dot>
            Secure access
          </Badge>
          <h2
            id="qr-invite-title"
            className="mt-3 text-lg font-semibold tracking-tight text-slate-900 dark:text-white"
          >
            QR sign-in code
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Generate a one-time QR code and share it with one person. They scan it, you get an
            authentication request here, and only your approval lets them in — otherwise they see
            “authentication failed”.
          </p>
        </div>
        <Button onClick={() => void onGenerate()} loading={busy}>
          {invite ? "Generate a new code" : "Generate QR code"}
        </Button>
      </div>

      {notice ? (
        <div className="mt-4">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}

      {invite && qrDataUrl ? (
        <div className="mt-6 grid gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
          <figure className="justify-self-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt={`QR code for your ${rolePortal} invite`}
              className="h-56 w-56"
            />
            <figcaption className="mt-3 text-center text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              One-time code · expires {new Date(invite.expiresAt).toLocaleDateString()}
              <br />
              <span className="break-all font-mono text-[10px]">{joinUrl}</span>
            </figcaption>
          </figure>

          <div className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              This QR code is <strong>one-time</strong>. Save it now — print it, download it, or copy
              the join link. Generating a new code retires this one, and once it has been used it
              cannot work again for anyone else.
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button variant="secondary" onClick={onDownload}>
                Download PNG
              </Button>
              <Button variant="secondary" onClick={onPrint}>
                Print
              </Button>
              <Button variant="secondary" onClick={() => void onCopyLink()}>
                Copy join link
              </Button>
              <Button
                variant="ghost"
                className="text-rose-700 hover:text-rose-800 dark:text-rose-300"
                onClick={() => invite && void onRevoke(invite.id)}
                loading={actingOn === invite.id}
              >
                Retire this code
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Authentication inbox — scans waiting for the owner's decision */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Authentication requests
        </h3>
        {requests.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Nobody is waiting. When somebody scans your active QR code, their request appears here
            for you to accept or reject.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {requests.map((request) => (
              <li
                key={request.id}
                className="rounded-2xl border border-teal-200 bg-teal-50/80 p-4 dark:border-teal-500/30 dark:bg-teal-500/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {request.joinerFullName} scanned your QR code
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                      {request.joinerEmail}
                    </p>
                    {request.joinerNote ? (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        “{request.joinerNote}”
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-400">
                      Waiting since{" "}
                      {new Date(request.requestedAt ?? request.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void decide(request.id, true)}
                      loading={actingOn === request.id}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void decide(request.id, false)}
                      loading={actingOn === request.id}
                      disabled={actingOn !== null && actingOn !== request.id}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {history.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
            Previously issued codes ({history.length})
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {history.map((record) => (
              <li
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3.5 py-2 dark:border-slate-700"
              >
                <span className="min-w-0 truncate font-mono text-xs text-slate-500">
                  {record.code}
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  {record.joinerEmail ? <span>{record.joinerEmail}</span> : null}
                  <Badge tone={statusTone(record.status)}>{statusLabel(record.status)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function statusLabel(status: InviteRecord["status"]): string {
  switch (status) {
    case "pending":
      return "Waiting for scan";
    case "declined":
      return "Declined";
    case "used":
      return "Used";
    case "revoked":
      return "Retired";
    default:
      return status;
  }
}

function statusTone(
  status: InviteRecord["status"]
): "neutral" | "success" | "danger" | "accent" {
  switch (status) {
    case "used":
      return "success";
    case "declined":
      return "danger";
    case "pending":
      return "accent";
    default:
      return "neutral";
  }
}
