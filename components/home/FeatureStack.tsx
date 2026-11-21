"use client";

import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { ChevronUp, Youtube } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import YouTubeLogo from "@/components/brand/YouTubeLogo";
import { FEATURES } from "./features";

const SHOW_MS = 3200;
// How the sheets underneath sit: a little lower, smaller and alternately tilted, like a pile of paper.
const PILE = [
  { y: 0, scale: 1, rotate: 0 },
  { y: 14, scale: 0.96, rotate: -2.2 },
  { y: 26, scale: 0.92, rotate: 1.8 },
  { y: 36, scale: 0.88, rotate: -1.2 },
];

/**
 * Phone version of the feature cards: a pile of sheets. Every few seconds the top sheet lifts
 * up and away and the next one comes forward; swipe up to send one away yourself.
 */
export default function FeatureStack() {
  const n = FEATURES.length;
  const [top, setTop] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setTop((x) => (x + 1) % n), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [top, n]);

  const next = () => setTop((x) => (x + 1) % n);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y < -50 || info.velocity.y < -350) next();
  };

  // The visible pile, top sheet first.
  const pile = PILE.map((_, k) => ({ k, f: FEATURES[(top + k) % n]!, idx: (top + k) % n }));

  return (
    <div className="px-6 md:hidden">
      <div className="relative mx-auto h-[330px] max-w-sm">
        <AnimatePresence initial={false}>
          {pile
            .slice()
            .reverse()
            .map(({ k, f, idx }) => {
              const p = PILE[k]!;
              const isTop = k === 0;
              return (
                <motion.div
                  key={idx}
                  className="absolute inset-x-0 top-0 h-[290px] overflow-hidden rounded-2xl border border-line bg-canvas shadow-xl shadow-ink/10"
                  style={{ zIndex: 10 - k, transformOrigin: "50% 100%", touchAction: isTop ? "none" : "auto" }}
                  initial={{ opacity: 0, y: PILE[3]!.y + 10, scale: PILE[3]!.scale, rotate: 0 }}
                  animate={{ opacity: k === 3 ? 0.6 : 1, y: p.y, scale: p.scale, rotate: p.rotate }}
                  exit={{ opacity: 0, y: -340, rotate: -6, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] } }}
                  transition={{ type: "spring", stiffness: 220, damping: 26 }}
                  drag={isTop ? "y" : false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0.7, bottom: 0.1 }}
                  onDragEnd={isTop ? onDragEnd : undefined}
                  aria-hidden={!isTop}
                >
                  <div className="relative h-[190px] overflow-hidden border-b border-line bg-page">
                    <Image
                      src={`/showcase/${f.image}.webp`}
                      alt={isTop ? f.alt : ""}
                      fill
                      sizes="384px"
                      priority={k < 2}
                      className="pointer-events-none object-cover object-top"
                      draggable={false}
                    />
                  </div>
                  <div className="flex items-start gap-3 p-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
                      {f.icon === Youtube ? <YouTubeLogo className="h-4" /> : <f.icon className="size-5" />}
                    </span>
                    <span>
                      <span className="block font-display text-lg font-bold">{f.title}</span>
                      <span className="block text-sm text-subtle">{f.body}</span>
                    </span>
                  </div>
                </motion.div>
              );
            })}
        </AnimatePresence>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-sm text-subtle" aria-live="polite">
        <motion.span animate={{ y: [0, -4, 0] }} transition={{ duration: 1.4, repeat: Infinity }} aria-hidden="true">
          <ChevronUp className="size-4" />
        </motion.span>
        Swipe up
        <span className="tabular-nums" aria-label={`Feature ${top + 1} of ${n}`}>
          · {top + 1} / {n}
        </span>
      </div>
    </div>
  );
}
