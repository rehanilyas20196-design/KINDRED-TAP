"use client";

import { useRef } from "react";
import { createAvatar, type AvatarController } from "@bible-strong/avatar-react";

import cubeeDefinition from "@/data/cubee.avatar.json";

/**
 * Cubee, the platform mascot.
 *
 * @bible-strong/avatar-react is AGPL-3.0. Anything that ships alongside it
 * inherits the network-use obligations, so this is a deliberate choice and
 * not an incidental dependency. Remove this component and the package from
 * web/package.json together if that ever stops being acceptable.
 *
 * Two modes, matching the library's own controlled/uncontrolled split:
 *
 * - Without `mood`, Cubee idles and reacts to hover and keyboard focus. The
 *   reaction is imperative rather than state-driven, so there is no extra
 *   render and no effect that would restart the animation on mount.
 * - With `mood`, playback is driven by props. He stops reacting to the
 *   pointer, because a face that answers the conversation is more useful than
 *   one that also twitches when the cursor passes over it.
 */
const CubeeDefinition = createAvatar(cubeeDefinition);

/** Conversation states the assistant maps onto. All ship in the definition. */
export type CubeeMood = "idle" | "listening" | "thinking" | "happy" | "confused" | "sad";

/** What Cubee does when nobody is driving him. */
const REACTION = "excited";

export function Cubee({
  mood,
  size = 96,
  label = "Cubee",
  className,
}: {
  /** When set, playback is controlled by props and pointer reactions are off. */
  mood?: CubeeMood;
  size?: number;
  label?: string;
  className?: string;
}) {
  const controller = useRef<AvatarController>(null);
  const interactive = mood === undefined;

  if (interactive) {
    const react = () => controller.current?.play(REACTION);
    const rest = () => controller.current?.play("idle");

    return (
      <span
        tabIndex={0}
        className={`inline-flex rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${className ?? ""}`}
        onPointerEnter={react}
        onPointerLeave={rest}
        onFocus={react}
        onBlur={rest}
      >
        <CubeeDefinition ref={controller} defaultAnimation="idle" size={size} ariaLabel={label} />
      </span>
    );
  }

  return (
    <span className={`inline-flex rounded-2xl ${className ?? ""}`}>
      <CubeeDefinition animation={mood} size={size} ariaLabel={label} />
    </span>
  );
}
