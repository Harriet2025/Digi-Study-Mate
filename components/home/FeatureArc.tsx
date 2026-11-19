"use client";

import { Youtube } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import YouTubeLogo from "@/components/brand/YouTubeLogo";
import { FEATURES } from "./features";

// The cards sit on the top of an imaginary wheel: evenly spaced, each tilted to follow the curve.
const RADIUS = 300; // px, radius of the wheel
const STEP = 28; // degrees between neighbouring cards
const SPEED = 0.12; // cards per second
const CARD_W = 132;

/** Wraps a difference into (-n/2, n/2] so the ring has no seam. */
function wrap(d: number, n: number) {
  return ((((d + n / 2) % n) + n) % n) - n / 2;
}

/** Position of a card d places from the top of the arc. */
function placement(d: number) {
  const deg = d * STEP;
  const rad = (deg * Math.PI) / 180;
  const x = RADIUS * Math.sin(rad);
  const y = RADIUS * (1 - Math.cos(rad));
  const a = Math.abs(d);
  const centre = Math.max(0, 1 - a); // 1 at the top, 0 one place away
  return {
    transform: `translate(-50%, 0) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${deg.toFixed(1)}deg) scale(${(1 + 0.16 * centre).toFixed(3)})`,
    opacity: String(a > 2.6 ? 0 : a > 2 ? (2.6 - a) / 0.6 : 1),
    zIndex: String(100 - Math.round(a * 10)),
    pointerEvents: a > 2.4 ? "none" : "auto",
  } as const;
}

/**
 * Phone version of the feature cards: they keep travelling left to right along an arc.
 * Tap one to stop on it; it starts moving again when you scroll away and come back.
 */
export default function FeatureArc() {
  const n = FEATURES.length;
  const root = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const pos = useRef(0); // which card is at the top (fractional)
  const target = useRef<number | null>(null); // where to settle after a tap
  const paused = useRef(false);
  const touch = useRef<{ x: number; y: number; pos: number; dragging: boolean } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const layout = useCallback(() => {
    cards.current.forEach((el, i) => {
      if (el) Object.assign(el.style, placement(wrap(i - pos.current, n)));
    });
  }, [n]);

  const resume = useCallback(() => {
    paused.current = false;
    target.current = null;
    setSelected(null);
  }, []);

  // Animation loop. Gentler (but still moving) when the phone asks for reduced motion.
  useEffect(() => {
    const speed = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? SPEED / 2 : SPEED;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (target.current !== null) {
        const diff = wrap(target.current - pos.current, n);
        pos.current += diff * Math.min(1, dt * 7);
        if (Math.abs(diff) < 0.002) {
          pos.current = target.current;
          target.current = null;
        }
      } else if (!paused.current && !touch.current?.dragging) {
        pos.current -= dt * speed; // cards travel from left to right
      }
      layout();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [layout, n]);

  // Scrolled away and back again: start moving.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry!.isIntersecting) resume();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [resume]);

  const pick = (i: number) => {
    paused.current = true;
    target.current = i;
    setSelected(i);
  };

  const shown = selected !== null ? FEATURES[selected]! : null;

  return (
    <div ref={root} className="md:hidden">
      <div
        className="relative mx-auto h-[320px] touch-pan-y overflow-hidden select-none"
        onPointerDown={(e) => {
          touch.current = { x: e.clientX, y: e.clientY, pos: pos.current, dragging: false };
        }}
        onPointerMove={(e) => {
          const t = touch.current;
          if (!t) return;
          const dx = e.clientX - t.x;
          const dy = e.clientY - t.y;
          // Only a clearly sideways movement counts as dragging the cards (not scrolling the page).
          if (!t.dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) t.dragging = true;
          if (t.dragging) pos.current = t.pos - dx / 150;
        }}
        onPointerUp={(e) => {
          const t = touch.current;
          touch.current = null;
          if (t?.dragging) return; // let go after dragging: keep gliding from there
          const card = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
          if (card) pick(Number(card.dataset.index));
        }}
        onPointerCancel={() => (touch.current = null)}
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
            data-index={i}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pick(i);
              }
            }}
            aria-label={f.title}
            aria-pressed={selected === i}
            style={{ ...placement(wrap(i, n)), width: CARD_W }}
            className="absolute top-12 left-1/2 origin-bottom overflow-hidden rounded-xl border border-line bg-canvas text-left shadow-lg shadow-ink/10 will-change-transform"
          >
            <span className="relative block aspect-[4/3] border-b border-line bg-page">
              <Image src={`/showcase/${f.image}.webp`} alt={f.alt} fill sizes="150px" className="object-cover object-top" draggable={false} />
            </span>
            <span className="flex items-center gap-1.5 px-2 py-2">
              <span className="grid size-5 shrink-0 place-items-center rounded bg-brand-soft text-brand" aria-hidden="true">
                {f.icon === Youtube ? <YouTubeLogo className="h-2.5" /> : <f.icon className="size-3" />}
              </span>
              <span className="line-clamp-2 text-[11px] leading-tight font-semibold">{f.title}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mx-auto -mt-10 flex min-h-20 max-w-xs flex-col items-center px-4 text-center" aria-live="polite">
        {shown ? (
          <>
            <p className="font-display text-lg font-bold">{shown.title}</p>
            <p className="text-sm text-subtle">{shown.body}</p>
            <button type="button" onClick={resume} className="mt-2 text-sm font-medium text-brand hover:underline">
              Keep moving
            </button>
          </>
        ) : (
          <p className="text-sm text-subtle">Tap a card to stop it</p>
        )}
      </div>
    </div>
  );
}
