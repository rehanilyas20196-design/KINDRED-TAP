"use client";

import { useState } from "react";
import type { CallState, VideoCall } from "./useVideoCall";

interface CallButtonProps {
  otherName: string;
  canCall: boolean;
  callState: CallState;
  call: VideoCall | null;
  callError: string | null;
  isRinging: boolean;
  startCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  cancelCall: () => Promise<void>;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export default function CallButton({
  otherName,
  canCall,
  callState,
  call,
  callError,
  isRinging,
  startCall,
  acceptCall,
  rejectCall,
  cancelCall,
}: CallButtonProps) {
  const [showCallUI, setShowCallUI] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const beginCall = () => {
    if (!canCall || isStarting || isRinging || callState === "outgoing") return;
    setShowCallUI(true);
    setIsStarting(true);
    void startCall().finally(() => setIsStarting(false));
  };

  const answerCall = async () => {
    setIsActing(true);
    try {
      await acceptCall();
    } finally {
      setIsActing(false);
    }
  };

  const declineCall = async () => {
    setIsActing(true);
    try {
      await rejectCall();
    } finally {
      setIsActing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={beginCall}
        disabled={!canCall || isStarting || isRinging || callState === "outgoing"}
        className="btn-green inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="h-[18px] w-[18px]"
        >
          <path d="m15 10 5-3v10l-5-3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="6" width="12" height="12" rx="2" />
        </svg>
        Video call
      </button>

      {(showCallUI || isRinging) && isRinging && call ? (
        <IncomingCallDialog
          callerName={otherName}
          error={callError}
          isActing={isActing}
          onAccept={() => void answerCall()}
          onReject={() => void declineCall()}
        />
      ) : showCallUI ? (
        <CallStatusDialog
          name={otherName}
          callState={callState}
          call={call}
          error={callError}
          isStarting={isStarting}
          onCancel={() => void cancelCall()}
          onClose={() => setShowCallUI(false)}
        />
      ) : null}
    </>
  );
}

interface CallStatusDialogProps {
  name: string;
  callState: CallState;
  call: VideoCall | null;
  error: string | null;
  isStarting: boolean;
  onCancel: () => void;
  onClose: () => void;
}

function CallStatusDialog({
  name,
  callState,
  call,
  error,
  isStarting,
  onCancel,
  onClose,
}: CallStatusDialogProps) {
  const isPending = isStarting || callState === "outgoing" || callState === "ringing";
  const title = isStarting
    ? "Starting your call"
    : callState === "outgoing"
      ? `Calling ${name}`
      : callState === "rejected"
        ? "Call declined"
        : callState === "missed"
          ? "No answer"
          : callState === "cancelled"
            ? "Call cancelled"
            : callState === "ended"
              ? "Call ended"
              : callState === "failed"
                ? "Call could not start"
                : "Video call";
  const detail = isStarting
    ? "Setting up a private video room"
    : callState === "outgoing"
      ? "Waiting for them to answer"
      : callState === "rejected"
        ? `${name} declined the call`
        : callState === "missed"
          ? `${name} did not answer`
          : callState === "cancelled"
            ? "The call was cancelled before it connected"
            : callState === "ended"
              ? "This call has ended"
              : callState === "failed"
                ? "Check your connection and try again"
                : "Your call is ready";

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="call-status-title"
        aria-describedby="call-status-detail"
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl"
      >
        <p className="text-sm font-medium text-slate-500">Kindred Tap video call</p>
        <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#edf4e5] text-lg font-medium text-[#315d13]">
          {initials(name) || "KT"}
        </div>
        <h2 id="call-status-title" className="mt-4 text-xl font-medium text-slate-900">
          {title}
        </h2>
        <p id="call-status-detail" aria-live="polite" className="mt-2 text-sm text-slate-600">
          {detail}
        </p>
        {call ? (
          <p className="mt-4 text-xs tabular-nums text-slate-500">
            {callState === "outgoing" ? "Call request sent" : "Connecting"}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-left text-sm text-rose-800">
            {error}
          </p>
        ) : null}
        <div className="mt-6">
          {isPending ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={!call || isStarting}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel call
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="btn-green inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-medium"
            >
              Close
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

interface IncomingCallDialogProps {
  callerName: string;
  error: string | null;
  isActing: boolean;
  onAccept: () => void;
  onReject: () => void;
}

function IncomingCallDialog({
  callerName,
  error,
  isActing,
  onAccept,
  onReject,
}: IncomingCallDialogProps) {
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="incoming-call-title"
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl"
      >
        <p className="text-sm font-medium text-slate-500">Incoming video call</p>
        <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#edf4e5] text-lg font-medium text-[#315d13]">
          {initials(callerName) || "KT"}
        </div>
        <h2 id="incoming-call-title" className="mt-4 text-xl font-medium text-slate-900">
          {callerName}
        </h2>
        <p aria-live="polite" className="mt-2 text-sm text-slate-600">
          {isActing ? "Connecting to the call" : "Would like to talk with you"}
        </p>
        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-left text-sm text-rose-800">
            {error}
          </p>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onReject}
            disabled={isActing}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={isActing}
            className="btn-green inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-50"
          >
            {isActing ? "Joining" : "Answer"}
          </button>
        </div>
      </section>
    </div>
  );
}
