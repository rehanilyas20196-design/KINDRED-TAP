"use client";

export function AiMatchPlaceholder() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-6 text-slate-100 shadow-2xl">
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
          </span>
          <h3 className="font-mono text-xs font-bold tracking-wider text-amber-400 uppercase">
            [ AI MATCHING ENGINE MODULE - RESERVED SLOT ]
          </h3>
        </div>
        <span className="rounded-full bg-slate-900 px-3 py-1 font-mono text-[11px] text-slate-500 border border-slate-800">
          STATUS: READY FOR INTEGRATION
        </span>
      </div>

      <div className="mt-5 space-y-3 font-mono text-xs">
        <div className="rounded-2xl border border-dashed border-amber-500/30 bg-slate-900/80 p-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-400 text-base">⚡</span>
            <div>
              <p className="font-semibold text-amber-300">
                Custom AI Matching Engine Placeholder
              </p>
              <p className="mt-1 text-slate-500 leading-relaxed text-[11px]">
                This space is reserved for your custom AI matching engine logic & case routing algorithms.
                API hook endpoint ready at <code className="text-emerald-400">/api/therapist/cases</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Code snippet visualization placeholder */}
        <div className="rounded-2xl bg-black/90 p-4 border border-slate-900 font-mono text-[11px] text-slate-500">
          <div className="flex items-center justify-between text-[10px] text-slate-500 pb-2 border-b border-slate-800/60 mb-2">
            <span>ai_matching_connector.py / .ts</span>
            <span className="text-amber-400/80">{"// Add your AI logic here"}</span>
          </div>
          <p><span className="text-purple-400">async function</span> <span className="text-blue-400">runAIMatching</span>(therapistId, caseVector) &#123;</p>
          <p className="pl-4 text-slate-500">{"// TODO: User will attach custom AI match model after this"}</p>
          <p className="pl-4 text-emerald-400">return &#123; matchScore: 0.98, urgency: &quot;adaptive&quot; &#125;;</p>
          <p>&#125;</p>
        </div>
      </div>
    </div>
  );
}
