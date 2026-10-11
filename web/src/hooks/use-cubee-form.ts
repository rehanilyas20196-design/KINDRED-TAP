"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IDLE_AFTER_MS,
  REACTION_HOLD_MS,
  idleMood,
  moodForField,
  readyToSubmit,
  type FieldState,
  type FormMood,
} from "@/lib/cubee-form";

/**
 * Drives Cubee on a form.
 *
 * The mood is derived, not stored. Field states, the last submit outcome and
 * an idle flag go in; one mood comes out, in priority order, so no caller can
 * invent a rule:
 *
 *   happy     - the form was accepted
 *   angry     - the submit failed, or a field is wrong
 *   happy     - every field is right
 *   listening - someone is typing
 *   bored     - nothing has happened for a while, which is his way of being present
 *   idle      - otherwise
 *
 * Only the idle flag is state, because only the passage of time is state: the
 * moment a field is touched he is no longer waiting, and that is computed
 * rather than written by an effect.
 *
 * One effect owns the clock, and it always returns a cleanup, so it obeys the
 * rules of hooks whether or not there is anything to time. Reactions hold for
 * REACTION_HOLD_MS then settle; a quiet form drifts to bored after
 * IDLE_AFTER_MS. Because the mood is a function of state, no timer can cancel
 * a reaction by accident - two sources of truth were the bug this replaced.
 */
export function useCubeeForm(states: Record<string, FieldState>, accepted?: boolean) {
  const [idleFor, setIdleFor] = useState(false);
  const values = useMemo(() => Object.values(states), [states]);

  // Touched means he is not waiting any more, so the flag only has to answer
  // for the case where every field is back to empty - which is what happens
  // when a form clears itself after a successful submit.
  const touched = values.some((value) => value !== "empty");

  const mood: FormMood = useMemo(() => {
    if (accepted === true) return "happy";
    if (accepted === false || values.includes("wrong")) return moodForField("wrong");
    if (readyToSubmit(values)) return moodForField("ok");
    if (!touched || idleFor) return idleMood();
    return "listening";
  }, [accepted, values, touched, idleFor]);

  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (mood === "bored") return undefined;

    timer.current = window.setTimeout(
      () => setIdleFor(mood === "idle"),
      mood === "idle" ? IDLE_AFTER_MS : REACTION_HOLD_MS
    );

    return () => window.clearTimeout(timer.current);
  }, [mood]);

  return { mood };
}

export type { FieldState };
export { moodForField };
