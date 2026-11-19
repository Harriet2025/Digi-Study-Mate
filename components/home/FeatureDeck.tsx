"use client";

import { AnimatePresence, motion } from "motion/react";
import { Youtube } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import YouTubeLogo from "@/components/brand/YouTubeLogo";
import { FEATURES } from "./features";

const SHOW_MS = 3600;

/**
 * Phone version of the feature cards: a neat stacked deck that deals the next card every few
 * seconds, with a grid of icons underneath to jump to any feature. Tapping stops it on that
 * feature; it starts again when you scroll away and come back.
 */
export default function FeatureDeck() {
  const n = FEATURES.length;
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      setDirection(1);
      setActive((a) => (a + 1) % n);
    }, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [active, playing, n]);

  // Scrolled away and back again: start playing.
  const resume = useCallback(() => setPlaying(true), []);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry!.isIntersecting) resume();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [resume]);

  const choose = (i: number) => {
    setDirection(i >= active ? 1 : -1);
    setActive(i);
    setPlaying(false);
  };

  const f = FEATURES[active]!;
  const behind = [1, 2].map((k) => FEATURES[(active + k) % n]!);

  return (
    <div ref={root} className="px-4 md:hidden">
      {/* The deck */}
      <div className="relative mx-auto h-[300px] max-w-sm">
        {/* Two cards peeking out behind */}
        {behind
          .map((b, k) => (
            <div
              key={b.title}
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-[268px] rounded-2xl border border-line bg-canvas shadow-md transition-all duration-500"
              style={{ transform: `translateY(${(k + 1) * 14}px) scale(${1 - (k + 1) * 0.05})`, opacity: 1 - (k + 1) * 0.25, zIndex: 10 - k }}
            />
          ))
          .reverse()}

        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.button
            key={f.title}
            type="button"
            custom={direction}
            onClick={() => setPlaying((p) => !p)}
            aria-label={`${f.title}. ${playing ? "Tap to stop here" : "Tap to keep playing"}`}
            className="absolute inset-x-0 top-0 z-20 h-[268px] overflow-hidden rounded-2xl border border-line bg-canvas text-left shadow-xl shadow-ink/10"
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: direction * -220, rotate: direction * -8, transition: { duration: 0.35 } }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <span className="relative block h-[172px] overflow-hidden border-b border-line bg-page">
              <Image src={`/showcase/${f.image}.webp`} alt={f.alt} fill sizes="384px" className="object-cover object-top" draggable={false} />
            </span>
            <span className="flex items-start gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
                {f.icon === Youtube ? <YouTubeLogo className="h-4" /> : <f.icon className="size-5" />}
              </span>
              <span>
                <span className="block font-display text-lg font-bold">{f.title}</span>
                <span className="block text-sm text-subtle">{f.body}</span>
              </span>
            </span>
          </motion.button>
        </AnimatePresence>
      </div>

      {/* Icon picker */}
      <div className="mx-auto mt-2 grid max-w-sm grid-cols-4 gap-2" role="tablist" aria-label="Choose a feature">
        {FEATURES.map((x, i) => {
          const on = i === active;
          return (
            <button
              key={x.title}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={x.title}
              onClick={() => choose(i)}
              className={`relative grid h-12 place-items-center overflow-hidden rounded-xl border transition ${
                on ? "border-brand bg-brand text-white shadow-md shadow-brand/25" : "border-line bg-canvas text-subtle"
              }`}
            >
              {x.icon === Youtube ? (
                <YouTubeLogo className="relative z-10 h-4" />
              ) : (
                <x.icon className="relative z-10 size-5" aria-hidden="true" />
              )}
              {/* Timer: fills while this feature is showing */}
              {on && playing && (
                <motion.span
                  key={`t-${active}`}
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-1 origin-left bg-white/60"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: SHOW_MS / 1000, ease: "linear" }}
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-subtle" aria-live="polite">
        {playing ? "Tap an icon to stop on it" : (
          <button type="button" onClick={resume} className="font-medium text-brand">
            Keep playing
          </button>
        )}
      </p>
    </div>
  );
}
