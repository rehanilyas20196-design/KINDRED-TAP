"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePortalGuard, GuardSplash, SignedOutPanel } from "@/components/portal-guard";
import { DashboardShell } from "@/components/dashboard";
import { Alert, Badge, Button, ProgressBar, Skeleton } from "@/components/ui";
import { PageTransition, Stagger, StaggerItem } from "@/components/motion-presets";
import { messageFor } from "@/lib/api";
import { portalFor } from "@/lib/portals";
import {
  completeAssessment,
  fetchIssues,
  fetchQuestions,
  saveAnswers,
  startAssessment,
  type AssessmentQuestion,
  type Issue,
} from "@/lib/clinical";

const ROLE = "user";

/** Which test the wizard is on. Both run before the person sees a therapist. */
const STEPS = [
  { test: 1, title: "How you tend to react", blurb: "Ten statements. Answer based on the past few months, not just today." },
  { test: 2, title: "How things have felt lately", blurb: "For each area, pick the answer that fits you best." },
] as const;

/** The two true/false answers map to 1 and 2; False sorts before True. */
const TRUE_FALSE = [
  { value: 1, label: "False" },
  { value: 2, label: "True" },
];

/**
 * One question, rendered from whatever the database says.
 *
 * `questionType` and `options` both come from the server, so this renders a
 * True/False item, a four-option severity item, or a Likert item without any
 * code change per instrument. Deliberately generic: the alternative is three
 * near-identical components that drift apart.
 */
