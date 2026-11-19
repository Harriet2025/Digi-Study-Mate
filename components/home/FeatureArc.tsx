"use client";

import { Youtube } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import YouTubeLogo from "@/components/brand/YouTubeLogo";
import { FEATURES } from "./features";

const SPACING = 168; // px between neighbouring cards along the arc
const LIFT = 38; // how far the arc drops per card away from the centre
const TILT = 11; // degrees of rotation per card away from the centre
const SPEED = 0.16; // cards per second while gliding

/** Wraps a difference into (-n/2, n/2] so the ring has no seam. */
function wrap(d: number, n: number) {
  return ((((d + n / 2) % n) + n) % n) - n / 2;
}

/** Where a card sits when it is d places from the centre. */
function placement(d: number) {
  const a = Math.abs(d);
  return {
    transform: `translate(-50%, 0) translateX(${d * SPACING}px) translateY(${d * d * LIFT}px) rotate(${d * TILT}deg) scale(${Math.max(0.55, 1 - a * 0.17)})`,
    opacity: String(Math.max(0, 1 - a * 0.32)),
    zIndex: String(100 - Math.round(a * 10)),
    pointerEvents: a > 2.2 ? "none" : "auto",
  } as const;
}

/**
 * Phone version of the feature cards: they glide left to right along an arc, the middle card
 * sitting at the top and largest. Tap a card to stop on it; drag to move through them.
 */
export default function FeatureArc() {
  const n = FEATURES.length;
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const pos = useRef(0); // which card is at the centre (fractional)
  const target = useRef<number | null>(null); // where to settle after a tap
  const paused = useRef(false);
  const drag = useRef<{ x: number; pos: number; moved: boolean } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const layout = useCallback(() => {
    cards.current.forEach((el, i) => {
      if (!el) return;
      Object.assign(el.style, placement(wrap(i - pos.current, n)));
    });
  }, [n]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      paused.current = true;
      setIsPaused(true);
    }
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (target.current !== null) {
        // Ease towards the tapped card along the shortest way round.
        const diff = wrap(target.current - pos.current, n);
        pos.current += diff * Math.min(1, dt * 7);
        if (Math.abs(diff) < 0.002) {
          pos.current = target.current;
          target.current = null;
        }
      } else if (!paused.current && !drag.current) {
        pos.current -= dt * SPEED; // cards travel from left to right
      }
      layout();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [layout, n]);

  const pick = (i: number, fromPointer = false) => {
    if (!fromPointer && drag.current) return; // pointer taps are handled on pointer-up
    paused.current = true;
    setIsPaused(true);
    target.current = i;
    setSelected(i);
  };

  const resume = () => {
    paused.current = false;
    setIsPaused(false);
    setSelected(null);
  };

  const shown = selected !== null ? FEATURES[selected]! : null;

  return (
    <div className="md:hidden">
      <div
        className="relative mx-auto h-[300px] touch-pan-y overflow-hidden select-none"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, pos: pos.current, moved: false };
          target.current = null;
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          if (Math.abs(dx) > 6) {
            drag.current.moved = true;
            paused.current = true;
            setIsPaused(true);
          }
          pos.current = drag.current.pos - dx / SPACING;
        }}
        onPointerUp={(e) => {
          if (drag.current?.moved) {
            const nearest = ((Math.round(pos.current) % n) + n) % n;
            target.current = nearest;
            setSelected(nearest);
          } else {
            // A tap: stop on whichever card is under the finger right now (cards keep moving, so
            // don't wait for the click event).
            const card = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
            if (card) pick(Number(card.dataset.index), true);
          }
          window.setTimeout(() => (drag.current = null), 0);
        }}
        onPointerCancel={() => (drag.current = null)}
        role="group"
        aria-roledescription="carousel"
        aria-label="Features"
      >
        {FEATURES.map((f, i) => (
          <button
            key={f.title}
            ref={(el) => {
              cards.current[i] = el;
            }}
            type="button"
            onClick={() => pick(i)}
            aria-label={f.title}
            data-index={i}
            aria-pressed={selected === i}
            style={placement(wrap(i, n))}
            className="absolute top-4 left-1/2 w-[210px] origin-bottom overflow-hidden rounded-2xl border border-line bg-canvas text-left shadow-xl shadow-ink/10 will-change-transform"
          >
            <span className="relative block aspect-[16/10] border-b border-line bg-page">
              <Image src={`/showcase/${f.image}.webp`} alt={f.alt} fill sizes="210px" className="object-cover object-top" draggable={false} />
            </span>
            <span className="flex items-center gap-2 p-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft text-brand" aria-hidden="true">
                {f.icon === Youtube ? <YouTubeLogo className="h-3" /> : <f.icon className="size-3.5" />}
              </span>
              <span className="truncate text-sm font-semibold">{f.title}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mx-auto -mt-6 flex min-h-20 max-w-xs flex-col items-center px-4 text-center" aria-live="polite">
        {shown ? (
          <>
            <p className="font-display text-lg font-bold">{shown.title}</p>
            <p className="text-sm text-subtle">{shown.body}</p>
          </>
        ) : (
          <p className="text-sm text-subtle">Tap a card to stop it</p>
        )}
        {isPaused && (
          <button type="button" onClick={resume} className="mt-2 text-sm font-medium text-brand hover:underline">
            Keep moving
          </button>
        )}
      </div>
    </div>
  );
}
