"use client";

export function AiMatchPlaceholder() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#8bc0de] bg-[#f0f7fb] p-6 text-[#086288] shadow-2xl">
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#97d7ff]/40 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-[#ffefc4]/70 blur-3xl" />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#8bc0de] pb-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-600" />
          </span>
          <h3 className="font-mono text-xs font-bold tracking-wider text-emerald-700 uppercase">
            [ AI MATCHING ENGINE MODULE - RESERVED SLOT ]
          </h3>
        </div>
        <span className="rounded-full bg-white px-3 py-1 font-mono text-[11px] text-slate-500 border border-[#e2e8f0]">
          STATUS: READY FOR INTEGRATION
        </span>
      </div>

      <div className="mt-5 space-y-3 font-mono text-xs">
        <div className="rounded-2xl border border-dashed border-[#086288]/30 bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-500 text-base">⚡</span>
            <div>
              <p className="font-semibold text-amber-700">
                Custom AI Matching Engine Placeholder
              </p>
              <p className="mt-1 text-slate-500 leading-relaxed text-[11px]">
                This space is reserved for your custom AI matching engine logic & case routing algorithms.
                API hook endpoint ready at <code className="text-emerald-700">/api/therapist/cases</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Code snippet visualization placeholder */}
        <div className="rounded-2xl bg-[#eef7fa] p-4 border border-[#aedae9] font-mono text-[11px] text-[#334155]">
          <div className="flex items-center justify-between text-[10px] text-slate-500 pb-2 border-b border-[#aedae9] mb-2">
            <span>ai_matching_connector.py / .ts</span>
            <span className="text-amber-700">{"// Add your AI logic here"}</span>
          </div>
          <p><span className="text-[#086288]">async function</span> <span className="text-[#335f86]">runAIMatching</span>(therapistId, caseVector) &#123;</p>
          <p className="pl-4 text-slate-500">{"// TODO: User will attach custom AI match model after this"}</p>
          <p className="pl-4 text-emerald-700">return &#123; matchScore: 0.98, urgency: &quot;adaptive&quot; &#125;;</p>
          <p>&#125;</p>
        </div>
      </div>
    </div>
  );
}
