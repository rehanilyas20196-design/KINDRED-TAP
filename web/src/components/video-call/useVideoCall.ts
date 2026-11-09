/**
 * Hook for managing one-to-one video call state.
 *
 * Handles the full call lifecycle: idle -> outgoing -> ringing -> accepted
 * -> connecting -> connected -> (rejected | missed | cancelled | ended | failed).
 *
 * Provides methods to start, accept, reject, cancel and end calls, and
 * exposes the current call state so the UI can show the incoming call modal
 * or the video call interface.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, messageFor, type AuthUser } from "@/lib/api";
import {
  on,
  off,
  send,
  joinConversation,
  leaveConversation,
  type CallEventName,
} from "./socket";

export type CallState =
  | "idle"
  | "outgoing"
  | "ringing"
  | "accepted"
  | "connecting"
  | "connected"
  | "rejected"
  | "missed"
  | "cancelled"
  | "ended"
  | "failed";

export interface CallInfo {
  id: string;
  conversationId: string;
  callerId: string;
  receiverId: string;
  roomId: string;
  status: CallState;
  createdAt: string;
  acceptedAt?: string;
  endedAt?: string;
}

export type VideoCall = CallInfo;

interface UseVideoCallOptions {
  conversationId: string;
  user: AuthUser;
  otherUserId: string;
  onCallEnd?: () => void;
}

export function useVideoCall({
  conversationId,
  user,
  otherUserId,
  onCallEnd,
}: UseVideoCallOptions) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [call, setCall] = useState<CallInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ringToneRef = useRef<{ stop: () => void } | null>(null);
  const callRef = useRef<CallInfo | null>(null);

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  // Play a ring tone using the Web Audio API (no external asset required).
  function playRingTone() {
    if (ringToneRef.current) return;
    try {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const ctx = new AudioContextConstructor();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();

      let toggled = false;
      const interval = setInterval(() => {
        oscillator.frequency.setValueAtTime(toggled ? 440 : 554, ctx.currentTime);
        toggled = !toggled;
      }, 500);

      ringToneRef.current = {
        stop: () => {
          clearInterval(interval);
          try {
            oscillator.stop();
            ctx.close();
          } catch {
            /* ignore */
          }
        },
      };
    } catch {
      // Audio is optional; never fail the call flow because of it.
    }
  }

  function stopRingTone() {
    if (ringToneRef.current) {
      ringToneRef.current.stop();
      ringToneRef.current = null;
    }
  }

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      if (ringToneRef.current) {
        ringToneRef.current.stop();
        ringToneRef.current = null;
      }
      leaveConversation(conversationId);
    };
  }, [conversationId]);

  // Join the conversation signaling room.
  useEffect(() => {
    joinConversation(conversationId);
    return () => {
      leaveConversation(conversationId);
    };
  }, [conversationId]);

  // Listen for call events from the server.
  useEffect(() => {
    const handlers: Record<CallEventName, (payload: unknown) => void> = {
      call_error: (payload) => {
        const p = payload as { error: string };
        if (!callRef.current) return;
        setError(p.error);
        setCallState("failed");
        setCall((c) => (c ? { ...c, status: "failed" } : null));
        stopRingTone();
      },
      call_incoming: (payload) => {
        const p = payload as {
          callId: string;
          conversationId: string;
          callerId: string;
          roomId: string;
        };
        if (p.conversationId !== conversationId || p.callerId === user.id) return;
        setCallState("ringing");
        const incomingCall: CallInfo = {
          id: p.callId,
          conversationId,
          callerId: p.callerId,
          receiverId: user.id,
          roomId: p.roomId,
          status: "ringing",
          createdAt: new Date().toISOString(),
        };
        callRef.current = incomingCall;
        setCall(incomingCall);
        playRingTone();
      },
      call_accepted: (payload) => {
        const p = payload as { callId: string; roomId: string };
        if (callRef.current?.id !== p.callId) return;
        setCallState("accepted");
        setCall((c) => (c ? { ...c, status: "accepted", roomId: p.roomId } : null));
        stopRingTone();
      },
      call_rejected: (payload) => {
        const p = payload as { callId: string };
        if (callRef.current?.id !== p.callId) return;
        setCallState("rejected");
        setCall((c) => (c ? { ...c, status: "rejected" } : null));
        stopRingTone();
      },
      call_cancelled: (payload) => {
        const p = payload as { callId: string };
        if (callRef.current?.id !== p.callId) return;
        setCallState("cancelled");
        setCall((c) => (c ? { ...c, status: "cancelled" } : null));
        stopRingTone();
      },
      call_ended: (payload) => {
        const p = payload as { callId: string };
        if (callRef.current?.id !== p.callId) return;
        setCallState("ended");
        setCall((c) => (c ? { ...c, status: "ended" } : null));
        stopRingTone();
        onCallEnd?.();
      },
      call_busy: (payload) => {
        const p = payload as { callId: string };
        if (callRef.current?.id !== p.callId) return;
        setCallState("rejected");
        setCall((c) => (c ? { ...c, status: "rejected" } : null));
        stopRingTone();
      },
      call_missed: (payload) => {
        const p = payload as { callId: string };
        if (callRef.current?.id !== p.callId) return;
        setCallState("missed");
        setCall((c) => (c ? { ...c, status: "missed" } : null));
        stopRingTone();
      },
      call_failed: (payload) => {
        const p = payload as { callId: string };
        if (callRef.current?.id !== p.callId) return;
        setCallState("failed");
        setCall((c) => (c ? { ...c, status: "failed" } : null));
        stopRingTone();
      },
      call_user_disconnected: () => {
        // A signaling socket can close while the media call remains active.
      },
    };

    for (const [event, handler] of Object.entries(handlers)) {
      on(event as CallEventName, handler);
    }
    return () => {
      for (const event of Object.keys(handlers) as CallEventName[]) {
        off(event, handlers[event]);
      }
    };
  }, [conversationId, user.id, onCallEnd]);

  /** Start an outgoing video call. */
  const startCall = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<{ call: { id: string; roomId: string } }>(
        `/api/calls`,
        { method: "POST", body: { conversationId } }
      );
      setCallState("outgoing");
      const outgoingCall: CallInfo = {
        id: res.call.id,
        conversationId,
        callerId: user.id,
        receiverId: otherUserId,
        roomId: res.call.roomId,
        status: "outgoing",
        createdAt: new Date().toISOString(),
      };
      callRef.current = outgoingCall;
      setCall(outgoingCall);
      send("call_start", {
        callId: res.call.id,
        conversationId,
        receiverId: otherUserId,
      });
    } catch (err) {
      setError(messageFor(err));
      setCallState("failed");
    }
  }, [conversationId, otherUserId, user.id]);

  /** Accept an incoming call. */
  const acceptCall = useCallback(async () => {
    if (!call) return;
    setError(null);
    try {
      await apiFetch(`/api/calls/${call.id}/accept`, {
        method: "POST",
      });
      send("call_accept", { callId: call.id });
      setCallState("connecting");
    } catch (err) {
      setError(messageFor(err));
    }
  }, [call]);

  /** Reject an incoming call. */
  const rejectCall = useCallback(async () => {
    if (!call) return;
    setError(null);
    try {
      await apiFetch(`/api/calls/${call.id}/reject`, {
        method: "POST",
      });
      send("call_reject", { callId: call.id });
      setCallState("rejected");
    } catch (err) {
      setError(messageFor(err));
    }
  }, [call]);

  /** Cancel an outgoing call. */
  const cancelCall = useCallback(async () => {
    if (!call) return;
    setError(null);
    try {
      await apiFetch(`/api/calls/${call.id}/cancel`, {
        method: "POST",
      });
      send("call_cancel", { callId: call.id });
      setCallState("cancelled");
    } catch (err) {
      setError(messageFor(err));
    }
  }, [call]);

  /** End an active call. */
  const endCall = useCallback(async () => {
    if (!call) return;
    setError(null);
    try {
      await apiFetch(`/api/calls/${call.id}/end`, {
        method: "POST",
      });
      send("call_end", { callId: call.id });
      setCallState("ended");
      onCallEnd?.();
    } catch (err) {
      setError(messageFor(err));
    }
  }, [call, onCallEnd]);

  return {
    callState,
    call,
    error,
    isOutgoing: callState === "outgoing",
    isRinging: callState === "ringing",
    isConnected: callState === "connected",
    startCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
  };
}
