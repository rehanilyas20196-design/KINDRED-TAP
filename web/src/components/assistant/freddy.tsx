"use client";

import { useEffect, useRef } from "react";
import { createAvatar, type AvatarController } from "@bible-strong/avatar-react";

import freddyDefinition from "@/data/freddy.avatar.json";

const FreddyDefinition = createAvatar(freddyDefinition);

/**
 * How the assistant is feeling, in the vocabulary the definition actually
 * ships. These are animation keys, so a typo here is a console error rather
 * than a silent blank face.
 */
export type FreddyMood = "idle" | "listening" | "thinking" | "happy" | "confused" | "sad";

const MOOD_ARIA: Record<FreddyMood, string> = {
  idle: "waiting",
  listening: "listening",
  thinking: "thinking",
  happy: "happy",
  confused: "unsure",
  sad: "concerned",
};

/**
 * Freddy, the support assistant's face.
 *
 * The mood is driven by the parent - he is not decoration that animates on a
 * loop for its own sake. Each state maps onto a real moment in the
 * conversation so a person can tell at a glance whether the assistant is
 * listening, working, or has run out of answers.
 */
export function Freddy({ mood, size = 88 }: { mood: FreddyMood; size?: number }) {
  const controller = useRef<AvatarController>(null);

  useEffect(() => {
    controller.current?.play(mood);
  }, [mood]);

  return (
    <FreddyDefinition
      ref={controller}
      defaultAnimation={mood}
      size={size}
      ariaLabel={`Freddy, the support assistant, is ${MOOD_ARIA[mood]}`}
    />
  );
}
