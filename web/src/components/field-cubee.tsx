"use client";

import { Cubee } from "@/components/cubee";
import { moodForField, type FieldState, type FormMood } from "@/lib/cubee-form";

/**
 * Puts Cubee next to a field and lets the field drive his face.
 *
 * He sits in the label row, to the right - the one space a form does not need,
 * since the label is short and the input is below. Inline would either shrink
 * the input or wrap the label onto two lines.
 *
 * He is `aria-hidden`. The field already announces its state through
 * `aria-invalid` and the note underneath; a second announcement of "Cubee is
 * happy" would be noise on top of a message that actually helps. The colour
 * never carries meaning alone either - the note still says what is wrong, so
 * he is decoration that happens to be correct.
 *
 * This also drops the label's own bottom margin. `field-label` sets it because
 * most labels stand alone; here the input is below the whole row, so the
 * margin would open a gap between Cubee and the field.
 */
export function FieldCubee({
  id,
  label,
  state,
  size = 48,
}: {
  id: string;
  label: string;
  state: FieldState;
  size?: number;
}) {
  const mood: FormMood = moodForField(state);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="field-label mb-0">
        {label}
      </label>
      <span className="ml-auto shrink-0 self-start" aria-hidden="true">
        <Cubee mood={mood} size={size} label="" />
      </span>
    </div>
  );
}
