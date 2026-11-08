import Link from "next/link";
import { ETHICS_VERSION } from "@/lib/portals";
import { Logo } from "@/components/logo";
import { HeroScene } from "@/components/hero-visual";
import { PortalShowcase } from "@/components/portal-showcase";

const TRUST_TAGS = [
  "🔒 Encrypted Rooms",
  `⚖️ Ethics v${ETHICS_VERSION}`,
  "🛡️ Clinical Oversight",
  "⚡ Instant Matching",
];

const METRICS = [
  { value: "6", label: "Dedicated Portals", note: "Isolated workspaces" },
  { value: "100%", label: "Consent-Governed", note: "No unapproved sharing" },
  { value: "2 mins", label: "Plain Intake", note: "Zero medical jargon" },
  { value: "24/7", label: "Safety Triage", note: "Supervisory oversight" },
];

const STEPS = [
  {
    num: "01",
    title: "Check In",
    desc: "A brief, plain-language check-in about how you feel today.",
  },
  {
    num: "02",
    title: "In Your Words",
    desc: "Share your situation naturally. Only what you choose to disclose.",
  },
  {
    num: "03",
    title: "Match & Begin",
    desc: "Connect to peer supporters or therapists in an encrypted room.",
  },
];

const PRINCIPLES = [
  {
    title: "Role Isolation",
    desc: "Every portal has its own account and permissions. Records never cross boundaries.",
  },
  {
    title: "Mandatory Ethics",
    desc: `All providers and clinics accept Ethical Agreement v${ETHICS_VERSION} before practice.`,
  },
  {
    title: "Strict Consent",
    desc: "Notes, profiles, and sessions belong to you. Nothing is shared without approval.",
  },
  {
    title: "Active Supervision",
    desc: "Licensed clinical supervisors review safety escalations and quality standards.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#FAF6EE] text-[#0B1B3D] font-sans antialiased selection:bg-[#FFEAE8] selection:text-[#0B1B3D]">
      {/* ---------------------------------------------------------------- */}
      {/* Crisis Helpline Ribbon (Cream & Coral)                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-b border-[#E5D9C5] bg-[#F2EAD9] px-4 py-2 text-center text-xs text-[#0B1B3D]/75">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span className="font-semibold text-[#0B1B3D]">Crisis Notice:</span>
          <span>In immediate danger or acute distress? Call or text</span>
          <a href="tel:988" className="font-bold text-[#FF6B6B] hover:underline">
            988
          </a>
          <span>for free, confidential 24/7 support.</span>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Header (Cream, Navy & Coral)                                     */}
      {/* ---------------------------------------------------------------- */}
      <header className="sticky top-0 z-[100] transition-colors duration-200 border-b border-[#E5D9C5] bg-[#FAF6EE]/90 backdrop-blur-md">
        <nav className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between gap-6">
          <Link className="flex items-center gap-2.5 shrink-0" href="/">
            <Logo className="h-8 w-auto" />
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight text-[#0B1B3D]">
                Kindred Tap
              </span>
              <span className="block font-mono text-[10px] tracking-[0.08em] text-[#0B1B3D]/50 uppercase">
                Care · Connect · Heal
              </span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-7">
            <Link
              className="text-sm font-medium text-[#0B1B3D] hover:text-[#FF6B6B] transition-colors px-1 py-2"
              href="#how-it-works"
            >
              How It Works
            </Link>
            <Link
              className="text-sm font-medium text-[#0B1B3D] hover:text-[#FF6B6B] transition-colors px-1 py-2"
              href="#portals"
            >
              Portals
            </Link>
            <Link
              className="text-sm font-medium text-[#0B1B3D] hover:text-[#FF6B6B] transition-colors px-1 py-2"
              href="#principles"
            >
              Principles
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              className="text-sm font-medium text-[#0B1B3D] hover:text-[#FF6B6B] px-3 py-2 transition-colors"
              href="/login"
            >
              Log In
            </Link>
            <Link
              className="inline-flex items-center rounded-md bg-[#0B1B3D] text-[#FAF6EE] text-sm font-medium px-[18px] py-[9px] hover:bg-[#FF6B6B] hover:text-white transition-colors"
              href="/signup"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Hero Section                                                     */}
      {/* ---------------------------------------------------------------- */}
      <main id="main-content" className="flex-1 outline-none">
        <section className="border-b border-[#E5D9C5] bg-[#FAF6EE]">
          <div className="mx-auto max-w-6xl px-6 py-12 md:py-20">
            <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
              {/* Left Column: Short, Punchy Copy */}
              <div>
                <div>
                  <span className="badge-tilted">Mental Health Platform</span>
                </div>

                <h1 className="mt-6 font-display text-[38px] leading-[1.12] md:text-[54px] md:leading-[1.08] font-bold tracking-tight text-[#0B1B3D]">
                  Care built around the people who give it.
                </h1>

                <p className="mt-4 text-base md:text-lg leading-relaxed text-[#0B1B3D]/70 max-w-lg font-normal">
                  Six dedicated portals. One confidential workspace per role — ensuring the right
                  people see the right things, and nobody else does.
                </p>

                {/* Primary Button Group */}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/signup"
                    className="inline-flex items-center rounded-md bg-[#0B1B3D] text-[#FAF6EE] text-sm font-medium px-[20px] py-[12px] hover:bg-[#FF6B6B] hover:text-white transition-colors shadow-xs"
                  >
                    Get Started
                  </Link>
                  <Link
                    href="#portals"
                    className="inline-flex items-center rounded-md bg-[#FFEAE8] text-[#0B1B3D] text-sm font-medium px-[20px] py-[12px] hover:bg-[#FFD0CC] border border-[#FFD0CC] transition-colors"
                  >
                    Browse Portals
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center rounded-md border border-[#E5D9C5] bg-white text-[#0B1B3D] text-sm font-medium px-[20px] py-[12px] hover:border-[#0B1B3D] transition-colors"
                  >
                    Sign In
                  </Link>
                </div>

                {/* Trust Tags */}
                <div className="mt-8 flex flex-wrap items-center gap-2">
                  {TRUST_TAGS.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-[#E5D9C5] bg-[#F2EAD9] px-2.5 py-1 text-xs font-mono text-[#0B1B3D]/75"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right Column: Hero 3D Scene */}
              <div>
                <div className="rounded-xl border border-[#E5D9C5] bg-white p-2 shadow-xs">
                  <div className="mb-2 flex items-center justify-between px-2 text-xs">
                    <span className="font-semibold text-[#0B1B3D]">Private Consultation Room</span>
                    <span className="font-mono text-[11px] text-[#0B1B3D]/50">360° Interactive</span>
                  </div>
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#FAF6EE] sm:aspect-[16/11]">
                    <HeroScene className="absolute inset-0 h-full w-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Metric Strip                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section className="border-b border-[#E5D9C5] bg-[#F2EAD9]/70 py-8">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              {METRICS.map((m) => (
                <div key={m.label} className="border-l-2 border-[#FF6B6B] pl-4">
                  <span className="font-display text-2xl md:text-3xl font-bold text-[#0B1B3D]">
                    {m.value}
                  </span>
                  <p className="text-xs font-semibold text-[#0B1B3D]">{m.label}</p>
                  <p className="text-[11px] text-[#0B1B3D]/50">{m.note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* How It Works (Concise)                                           */}
        {/* ---------------------------------------------------------------- */}
        <section id="how-it-works" className="border-b border-[#E5D9C5] bg-[#FAF6EE] py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-xl">
              <span className="font-mono text-xs font-semibold text-[#FF6B6B] uppercase tracking-wider">
                Process
              </span>
              <h2 className="mt-2 font-display text-3xl md:text-4xl font-bold text-[#0B1B3D]">
                Three simple steps. No clinical paperwork.
              </h2>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {STEPS.map((s) => (
                <div
                  key={s.title}
                  className="rounded-xl border border-[#E5D9C5] bg-white p-6 shadow-xs hover:border-[#FF6B6B] transition-colors"
                >
                  <span className="font-mono text-xs font-bold text-[#FF6B6B]">{s.num}</span>
                  <h3 className="mt-2 font-display text-lg font-bold text-[#0B1B3D]">{s.title}</h3>
                  <p className="mt-1.5 text-xs text-[#0B1B3D]/65 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Choose Your Portal                                                */}
        {/* ---------------------------------------------------------------- */}
        <section id="portals" className="border-b border-[#E5D9C5] bg-[#F2EAD9]/30 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-xl">
              <span className="font-mono text-xs font-semibold text-[#FF6B6B] uppercase tracking-wider">
                Workspaces
              </span>
              <h2 className="mt-2 font-display text-3xl md:text-4xl font-bold text-[#0B1B3D]">
                Six dedicated portals. One account each.
              </h2>
              <p className="mt-1.5 text-xs text-[#0B1B3D]/65">
                Select the role that fits your work. Permissions are strictly isolated.
              </p>
            </div>

            <PortalShowcase />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Principles                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section id="principles" className="border-b border-[#E5D9C5] bg-[#FAF6EE] py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-xl">
              <span className="font-mono text-xs font-semibold text-[#FF6B6B] uppercase tracking-wider">
                Commitments
              </span>
              <h2 className="mt-2 font-display text-3xl md:text-4xl font-bold text-[#0B1B3D]">
                Built on rules we never break.
              </h2>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {PRINCIPLES.map((p) => (
                <div
                  key={p.title}
                  className="rounded-xl border border-[#E5D9C5] bg-white p-6 hover:border-[#0B1B3D] transition-colors"
                >
                  <h3 className="font-display text-base font-bold text-[#0B1B3D]">{p.title}</h3>
                  <p className="mt-1.5 text-xs text-[#0B1B3D]/65 leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Closing Call to Action (Navy & Coral)                            */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-[#FAF6EE] py-16 md:py-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="rounded-2xl bg-[#0B1B3D] p-10 md:p-14 text-center text-[#FAF6EE] shadow-sm">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-[#FAF6EE]">
                Start where you are.
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#FAF6EE]/75">
                Take a brief check-in. Completely confidential, free to explore, and nothing is shared
                until you decide to connect.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center rounded-md bg-[#FF6B6B] text-white text-sm font-medium px-[22px] py-[12px] hover:bg-[#FAF6EE] hover:text-[#0B1B3D] transition-colors shadow-xs"
                >
                  Create Free Account
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-md border border-[#E5D9C5]/40 text-[#FAF6EE] text-sm font-medium px-[22px] py-[12px] hover:bg-white/10 transition-colors"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------------------------------------------------------- */}
      {/* Footer (Navy, Cream & Coral)                                     */}
      {/* ---------------------------------------------------------------- */}
      <footer className="border-t border-[#183366] bg-[#07132C] text-[#FAF6EE]">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="md:col-span-1">
              <Link className="flex items-center gap-2.5" href="/">
                <Logo variant="onDark" className="h-8 w-auto" />
                <span className="text-[15px] font-semibold text-[#FAF6EE]">Kindred Tap</span>
              </Link>
              <p className="mt-4 text-sm text-[#FAF6EE]/70 leading-relaxed max-w-xs">
                An ethical mental health ecosystem connecting users, peer supporters, therapists,
                and clinics.
              </p>
              <form className="mt-5 flex gap-2">
                <input
                  type="email"
                  placeholder="Your email"
                  className="flex-1 min-w-0 rounded-full border border-[#183366] bg-white/5 px-[18px] py-[10px] text-sm text-[#FAF6EE] placeholder-[#FAF6EE]/40 outline-none focus:border-[#FF6B6B] transition-colors"
                />
                <button
                  type="button"
                  className="rounded-md text-sm font-medium px-[18px] py-[10px] transition-colors shrink-0 bg-[#FF6B6B] text-white hover:bg-[#FAF6EE] hover:text-[#0B1B3D]"
                >
                  Join
                </button>
              </form>
            </div>

            <div>
              <h5 className="text-sm font-semibold text-[#FAF6EE] mb-4">Portals</h5>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <Link href="/login/user" className="text-[#FAF6EE]/70 hover:text-[#FF6B6B] transition-colors">
                    User Portal
                  </Link>
                </li>
                <li>
                  <Link
                    href="/login/supporter"
                    className="text-[#FAF6EE]/70 hover:text-[#FF6B6B] transition-colors"
                  >
                    Supporter Portal
                  </Link>
                </li>
                <li>
                  <Link
                    href="/login/therapist"
                    className="text-[#FAF6EE]/70 hover:text-[#FF6B6B] transition-colors"
                  >
                    Therapist Portal
                  </Link>
                </li>
                <li>
                  <Link
                    href="/login/collaborative_clinic"
                    className="text-[#FAF6EE]/70 hover:text-[#FF6B6B] transition-colors"
                  >
                    Partner Clinics
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="text-sm font-semibold text-[#FAF6EE] mb-4">Governance</h5>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <Link href="#principles" className="text-[#FAF6EE]/70 hover:text-[#FF6B6B] transition-colors">
                    Ethical Code v{ETHICS_VERSION}
                  </Link>
                </li>
                <li>
                  <Link href="#principles" className="text-[#FAF6EE]/70 hover:text-[#FF6B6B] transition-colors">
                    Clinical Standards
                  </Link>
                </li>
                <li>
                  <Link href="#principles" className="text-[#FAF6EE]/70 hover:text-[#FF6B6B] transition-colors">
                    Safety Escalation
                  </Link>
                </li>
                <li>
                  <Link href="#principles" className="text-[#FAF6EE]/70 hover:text-[#FF6B6B] transition-colors">
                    Privacy Protocols
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="text-sm font-semibold text-[#FAF6EE] mb-4">Crisis Help (24/7)</h5>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a href="tel:988" className="font-bold text-[#FF6B6B] hover:underline">
                    988 Suicide & Crisis Lifeline
                  </a>
                </li>
                <li className="text-[#FAF6EE]/70">Text HOME to 741741</li>
                <li className="text-[#FAF6EE]/70">Free, confidential 24/7 support</li>
                <li className="text-xs text-[#FAF6EE]/50 mt-2">
                  Not an emergency service. In crisis, call 988 or 911 immediately.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-[#183366] flex flex-wrap justify-between gap-3 text-xs text-[#FAF6EE]/50 font-mono tracking-[0.04em]">
            <span>© {new Date().getFullYear()} Kindred Tap</span>
            <span>Care that is organised around the people who give it.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
