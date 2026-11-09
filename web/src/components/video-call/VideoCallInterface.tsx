"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiFetch } from "@/lib/api";

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (
      domain: string,
      options: {
        room: string;
        width: string | number;
        height: string | number;
        parentNode?: HTMLElement | null;
        configOverrides?: Record<string, unknown>;
        interfaceConfigOverrides?: Record<string, unknown>;
        onload?: () => void;
        onMemberJoined?: () => void;
        onMemberLeft?: () => void;
      }
    ) => {
      dispose: () => void;
      muteAudio?: () => void;
      unmuteAudio?: () => void;
      muteVideo?: () => void;
      unmuteVideo?: () => void;
    };
  }
}

interface VideoCallInterfaceProps {
  roomId: string;
  callId: string;
  userName: string;
  otherName: string;
  onEnd: () => void;
}

export function VideoCallInterface({
  roomId,
  callId,
  userName,
  otherName,
  onEnd,
}: VideoCallInterfaceProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("connecting");
  const [duration, setDuration] = useState(0);
  const jitsiRef = useRef<unknown>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Load the Jitsi external_api.js script once.
  useEffect(() => {
    const existing = document.getElementById("jitsi-external-api");
    if (existing) {
      queueMicrotask(() => setIsLoaded(true));
      return;
    }

    const script = document.createElement("script");
    script.id = "jitsi-external-api";
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = () => setIsLoaded(true);
    script.onerror = () => {
      setError("Failed to load the video call service. Please try again later.");
    };
    document.head.appendChild(script);

    return () => {
      // Keep the script loaded for the page lifetime.
    };
  }, []);

  // Start the duration timer when the call connects.
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    if (durationRef.current) clearInterval(durationRef.current);
    durationRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (durationRef.current) {
      clearInterval(durationRef.current);
      durationRef.current = null;
    }
    startTimeRef.current = null;
  }, []);

  // Initialize Jitsi Meet when the API is loaded.
  useEffect(() => {
    if (!isLoaded || !window.JitsiMeetExternalAPI) return;

    const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
      room: roomId,
      width: "100%",
      height: "100%",
      parentNode: iframeRef.current,
      configOverrides: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
      },
      interfaceConfigOverrides: {
        SHOW_JITSI_WATERMARK: false,
        DEFAULT_BACKGROUND: "#ffffff",
        TOOLBAR_BUTTONS: [],
      },
      onload: () => {
        setConnectionStatus("connected");
        startTimer();
      },
      onMemberJoined: () => {
        setConnectionStatus("connected");
      },
      onMemberLeft: () => {
        setConnectionStatus("disconnected");
      },
    });

    jitsiRef.current = api;

    return () => {
      if (api) {
        api.dispose();
      }
      stopTimer();
    };
  }, [isLoaded, roomId, startTimer, stopTimer]);

  const toggleAudio = useCallback(() => {
    if (jitsiRef.current) {
      const api = jitsiRef.current as unknown as { muteAudio?: () => void; unmuteAudio?: () => void };
      if (isAudioMuted) {
        api.unmuteAudio?.();
      } else {
        api.muteAudio?.();
      }
      setIsAudioMuted(!isAudioMuted);
    }
  }, [isAudioMuted]);

  const toggleVideo = useCallback(() => {
    if (jitsiRef.current) {
      const api = jitsiRef.current as unknown as { muteVideo?: () => void; unmuteVideo?: () => void };
      if (isVideoMuted) {
        api.unmuteVideo?.();
      } else {
        api.muteVideo?.();
      }
      setIsVideoMuted(!isVideoMuted);
    }
  }, [isVideoMuted]);

  const handleEnd = async () => {
    try {
      await apiFetch(`/api/calls/${callId}/end`, { method: "POST" });
    } catch {
      // Ignore errors on end - the call is ending locally anyway.
    }
    onEnd();
  };

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-center">
        <Icon name="alert" className="h-10 w-10 text-rose-600 mb-2" />
        <h3 className="text-lg font-semibold text-slate-900 mb-1">Unable to start video call</h3>
        <p className="text-sm text-slate-500 mb-4">{error}</p>
        <Button onClick={onEnd} variant="danger">
          Close
        </Button>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px]">
        <p className="text-sm text-slate-500">Initializing video call…</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[500px] rounded-xl border border-slate-200 bg-white overflow-hidden shadow-lg">
      {/* Video area */}
      <div className="relative w-full h-full bg-slate-100">
        <div
          ref={iframeRef}
          className="absolute inset-0 w-full h-full"
        />
        {/* Local user indicator */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col items-center gap-1 bg-black/40 px-3 py-2 rounded-full text-xs text-white font-medium backdrop-blur">
          <span>{userName}</span>
          <span className={`h-1.5 w-1.5 rounded-full ${isAudioMuted || isVideoMuted ? "bg-amber-500" : "bg-emerald-500"}`} />
        </div>
        {/* Remote user indicator */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/40 px-3 py-2 rounded-full text-xs text-white font-medium backdrop-blur">
          <Icon name="users" className="h-3 w-3" />
          <span>{otherName}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <span className="font-medium">Connection: {connectionStatus}</span>
          <span className="flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${connectionStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span>{formatDuration(duration)}</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleAudio}
            aria-label={isAudioMuted ? "Unmute microphone" : "Mute microphone"}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${isAudioMuted ? "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            <Icon
              name={isAudioMuted ? "mic-off" : "mic"}
              className="h-4 w-4"
            />
          </button>
          <button
            type="button"
            onClick={toggleVideo}
            aria-label={isVideoMuted ? "Enable camera" : "Disable camera"}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${isVideoMuted ? "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            <Icon name="video" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleEnd}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition"
            aria-label="End call"
          >
            <Icon name="phone-off" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
