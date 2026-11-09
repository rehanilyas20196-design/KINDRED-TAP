"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./kindred-tap-animation.module.css";

export function KindredTapAnimation({ className }: { className?: string }) {
  const [replay, setReplay] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.4) {
          setReplay((count) => count + 1);
          setIsPlaying(true);
        } else if (!entry.isIntersecting) {
          setIsPlaying(false);
        }
      },
      { threshold: [0, 0.4] },
    );

    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className={`${styles.root}${className ? ` ${className}` : ""}`}>
      <svg
        key={replay}
        className={`${styles.logo}${isPlaying ? ` ${styles.go}` : ""}`}
        viewBox="440 540 1060 700"
        role="img"
        aria-label="Kindred Tap logo"
      >
        <defs>
          <mask
            id="kindred-tap-reveal"
            maskUnits="userSpaceOnUse"
            x="440"
            y="540"
            width="1060"
            height="700"
          >
            <rect className={styles.wipe} x="440" y="760" width="1060" height="230" fill="#fff" />
          </mask>
        </defs>
        <path className={`${styles.leaf} ${styles.lTop}`} d="M965 563C925 598 915 660 965 707C1015 660 1005 598 965 563Z" />
        <path className={`${styles.leaf} ${styles.lLeft}`} d="M850 661C910 655 958 690 953 764C890 768 845 725 850 661Z" />
        <path className={`${styles.leaf} ${styles.lRight}`} d="M1081 661C1021 655 973 690 978 764C1041 768 1086 725 1081 661Z" />
        <g mask="url(#kindred-tap-reveal)">
          <text className={styles.word} x="471" y="965" textLength="994" lengthAdjust="spacingAndGlyphs">
            KINDRED
          </text>
        </g>
        <circle className={styles.ring} cx="964" cy="1111" r="70" />
        <circle className={`${styles.ring} ${styles.r2}`} cx="964" cy="1111" r="70" />
        <text className={styles.tap} x="816" y="1217" textLength="296" lengthAdjust="spacingAndGlyphs">
          TAP
        </text>
      </svg>
    </div>
  );
}
