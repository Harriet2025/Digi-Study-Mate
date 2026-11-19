"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Types each word, pauses, deletes it and moves on. Screen readers get the full list once.
 * The first word is rendered in full on the server and on the first client render (so they match);
 * the typing only starts after mounting, and never when the user prefers reduced motion.
 */
export default function Typewriter({ words, className = "" }: { words: string[]; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(words[0]!.length);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    setStarted(true);
  }, [reduceMotion]);

  useEffect(() => {
    if (!started) return;
    const word = words[index]!;
    let delay = deleting ? 45 : 85;
    if (!deleting && length === word.length) delay = 1800; // hold the full word
    if (deleting && length === 0) delay = 350;

    const timer = setTimeout(() => {
      if (!deleting && length === word.length) setDeleting(true);
      else if (deleting && length === 0) {
        setDeleting(false);
        setIndex((i) => (i + 1) % words.length);
      } else setLength((l) => l + (deleting ? -1 : 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [started, deleting, index, length, words]);

  return (
    <span className={className}>
      <span className="sr-only">{words.join(", ")}</span>
      <span aria-hidden="true">
        {words[index]!.slice(0, length)}
        <span className="ml-0.5 inline-block h-[0.9em] w-[3px] translate-y-[0.1em] rounded-full bg-current motion-safe:animate-pulse" />
      </span>
    </span>
  );
}