function QuestionCard({
  question,
  index,
  total,
  value,
  onChange,
}: {
  question: AssessmentQuestion;
  index: number;
  total: number;
  value: number | undefined;
  onChange: (next: number) => void;
}) {
  const options =
    question.questionType === "true_false"
      ? TRUE_FALSE
      : (question.options ?? []).map((label, i) => ({ value: i + 1, label }));

  return (
    <fieldset className="card p-5 sm:p-6">
      <legend className="sr-only">{question.prompt}</legend>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Question {index + 1} of {total}
        </p>
        {value !== undefined ? (
          <Badge tone="success" dot>
            Answered
          </Badge>
        ) : null}
      </div>

      <p className="mt-2 text-[0.9375rem] leading-7 text-slate-900">{question.prompt}</p>

      <div
        role="radiogroup"
        aria-label={question.prompt}
        className="mt-4 grid gap-2 sm:grid-cols-2"
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`relative flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                selected
                  ? "border-teal-600 bg-teal-50 text-teal-900 shadow-xs"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
              }`}
            >
              <input
                type="radio"
                name={question.id}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
              />
              <span className="leading-6">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The two-part assessment, then the "describe your feelings" step.
 *
 * Kept as one wizard on purpose. Splitting it across routes would mean storing
 * half-finished state in the URL or re-fetching the assessment on every step,
 * and the whole point is that finishing this is the gate to seeing a therapist.
 */
export default function AssessmentWizard() {
  const router = useRouter();
  const guard = usePortalGuard(ROLE);
  const portal = portalFor(ROLE);
  const reduce = useReducedMotion();

  const [step, setStep] = useState(0);
  const [questions, setQuestions] = useState<AssessmentQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [primary, setPrimary] = useState<string>("");
  const [secondaries, setSecondaries] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Start a fresh assessment on mount. The backend abandons any other
   * in-progress one, so a reload mid-test never leaves two half-filled records.
   */
  useEffect(() => {
    if (guard.kind !== "ready") return;

    let cancelled = false;
    (async () => {
      try {
        const [started, first, issueList] = await Promise.all([
          startAssessment(),
          fetchQuestions(1),
          fetchIssues(),
        ]);
        if (cancelled) return;
        setAssessmentId(started.assessment.id);
        setQuestions(first.questions);
        setIssues(issueList.issues);
      } catch (err) {
        if (!cancelled) setError(messageFor(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [guard.kind]);

  const current = STEPS[step];
  const stepQuestions = useMemo(
    // Step 2 is the free-text concern step and has no questions, so `current`
    // is undefined there. Guard rather than index blindly: reaching step 2 must
    // not crash on `current.test`.
    () => (current ? (questions ?? []).filter((q) => q.testNumber === current.test) : []),
    [questions, current]
  );

  const answeredCount = stepQuestions.filter((q) => answers[q.id] !== undefined).length;
  const complete = stepQuestions.length > 0 && answeredCount === stepQuestions.length;

  const saveStep = useCallback(async () => {
    if (!assessmentId) return;
    const payload = stepQuestions
      .filter((q) => answers[q.id] !== undefined)
      .map((q) => ({ questionId: q.id, value: answers[q.id] }));
    if (payload.length === 0) return;
    await saveAnswers(assessmentId, payload);
  }, [assessmentId, answers, stepQuestions]);

  async function next() {
    setError(null);
    setBusy(true);
    try {
      await saveStep();
      if (step === 0) {
        // Test 2's questions are fetched on demand rather than up front: the
        // server is the source of truth and re-reading it costs one request.
        setQuestions((await fetchQuestions(2)).questions);
        setStep(1);
      } else {
        setStep(2);
      }
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!assessmentId) return;
    if (!primary) {
      setError("Choose what you are dealing with so we can find the right support.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const outcome = await completeAssessment(assessmentId, {
        selectedConcerns: [primary, ...secondaries],
        userDescription: description.trim() || undefined,
      });

      // A safety result never reaches the therapist list.
      if (outcome.isHighRisk) {
        router.push("/portal/user/matching?highRisk=1");
        return;
      }
      router.push("/portal/user/matching");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (guard.kind === "loading") return <GuardSplash />;
  if (guard.kind === "signed-out") return <SignedOutPanel />;
  if (guard.kind === "wrong-portal") {
    return <GuardSplash label="This page is for the Person seeking support portal." />;
  }

  function toggleSecondary(key: string) {
    setSecondaries((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].slice(0, 5)
    );
  }

  const progressValue = step === 0 ? (complete ? 1 : 0) : step === 1 ? (complete ? 2 : 1.5) : 3;
  const stepLabel = step < 2 ? current.title : "Tell us what is going on";
  const stepBlurb =
    step < 2
      ? current.blurb
      : "This goes to us only, and helps us find the right therapist.";

  return (
    <DashboardShell portal={portal!} user={guard.user}>
      <div className="mx-auto max-w-2xl">
        <PageTransition key={step}>
          {/* Step header */}
          <header>
            <div className="flex items-center gap-2.5">
              <Badge tone="accent">
                Step {Math.min(step + 1, 3)} of 3
              </Badge>
              <span className="text-xs text-slate-500">
                {step === 2 ? "Describe how you feel" : "Psychological assessment"}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {stepLabel}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">{stepBlurb}</p>
          </header>

          <div className="mt-5">
            <ProgressBar value={progressValue} total={3} label="Assessment progress" />
          </div>

          {error ? (
            <div className="mt-5">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}

          <div className="mt-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: reduce ? 0.12 : 0.26, ease: [0.22, 1, 0.36, 1] }}
              >
                {step < 2 ? (
                  questions === null ? (
                    <div className="space-y-4" role="status" aria-label="Loading questions">
                      <p className="text-sm text-slate-500">Loading your questions…</p>
                      <Skeleton className="h-40 w-full" count={3} />
                    </div>
                  ) : (
                    <>
                      <Stagger className="space-y-4">
                        {stepQuestions.map((question, index) => (
                          <StaggerItem key={question.id}>
                            <QuestionCard
                              question={question}
                              index={index}
                              total={stepQuestions.length}
                              value={answers[question.id]}
                              onChange={(next) =>
                                setAnswers((prev) => ({ ...prev, [question.id]: next }))
                              }
                            />
                          </StaggerItem>
                        ))}
                      </Stagger>

                      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
                        <p className="text-sm text-slate-500" role="status">
                          {answeredCount} of {stepQuestions.length} answered
                        </p>
                        <Button
                          onClick={next}
                          disabled={!complete || busy}
                          loading={busy}
                        >
                          {step === 0 ? "Continue to next test" : "Continue"}
                        </Button>
                      </div>
                    </>
                  )
                ) : (
                  <div className="space-y-7">
                    <section>
                      <fieldset>
                        <legend className="text-sm font-semibold text-slate-900">
                          What are you dealing with?
                        </legend>
                        <p className="mt-1 text-sm text-slate-500">
                          Pick the one that fits best. You can add more next.
                        </p>
                        <div className="mt-3 grid gap-2">
                          {issues.map((issue) => {
                            const active = primary === issue.key;
                            return (
                              <label
                                key={issue.key}
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 text-sm transition ${
                                  active
                                    ? "border-teal-600 bg-teal-50"
                                    : "border-slate-200 bg-white hover:border-slate-400"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="primary-issue"
                                  checked={active}
                                  onChange={() => setPrimary(issue.key)}
                                  className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
                                />
                                <span>
                                  <span className="block font-medium text-slate-900">
                                    {issue.label}
                                  </span>
                                  {issue.description ? (
                                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                                      {issue.description}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    </section>

                    {primary ? (
                      <section>
                        <p className="text-sm font-semibold text-slate-900">
                          Anything else as well?
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            optional
                          </span>
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {issues
                            .filter((issue) => issue.key !== primary)
                            .map((issue) => {
                              const active = secondaries.includes(issue.key);
                              return (
                                <button
                                  key={issue.key}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => toggleSecondary(issue.key)}
                                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                                    active
                                      ? "border-teal-600 bg-teal-50 text-teal-800"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                                  }`}
                                >
                                  {issue.label}
                                </button>
                              );
                            })}
                        </div>
                      </section>
                    ) : null}

                    <section>
                      <label
                        htmlFor="concern-description"
                        className="text-sm font-semibold text-slate-900"
                      >
                        Describe your feelings in your own words
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          optional
                        </span>
                      </label>
                      <textarea
                        id="concern-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={5}
                        maxLength={2000}
                        placeholder="What has been happening, and how has it been affecting you?"
                        className="field mt-2 resize-y"
                      />
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Only used to help us match you. If you are in immediate danger, please
                        contact your local emergency number.
                      </p>
                    </section>

                    <div className="flex justify-end border-t border-slate-200 pt-5">
                      <Button
                        onClick={finish}
                        disabled={!primary || busy}
                        loading={busy}
                      >
                        {busy ? "Finding therapists…" : "Find therapists for me"}
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </PageTransition>
      </div>
    </DashboardShell>
  );
}
