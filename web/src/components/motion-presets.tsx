"use client";

/**
 * Motion presets built on Framer Motion.
 *
 * Everything here is short, low-distance and honours prefers-reduced-motion
 * (Framer Motion's `useReducedMotion` collapses each preset to a plain fade
 * or removes it entirely). Use these instead of hand-rolling variants so the
 * product moves the same way on every screen.
 */

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: EASE } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.22, ease: "easeOut" } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.24, ease: EASE } },
};

export const stagger = (delay = 0.05, staggerChildren = 0.05): Variants => ({
  hidden: {},
  show: { transition: { delayChildren: delay, staggerChildren } },
});

/** Page-level entrance: a single, restrained fade-and-rise. */
export function PageTransition({
  children,
  className = "",
  ...rest
}: ComponentPropsWithoutRef<typeof motion.div>) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      {...rest}
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.32, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered list entrance — use for card grids and result lists. */
export function Stagger({
  children,
  className = "",
  delay = 0.04,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={reduce ? fadeIn : stagger(delay, 0.055)}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={reduce ? fadeIn : fadeUp}>
      {children}
    </motion.div>
  );
}

/** One-shot entrance for a single card or panel. */
export function Rise({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.36, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}
