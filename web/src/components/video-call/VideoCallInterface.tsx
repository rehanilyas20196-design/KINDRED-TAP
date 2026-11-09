"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Icon } from "@/components/icons";

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
  userName: string;
  otherName: string;
  callError: string | null;
  onEnd: () => void;
}

export function VideoCallInterface({
  roomId,
  userName,
  otherName,
  callError,
  onEnd,
}: VideoCallInterfaceProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"waiting" | "connected" | "disconnected">("waiting");
  const [duration, setDuration] = useState(0);
  const jitsiRef = useRef<unknown>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Load the Jitsi external_api.js script once.
  useEffect(() => {
    const existing = document.getElementById("jitsi-external-api");
    if (existing) {
      if (window.JitsiMeetExternalAPI) {
        queueMicrotask(() => setIsLoaded(true));
      } else {
        existing.addEventListener("load", () => setIsLoaded(true), { once: true });
        existing.addEventListener(
          "error",
          () => setError("The video call service could not be loaded. Try again later."),
          { once: true }
        );
      }
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
        DEFAULT_BACKGROUND: "#17191a",
        TOOLBAR_BUTTONS: [],
      },
      onload: () => {
        setConnectionStatus("waiting");
      },
      onMemberJoined: () => {
        setConnectionStatus("connected");
        startTimer();
      },
      onMemberLeft: () => {
        setConnectionStatus("disconnected");
        stopTimer();
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

  const handleEnd = useCallback(() => {
    onEnd();
  }, [onEnd]);

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-center">
        <Icon name="alert" className="mb-3 h-8 w-8 text-rose-700" />
        <h2 className="text-lg font-medium text-slate-900">Unable to start video call</h2>
        <p role="alert" className="mt-2 max-w-md text-sm leading-6 text-slate-600">{error}</p>
        {callError ? (
          <p role="alert" className="mt-3 max-w-md text-sm leading-6 text-rose-800">{callError}</p>
        ) : null}
        <button
          type="button"
          onClick={handleEnd}
          className="btn-green mt-5 inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium"
        >
          Close
        </button>
      </section>
    );
  }

  if (!isLoaded) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 text-center">
        <span className="h-2 w-2 rounded-full bg-kindred-leaf" aria-hidden="true" />
        <p className="mt-4 text-sm text-slate-200">Connecting to {otherName}</p>
        <p className="mt-1 text-xs text-slate-400">Preparing the video room</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      <div className="relative h-[min(60vh,600px)] min-h-[360px] bg-[#17191a]">
        <div ref={iframeRef} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 bg-slate-950/70 px-4 py-3 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                connectionStatus === "connected" ? "bg-kindred-leaf" : "bg-slate-400"
              }`}
              aria-hidden="true"
            />
            <span className="truncate text-sm font-medium">
              {connectionStatus === "connected" ? "Connected" : "Waiting for"}{" "}
              {connectionStatus === "connected" ? "" : otherName}
            </span>
          </div>
          {connectionStatus === "connected" ? (
            <span className="shrink-0 text-sm tabular-nums text-slate-200">
              {formatDuration(duration)}
            </span>
          ) : null}
        </div>
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-lg bg-slate-950/80 px-3 py-2 text-xs text-white">
          <span className="truncate">{userName}</span>
          <span className="text-slate-300">
            {isAudioMuted ? "Mic off" : "Mic on"} · {isVideoMuted ? "Camera off" : "Camera on"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-slate-800 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">Video call</p>
          <p className="mt-1 text-xs text-slate-500">
            {connectionStatus === "connected"
              ? `You are speaking with ${otherName}`
              : connectionStatus === "disconnected"
                ? `${otherName} disconnected`
                : `Waiting for ${otherName} to join`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAudio}
            aria-pressed={isAudioMuted}
            aria-label={isAudioMuted ? "Unmute microphone" : "Mute microphone"}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${isAudioMuted ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            <Icon
              name={isAudioMuted ? "mic-off" : "mic"}
              className="h-4 w-4"
            />
          </button>
          <button
            type="button"
            onClick={toggleVideo}
            aria-pressed={isVideoMuted}
            aria-label={isVideoMuted ? "Enable camera" : "Disable camera"}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${isVideoMuted ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            <Icon name="video" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleEnd}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 text-sm font-medium text-white transition-colors hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
          >
            <Icon name="phone-off" className="h-4 w-4" />
            End call
          </button>
        </div>
      </div>
      {callError ? (
        <p role="alert" className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:px-6">
          {callError}
        </p>
      ) : null}
    </section>
  );
}
