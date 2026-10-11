/**
 * Live field state for Cubee, and the form-wide moment that makes him happy.
 *
 * This is a separate vocabulary from `CubeeMood` on purpose. The assistant
 * drives six conversational states; a form has a different and smaller set of
 * things worth showing, and widening the component's type to accommodate them
 * would let a form ask for "thinking", which means nothing while typing an
 * email address. The mapping between the two lives here, in one place.
 */

/** A form's own states, before they are mapped onto a face. */
export type FieldState = "empty" | "ok" | "wrong";

/**
 * The faces a form may show. All ship in the avatar definition.
 *
 * This is a subset of what the assistant uses, and deliberately so: a form
 * that is "thinking" or "confused" is a form that has lost track of what the
 * person is doing, and neither is ever true here.
 */
export type FormMood = "idle" | "listening" | "happy" | "angry" | "shy" | "bored";

/** Live twin of the login form's email check. Submit stays authoritative. */
export function emailState(value: string): FieldState {
  const trimmed = value.trim();
  if (!trimmed) return "empty";
  return /^\S+@\S+\.\S+$/.test(trimmed) ? "ok" : "wrong";
}

/**
 * Live twin of the login form's password check.
 *
 * A password's correctness cannot be judged before submit - only whether it
 * is there, which is exactly the rule the form itself enforces. So it reads
 * as right once it has a value, and as wrong when the server rejects it,
 * which the caller reports through `withError`.
 */
export function passwordState(value: string): FieldState {
  return value ? "ok" : "empty";
}

/** Live twin of the signup form's password rules. */
export function newPasswordState(value: string): FieldState {
  if (!value) return "empty";
  if (value.length < 8) return "wrong";
  return /[A-Za-z]/.test(value) && /\d/.test(value) ? "ok" : "wrong";
}

/** Live twin of the signup form's confirm-password check. */
export function confirmState(value: string, password: string): FieldState {
  if (!value) return "empty";
  return value === password ? "ok" : "wrong";
}

/** Live twin of the signup form's full-name check. */
export function nameState(value: string): FieldState {
  const trimmed = value.trim();
  if (!trimmed) return "empty";
  return trimmed.length >= 2 ? "ok" : "wrong";
}

/**
 * Folds the form's own error for a field into its live state.
 *
 * The live checks above can only see the value, so they cannot know that the
 * server rejected a password or that submit found a missing name. The form's
 * `errors` record is the authoritative word on that, and a field carrying an
 * error is wrong however well-formed the text looks.
 *
 * This is what keeps the outcome on the box it belongs to, where the person
 * is already looking, rather than needing a verdict spelled out above the form.
 */
export function withError(state: FieldState, error?: string): FieldState {
  return error ? "wrong" : state;
}

/**
 * The face a field earns.
 *
 * Three states, three faces, no overlap: wrong is angry, right is happy, and
 * a field nobody has filled in yet earns "shy" rather than an attentive face
 * that suggests something is being watched when nothing has happened.
 *
 * Form vocabulary and Cubee vocabulary are not the same set, so they are
 * translated here rather than at each call site: a form should never have to
 * know that "wrong" is spelled "angry" in the avatar.
 */
export function moodForField(state: FieldState): FormMood {
  switch (state) {
    case "wrong":
      return "angry";
    case "ok":
      return "happy";
    default:
      return "shy";
  }
}

/**
 * What Cubee does between fields. A mascot that never settles is a mascot
 * nobody looks at, so the caller sets this on a timer and clears it the
 * moment the person touches anything.
 *
 * "bored" rather than "sleeping": a form is not a place to fall asleep, and
 * the two read very differently when someone glances at the page mid-task.
 */
export function idleMood(): FormMood {
  return "bored";
}

/** True when the form is complete enough that the mascot may celebrate. */
export function readyToSubmit(states: FieldState[]): boolean {
  return states.length > 0 && states.every((state) => state === "ok");
}

/**
 * How long a reaction is allowed to hold the screen before Cubee settles back
 * down. Long enough to be read, short enough not to nag.
 */
export const REACTION_HOLD_MS = 2400;

/** How long he may sit untouched before showing he is still there. */
export const IDLE_AFTER_MS = 25_000;
