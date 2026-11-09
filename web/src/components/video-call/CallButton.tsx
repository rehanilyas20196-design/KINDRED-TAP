"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import type { AuthUser } from "@/lib/api";
import type { CallInfo, CallState } from "./useVideoCall";

interface CallButtonProps {
  conversationId: string;
  user: AuthUser;
  otherUserId: string;
  otherName: string;
  callState: CallState;
  call: CallInfo | null;
  isRinging: boolean;
  startCall: () => void;
  acceptCall: () => void;
  rejectCall: () => void;
  cancelCall: () => void;
  endCall: () => void;
  onCallEnd?: () => void;
}

export function CallButton({
  conversationId,
  user,
  otherUserId,
  otherName,
  callState,
  call,
  isRinging,
  startCall,
  acceptCall,
  rejectCall,
  cancelCall,
  endCall,
  onCallEnd,
}: CallButtonProps) {
  const [showCallUI, setShowCallUI] = useState(false);

  // Reset call UI when the call fully ends.
  if (
    callState === "ended" ||
    callState === "failed" ||
    callState === "missed"
  ) {
    setShowCallUI(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Start video call"
        onClick={() => {
          setShowCallUI(true);
          void startCall();
        }}
        disabled={
          callState === "outgoing" || callState === "ringing"
        }
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-teal-700 disabled:opacity-50 disabled:pointer-events-none"
      >
        <Icon name="video" className="h-5 w-5" />
      </button>

      {showCallUI && (
        <>
          {isRinging && call ? (
            <IncomingCallModal
              call={call}
              callerName={otherName}
              userId={user.id}
              onAccept={acceptCall}
              onReject={rejectCall}
            />
          ) : (
            <CallStatusIndicator
              callState={callState}
              call={call}
              onCancel={cancelCall}
              onEnd={endCall}
              onClose={() => setShowCallUI(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

interface IncomingCallModalProps {
  call: CallInfo;
  callerName: string;
  userId: string;
  onAccept: () => void;
  onReject: () => void;
}

function IncomingCallModal({
  call,
  callerName,
  userId,
  onAccept,
  onReject,
}: IncomingCallModalProps) {
  const isIncoming = call.callerId !== userId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Incoming video call"
    >
      <div className="w-full max-w-md p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-white mx-auto mb-4">
          <span className="text-sm font-medium">{callerName.charAt(0).toUpperCase()}</span>
        </div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">
          Incoming video call
        </p>
        <h3 className="text-xl font-semibold text-white mb-1">{callerName}</h3>
        <p className="text-sm text-slate-300 mb-8">
          {isIncoming ? "is calling you" : "You are calling"}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition shadow-lg shadow-emerald-900/20"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 transition shadow-lg shadow-rose-900/20"
          >
            Reject
          </button>
        </div>

        {isIncoming && (
          <p className="mt-4 text-[10px] text-slate-500">
            Call will time out in 30 seconds if unanswered.
          </p>
        )}
      </div>
    </div>
  );
}

interface CallStatusIndicatorProps {
  callState: CallState;
  call: CallInfo | null;
  onCancel: () => void;
  onEnd: () => void;
  onClose: () => void;
}

function CallStatusIndicator({
  callState,
  call,
  onCancel,
  onEnd,
  onClose,
}: CallStatusIndicatorProps) {
  const isOutgoing =
    callState === "outgoing" || callState === "ringing";
  const labelMap: Record<CallState, string> = {
    idle: "Idle",
    outgoing: "Calling\u2026",
    ringing: "Ringing\u2026",
    accepted: "Accepted",
    connecting: "Connecting\u2026",
    connected: "Connected",
    rejected: "Rejected",
    missed: "Missed",
    cancelled: "Cancelled",
    ended: "Ended",
    failed: "Failed",
  };

  const isTerminal =
    callState === "rejected" ||
    callState === "missed" ||
    callState === "cancelled" ||
    callState === "ended" ||
    callState === "failed";

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-48 rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="h-2 w-2 rounded-full bg-slate-400 animate-pulse" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          {labelMap[callState]}
        </span>
      </div>

      {isOutgoing && call && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
        >
          Cancel call
        </button>
      )}

      {!isOutgoing && call && !isTerminal && (
        <button
          type="button"
          onClick={onEnd}
          className="w-full py-2 rounded-lg border border-rose-200 bg-white text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
        >
          End call
        </button>
      )}

      {isTerminal && (
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
        >
          Close
        </button>
      )}
    </div>
  );
}
