"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/* ------------------------------------------------------------------ */
/* Smooth scrolling                                                    */
/* ------------------------------------------------------------------ */

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      duration: 0.9,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.4,
    });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
}

/* ------------------------------------------------------------------ */
/* Scroll reveals — elements tagged `.reveal` fade up once they enter  */
/* the viewport. Always opt-out under prefers-reduced-motion.           */
/* ------------------------------------------------------------------ */

export function RevealObserver() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = new WeakSet<Element>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -4% 0px" }
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>(".reveal, .grow-line").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);

        const delay = el.dataset.delay;
        if (delay) el.style.setProperty("--reveal-delay", `${delay}s`);

        if (reduce) el.classList.add("is-in");
        else observer.observe(el);
      });
    };

    scan();

    const mutation = new MutationObserver(scan);
    mutation.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutation.disconnect();
      observer.disconnect();
    };
  }, []);

  return null;
}
