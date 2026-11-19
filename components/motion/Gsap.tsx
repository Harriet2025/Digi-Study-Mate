"use client";

/**
 * Small, restrained GSAP effects for the app screens. Every effect:
 * - renders the final content on the server (no layout shift, works without JavaScript),
 * - only animates when the user hasn't asked for reduced motion,
 * - runs once as it scrolls into view (no constant movement).
 */

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef, type ReactNode } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const MOTION_OK = "(prefers-reduced-motion: no-preference)";

/** Fades and lifts every child marked data-reveal as it scrolls into view, in a gentle stagger. */
export function RevealGroup({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "ul" }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        const items = gsap.utils.toArray<HTMLElement>("[data-reveal]", ref.current);
        gsap.set(items, { autoAlpha: 0, y: 28 });
        ScrollTrigger.batch(items, {
          start: "top 90%",
          once: true,
          onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08, overwrite: true }),
        });
      });
    },
    { scope: ref },
  );
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={className}>
      {children}
    </Tag>
  );
}

/** Counts a number up from zero when it scrolls into view. */
export function CountUp({ value, className = "", suffix = "" }: { value: number; className?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        const el = ref.current!;
        const counter = { n: 0 };
        el.textContent = `0${suffix}`;
        gsap.to(counter, {
          n: value,
          duration: Math.min(1.6, 0.6 + value / 60),
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 95%", once: true },
          onUpdate: () => {
            el.textContent = `${Math.round(counter.n)}${suffix}`;
          },
        });
      });
    },
    { dependencies: [value], scope: ref },
  );
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value}
      {suffix}
    </span>
  );
}

/** Types a heading out once, letter by letter, when it first appears. */
export function TypedHeading({ text, className = "", as: Tag = "h1" }: { text: string; className?: string; as?: "h1" | "h2" | "p" }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        const target = ref.current!.querySelector<HTMLElement>("[data-typed]")!;
        const caret = ref.current!.querySelector<HTMLElement>("[data-caret]")!;
        const state = { n: 0 };
        target.textContent = "";
        gsap.set(caret, { autoAlpha: 1 });
        gsap.to(state, {
          n: text.length,
          duration: Math.min(1.6, text.length * 0.035),
          ease: "none",
          delay: 0.15,
          onUpdate: () => {
            target.textContent = text.slice(0, Math.round(state.n));
          },
          onComplete: () => {
            gsap.to(caret, { autoAlpha: 0, duration: 0.4, delay: 0.8 });
          },
        });
      });
    },
    { dependencies: [text], scope: ref },
  );
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={className} aria-label={text}>
      <span data-typed aria-hidden="true">
        {text}
      </span>
      <span data-caret aria-hidden="true" className="invisible ml-1 inline-block h-[0.85em] w-[3px] translate-y-[0.08em] rounded-full bg-brand" />
    </Tag>
  );
}

/** A hand-drawn style underline that draws itself in. */
export function DrawLine({ className = "" }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        const path = ref.current!.querySelector("path")!;
        const length = path.getTotalLength();
        gsap.fromTo(
          path,
          { strokeDasharray: length, strokeDashoffset: length },
          { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", delay: 0.5, scrollTrigger: { trigger: ref.current, start: "top 95%", once: true } },
        );
      });
    },
    { scope: ref },
  );
  return (
    <svg ref={ref} viewBox="0 0 220 12" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d="M2 8 C 50 2, 120 2, 218 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** Moves decorative content slightly slower or faster than the page as you scroll (parallax). */
export function Parallax({ children, speed = 0.15, className = "" }: { children?: ReactNode; speed?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.to(ref.current, {
          yPercent: -speed * 100,
          ease: "none",
          scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom top", scrub: true },
        });
      });
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className} aria-hidden="true">
      {children}
    </div>
  );
}

/** Grows bars (or anything marked data-grow) from zero to their size when they scroll into view. */
export function GrowGroup({ children, className = "", axis = "y" }: { children: ReactNode; className?: string; axis?: "x" | "y" }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        const items = gsap.utils.toArray<HTMLElement>("[data-grow]", ref.current);
        gsap.from(items, {
          [axis === "y" ? "scaleY" : "scaleX"]: 0,
          transformOrigin: axis === "y" ? "bottom" : "left",
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.05,
          scrollTrigger: { trigger: ref.current, start: "top 90%", once: true },
        });
      });
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
