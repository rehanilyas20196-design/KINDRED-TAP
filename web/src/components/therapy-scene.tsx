"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createTherapyScene,
  type TherapySceneHandle,
  type CameraPreset,
} from "./therapy-scene-core";

const PRESET_LABELS: { id: CameraPreset; label: string; icon: string }[] = [
  { id: "overview", label: "Full Room", icon: "room" },
  { id: "therapist", label: "Therapist", icon: "therapist" },
  { id: "client", label: "Client", icon: "client" },
  { id: "details", label: "Table & Plant", icon: "details" },
];

export default function TherapyScene({
  className,
  label = "Interactive 3D scene of a therapist and client in private consultation.",
}: {
  className?: string;
  label?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<TherapySceneHandle | null>(null);

  const [autoRotate, setAutoRotate] = useState(true);
  const [activePreset, setActivePreset] = useState<CameraPreset | "custom">("overview");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const handle = createTherapyScene(containerRef.current, {
      autoRotate: true,
    });
    handleRef.current = handle;
    setAutoRotate(handle.isAutoRotating());

    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      handle.dispose();
      handleRef.current = null;
    };
  }, []);

  const markInteracted = useCallback(() => {
    if (!hasInteracted) setHasInteracted(true);
  }, [hasInteracted]);

  const handleSelectPreset = (preset: CameraPreset) => {
    markInteracted();
    if (handleRef.current) {
      handleRef.current.setPreset(preset);
      setActivePreset(preset);
    }
  };

  const handleToggleAutoRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    markInteracted();
    if (handleRef.current) {
      const active = handleRef.current.toggleAutoRotate();
      setAutoRotate(active);
    }
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    markInteracted();
    handleRef.current?.zoomIn();
    setActivePreset("custom");
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    markInteracted();
    handleRef.current?.zoomOut();
    setActivePreset("custom");
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    markInteracted();
    handleRef.current?.resetView();
    setActivePreset("overview");
  };

  const handleToggleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    markInteracted();
    if (!wrapperRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await wrapperRef.current.requestFullscreen();
      }
    } catch {
      // Fullscreen not supported or denied
    }
  };

  return (
    <div
      ref={wrapperRef}
      onPointerDown={markInteracted}
      className={`group relative select-none overflow-hidden ${
        isFullscreen
          ? "fixed inset-0 z-50 h-screen w-screen bg-[radial-gradient(130%_95%_at_50%_15%,#f0f3fa_0%,#f8fafc_55%,#ffffff_100%)]"
          : className ?? ""
      }`}
    >
      {/* Three.js Canvas Container */}
      <div
        ref={containerRef}
        role="img"
        aria-label={label}
        className="absolute inset-0 h-full w-full"
      />

      {/* Top Left: Live Status Pill */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-slate-200/60 bg-white/85 px-3 py-1.5 shadow-sm backdrop-blur-md transition-opacity">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
        </span>
        <span className="text-[11px] font-medium tracking-wide text-slate-700">
          3D Session Room
        </span>
        <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-slate-500 sm:inline-block">
          360° ORBIT
        </span>
      </div>

      {/* Top Right: Glassmorphic Floating Toolbar */}
      <div
        aria-label="3D viewport controls"
        className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/85 p-1 shadow-md shadow-slate-900/5 backdrop-blur-md transition-all hover:bg-white/95"
      >
        {/* Auto-Rotate Toggle */}
        <button
          type="button"
          onClick={handleToggleAutoRotate}
          title={autoRotate ? "Pause 360° turntable rotation" : "Start 360° turntable rotation"}
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
            autoRotate
              ? "bg-teal-600 text-white shadow-xs hover:bg-teal-700"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
          aria-label={autoRotate ? "Pause rotation" : "Play rotation"}
        >
          <svg
            className={`h-4 w-4 ${autoRotate ? "animate-[spin_5s_linear_infinite]" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>

        <div className="mx-0.5 h-4 w-px bg-slate-200" />

        {/* Zoom In */}
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom in (+)"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95"
          aria-label="Zoom in"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Zoom Out */}
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom out (-)"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95"
          aria-label="Zoom out"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Reset View */}
        <button
          type="button"
          onClick={handleReset}
          title="Reset to default angle (Double-click canvas)"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95"
          aria-label="Reset view"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
        </button>

        <div className="mx-0.5 h-4 w-px bg-slate-200" />

        {/* Fullscreen / Expand Toggle */}
        <button
          type="button"
          onClick={handleToggleFullscreen}
          title={isFullscreen ? "Exit full screen (ESC)" : "Full screen mode"}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95"
          aria-label={isFullscreen ? "Exit full screen" : "Full screen mode"}
        >
          {isFullscreen ? (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          )}
        </button>
      </div>

      {/* Bottom Floating Control Bar: Cinematic Camera Presets */}
      <div className="absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Presets Segmented Pill */}
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/90 p-1 shadow-md shadow-slate-900/5 backdrop-blur-md">
          {PRESET_LABELS.map((p) => {
            const isActive = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                  isActive
                    ? "bg-teal-600 text-white shadow-xs font-semibold"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Interaction Guidance Pill */}
        <div
          className={`pointer-events-auto rounded-full border border-slate-200/60 bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-xs backdrop-blur-md transition-opacity duration-300 ${
            hasInteracted ? "opacity-60 hover:opacity-100" : "opacity-100"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <svg className="h-3 w-3 text-teal-600 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
            Drag to rotate 360° · Scroll to zoom
          </span>
        </div>
      </div>
    </div>
  );
}
