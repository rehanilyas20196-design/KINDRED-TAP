import Image from "next/image";
import Link from "next/link";
import { PORTALS, loginPath, signupPath } from "@/lib/portals";
import { PortalIcon } from "@/components/portal-icon";
import { Logo } from "@/components/logo";
import { Icon } from "@/components/icons";
import { Cubee } from "@/components/cubee";
import type { IconName } from "@/components/icons";
import BlurText from "@/components/BlurText";

const TRUST = [
  "Six dedicated portals",
  "Ethical agreement built in",
  "Nothing shared without consent",
];

const STEPS: { title: string; body: string; icon: IconName }[] = [
  {
    title: "Assessment",
    body: "A short, plain-language check-in about how you have been feeling and what you are looking for.",
    icon: "assessments",
  },
  {
    title: "Describe your situation",
    body: "In your own words, without a form full of clinical jargon. Only what you choose to share.",
    icon: "clients",
  },
  {
    title: "Match and begin",
    body: "We route you to the right kind of support — peer, therapeutic or clinical — and the conversation starts in a private room.",
    icon: "messages",
  },
];

const PRINCIPLES: { title: string; body: string; icon: IconName }[] = [
  {
    title: "Ethics are part of sign-up",
    body: "Supporters, therapists, advisors, supervisors and clinics accept a versioned ethical agreement before they can work.",
    icon: "ethics",
  },
  {
    title: "Consent before anything moves",
    body: "Profiles, notes and matches are only visible to the people taking part in them. Nothing is shared on your behalf.",
    icon: "lock",
  },
  {
    title: "Someone is always watching the standard",
    body: "Clinical advisors and supervisors review escalations, supervise practitioners and keep the guidelines current.",
    icon: "supervision",
  },
  {
    title: "Every portal has its own door",
    body: "Separate accounts, separate workspaces, separate permissions. Your therapist never sees a clinic's records by accident.",
    icon: "clients",
  },
];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 text-teal-600"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-slate-100">
      {/* One restrained wash behind the hero — a tint, not a gradient for
          its own sake. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(120%_80%_at_50%_-10%,var(--color-teal-50)_0%,transparent_70%)]"
      />

      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="flex items-center justify-between gap-3 py-3 sm:gap-4">
            <Link href="/" className="flex shrink-0 items-center rounded-lg">
              <Logo className="h-9 w-auto sm:h-10" />
            </Link>

            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              <Link
                href="/#how-it-works"
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                How it works
              </Link>
              <Link
                href="/#portals"
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Portals
              </Link>
              <Link
                href="/#principles"
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Our principles
              </Link>
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <Link href="/login" className="btn btn-ghost btn-sm whitespace-nowrap">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm whitespace-nowrap">
                Create account
              </Link>
            </div>
          </div>

          <nav
            aria-label="Sections"
            className="no-scrollbar -mx-5 flex gap-1 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 md:hidden"
          >
            <Link
              href="/#how-it-works"
              className="flex min-h-[44px] shrink-0 items-center rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              How it works
            </Link>
            <Link
              href="/#portals"
              className="flex min-h-[44px] shrink-0 items-center rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Portals
            </Link>
            <Link
              href="/#principles"
              className="flex min-h-[44px] shrink-0 items-center rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Our principles
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="relative outline-none">
        {/* ---------------------------------------------------------------- */}
        {/* Hero                                                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <p className="eyebrow reveal reveal-nav" data-delay="0.05">
                Mental health support platform
              </p>
              <h1
                className="reveal reveal-up mt-4 max-w-xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.07] lg:text-[3.4rem]"
                data-delay="0.1"
              >
                Care that is organised around the people who give it.
              </h1>
              <BlurText
                text="Six portals, one per role. People seeking support, peer supporters, therapists, clinical advisors, supervisors and partner clinics each sign in to their own workspace — so the right people see the right things, and nobody else does."
                className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg"
                animationFrom={{ filter: "blur(6px)", opacity: 0, y: 10 }}
                delay={26}
                stepDuration={0.3}
              />

              <div className="reveal reveal-up mt-8 flex flex-wrap items-center gap-3" data-delay="0.26">
                <Link href="/signup" className="btn btn-primary btn-lg">
                  Create your account
                </Link>
                <Link href="/login" className="btn btn-secondary btn-lg">
                  Sign in
                </Link>
              </div>

              <ul
                className="reveal reveal-up mt-9 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-xs font-medium text-slate-500"
                data-delay="0.34"
              >
                {TRUST.map((item) => (
                  <li key={item} className="inline-flex items-center gap-2">
                    <CheckIcon />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Illustrative flow — the path to support, shown as one picture. */}
            <div className="reveal reveal-right" data-delay="0.2">
              <Cubee size={104} className="mb-4" />
              <div className="card p-4 shadow-sm sm:p-5">
                <Image
                  src="/support-path.png"
                  alt="The path to support: a short assessment, a description in your own words, then a match and a private room — nothing leaves your account without consent."
                  width={572}
                  height={1024}
                  priority
                  className="h-auto w-full rounded-xl"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* How it works                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="mx-auto w-full max-w-6xl scroll-mt-32 px-5 py-14 sm:px-8 sm:py-20 md:scroll-mt-24"
        >
          <div className="max-w-2xl">
            <p className="eyebrow reveal reveal-nav">How it works</p>
            <h2
              id="how-heading"
              className="reveal reveal-up mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
            >
              Three steps, and none of them ask you to know the right word.
            </h2>
            <p className="reveal reveal-up mt-3 text-sm leading-6 text-slate-600 sm:text-base" data-delay="0.08">
              The assessment is written for a person having a hard week, not for a clinician
              filling in a form. Everything that follows is built from what you actually said.
            </p>
          </div>

          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="card reveal reveal-up p-6"
                data-delay={`${index * 0.08}`}
              >
                <span className="text-xs font-semibold tabular-nums text-teal-700">
                  Step {index + 1}
                </span>
                <h3 className="mt-2 text-base font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Portals                                                           */}
        {/* ---------------------------------------------------------------- */}
        <section
          id="portals"
          aria-labelledby="portals-heading"
          className="mx-auto w-full max-w-6xl scroll-mt-32 px-5 py-14 sm:px-8 sm:py-20 md:scroll-mt-24"
        >
          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-10">
            <div className="max-w-2xl">
              <p className="eyebrow reveal reveal-nav">Choose your portal</p>
              <h2
                id="portals-heading"
                className="reveal reveal-up mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
              >
                Every role works from its own account and its own workspace.
              </h2>
            </div>
            <p className="reveal reveal-up max-w-xs text-sm leading-6 text-slate-500" data-delay="0.08">
              Pick the door that matches what you do here. You can hold only the account you
              signed up for.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PORTALS.map((portal, index) => (
              <article
                key={portal.key}
                className="card card-interactive reveal reveal-up flex flex-col p-5 sm:p-6"
                data-delay={`${(index % 3) * 0.07}`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                    <PortalIcon role={portal.key} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">{portal.portal}</h3>
                    <p className="text-xs leading-5 text-slate-500">{portal.tagline}</p>
                  </div>
                </div>

                <p className="mt-4 border-t border-slate-200 pt-4 text-sm leading-6 text-slate-600">
                  {portal.description}
                </p>

                <ol className="mt-4 flex-1 space-y-1.5">
                  {portal.journey.map((step, stepIndex) => (
                    <li key={step} className="flex gap-2 text-xs leading-5 text-slate-500">
                      <span className="font-semibold tabular-nums text-teal-700">
                        {stepIndex + 1}.
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>

                <div className="mt-5 flex gap-2">
                  <Link href={loginPath(portal.key)} className="btn btn-secondary flex-1 whitespace-nowrap">
                    Log in
                  </Link>
                  <Link href={signupPath(portal.key)} className="btn btn-primary flex-1 whitespace-nowrap">
                    Sign up
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Principles                                                        */}
        {/* ---------------------------------------------------------------- */}
        <section
          id="principles"
          aria-labelledby="principles-heading"
          className="mx-auto w-full max-w-6xl scroll-mt-32 px-5 py-14 sm:px-8 sm:py-20 md:scroll-mt-24"
        >
          <div className="max-w-2xl">
            <p className="eyebrow reveal reveal-nav">Our principles</p>
            <h2
              id="principles-heading"
              className="reveal reveal-up mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
            >
              The rules the product is built to keep.
            </h2>
          </div>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((item, index) => (
              <li
                key={item.title}
                className="card reveal reveal-up flex gap-4 p-6"
                data-delay={`${(index % 2) * 0.08}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-teal-700 ring-1 ring-inset ring-slate-200">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-500">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Closing call to action                                            */}
        {/* ---------------------------------------------------------------- */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24">
          <div className="card reveal reveal-up overflow-hidden p-8 text-center sm:p-12">
            <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Start where you actually are.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
              Create an account, take the assessment, and see what the matching suggests. You
              can stop at any point, and nothing is shared until you continue.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn btn-primary btn-lg">
                Create your account
              </Link>
              <Link href="/login" className="btn btn-secondary btn-lg">
                I already have one
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div className="max-w-xs">
              <Logo className="h-9 w-auto" />
              <p className="mt-3 text-xs leading-5 text-slate-500">
                A mental health support platform connecting people seeking support with peer
                supporters, therapists, clinical teams and partner clinics.
              </p>
            </div>

            <nav aria-label="Footer" className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Get started
                </p>
                <ul className="mt-2.5 space-y-1.5 text-sm">
                  <li>
                    <Link href="/signup" className="flex min-h-[44px] items-center text-slate-600 transition hover:text-teal-700 sm:min-h-0">
                      Create an account
                    </Link>
                  </li>
                  <li>
                    <Link href="/login" className="flex min-h-[44px] items-center text-slate-600 transition hover:text-teal-700 sm:min-h-0">
                      Log in
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/login"
                      className="flex min-h-[44px] items-center text-slate-600 transition hover:text-teal-700 sm:min-h-0"
                    >
                      Choose a portal
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  For professionals
                </p>
                <ul className="mt-2.5 space-y-1.5 text-sm">
                  <li>
                    <Link
                      href={signupPath("supporter")}
                      className="flex min-h-[44px] items-center text-slate-600 transition hover:text-teal-700 sm:min-h-0"
                    >
                      Become a supporter
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={signupPath("therapist")}
                      className="flex min-h-[44px] items-center text-slate-600 transition hover:text-teal-700 sm:min-h-0"
                    >
                      Join as a therapist
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={signupPath("collaborative_clinic")}
                      className="flex min-h-[44px] items-center text-slate-600 transition hover:text-teal-700 sm:min-h-0"
                    >
                      Register a clinic
                    </Link>
                  </li>
                </ul>
              </div>
            </nav>
          </div>

          <p className="mt-9 border-t border-slate-200 pt-6 text-xs leading-5 text-slate-400">
            Supporter, therapist, clinical and clinic portals require accepting the ethical
            agreement before sign-up is complete.
          </p>
        </div>
      </footer>
    </div>
  );
}
