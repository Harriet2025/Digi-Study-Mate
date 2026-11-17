"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/** Types each word, pauses, deletes it and moves on. Screen readers get the full list once. */
export default function Typewriter({ words, className = "" }: { words: string[]; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
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
  }, [deleting, index, length, reduceMotion, words]);

  const text = reduceMotion ? words[0] : words[index]!.slice(0, length);
  return (
    <span className={className}>
      <span className="sr-only">{words.join(", ")}</span>
      <span aria-hidden="true">
        {text}
        <span className="ml-0.5 inline-block h-[0.9em] w-[3px] translate-y-[0.1em] rounded-full bg-current motion-safe:animate-pulse" />
      </span>
    </span>
  );
}
