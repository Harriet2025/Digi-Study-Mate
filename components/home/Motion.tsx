"use client";

import { motion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

// Both components render the same markup on the server and the client (no branching on the
// user's motion setting, which the server can't know). MotionConfig reducedMotion="user" makes
// Motion skip the movement itself for people who prefer reduced motion.

/** Gently bobs up and down forever. */
export function Float({
  children,
  className = "",
  distance = 10,
  duration = 5,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
  duration?: number;
  delay?: number;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        animate={{ y: [0, -distance, 0] }}
        transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

/** Fades and slides content in when it scrolls into view. */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
