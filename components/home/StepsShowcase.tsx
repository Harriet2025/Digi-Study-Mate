"use client";

import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import { ArrowRight, BookOpenText, Check, FileText, Trophy, Upload, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Upload, title: "Upload", body: "Slides or notes, PDF or PowerPoint." },
  { icon: BookOpenText, title: "Learn", body: "Read, see, listen, ask." },
  { icon: Trophy, title: "Practise", body: "Flashcards, quizzes, a final rating." },
];
const STEP_MS = 4200;

/** "How it works" as a small interactive demo: the steps play in turn, each with a moving preview. */
export default function StepsShowcase() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || reduce) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % STEPS.length), STEP_MS);
    return () => window.clearTimeout(t);
  }, [active, auto, reduce]);

  // After a tap, carry on playing a little later.
  useEffect(() => {
    if (auto) return;
    const t = window.setTimeout(() => setAuto(true), 9000);
    return () => window.clearTimeout(t);
  }, [auto, active]);

  const choose = (i: number) => {
    setActive(i);
    setAuto(false);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="mt-12 grid grid-cols-1 items-center gap-8 md:grid-cols-[0.9fr_1.1fr] md:gap-12">
        {/* Step list (a row on phones, a column with a filling line on larger screens) */}
        <ol className="relative grid grid-cols-3 gap-2 md:grid-cols-1 md:gap-4" role="tablist" aria-label="How it works">
          <span aria-hidden="true" className="absolute top-7 right-[16%] left-[16%] h-0.5 bg-line md:top-8 md:right-auto md:bottom-8 md:left-8 md:h-auto md:w-0.5" />
          <motion.span
            aria-hidden="true"
            className="absolute top-7 left-[16%] h-0.5 bg-brand md:top-8 md:left-8 md:hidden"
            animate={{ width: `${(active / (STEPS.length - 1)) * 68}%` }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          />
          <motion.span
            aria-hidden="true"
            className="absolute top-8 left-8 hidden w-0.5 bg-brand md:block"
            animate={{ height: `calc(${(active / (STEPS.length - 1)) * 100}% - ${(active / (STEPS.length - 1)) * 4}rem)` }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          />
          {STEPS.map((s, i) => {
            const on = i === active;
            const done = i < active;
            return (
              <li key={s.title} className="relative">
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => choose(i)}
                  className={`flex w-full flex-col items-center gap-2 rounded-2xl p-2 text-center transition md:flex-row md:items-center md:gap-4 md:p-3 md:text-left ${
                    on ? "md:bg-canvas md:shadow-lg md:shadow-ink/5" : "hover:md:bg-canvas/60"
                  }`}
                >
                  <motion.span
                    animate={{ scale: on ? 1.08 : 1 }}
                    className={`relative z-10 grid size-14 shrink-0 place-items-center rounded-2xl transition-colors md:size-10 ${
                      on ? "bg-brand text-white shadow-lg shadow-brand/30" : done ? "bg-brand-soft text-brand" : "border border-line bg-canvas text-subtle"
                    }`}
                  >
                    {done ? <Check className="size-5" aria-hidden="true" /> : <s.icon className="size-6 md:size-5" aria-hidden="true" />}
                  </motion.span>
                  <span>
                    <span className={`block font-display font-semibold ${on ? "text-ink" : "text-subtle"}`}>
                      <span className="hidden md:inline">{i + 1}. </span>
                      {s.title}
                    </span>
                    <span className="hidden text-sm text-subtle md:block">{s.body}</span>
                  </span>
                </button>
                {/* Timer under the active step */}
                {on && auto && !reduce && (
                  <motion.span
                    key={`bar-${active}`}
                    aria-hidden="true"
                    className="absolute right-4 bottom-0 left-4 h-0.5 origin-left rounded-full bg-brand/40 md:left-[4.25rem]"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: STEP_MS / 1000, ease: "linear" }}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* Preview stage */}
        <div className="relative h-72 overflow-hidden rounded-3xl border border-line bg-canvas p-6 shadow-xl shadow-ink/5 sm:h-80" aria-live="polite">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:18px_18px] opacity-70"
          />
          <p className="sr-only">
            Step {active + 1}: {STEPS[active]!.title}. {STEPS[active]!.body}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              className="relative h-full"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {active === 0 && <UploadScene />}
              {active === 1 && <LearnScene />}
              {active === 2 && <PractiseScene />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}

function UploadScene() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5" aria-hidden="true">
      <div className="relative grid h-36 w-full max-w-sm place-items-center rounded-2xl border-2 border-dashed border-brand/30 bg-brand-soft/30">
        <motion.div
          initial={{ y: -90, rotate: -8, opacity: 0 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.2 }}
          className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-3 shadow-lg"
        >
          <span className="grid h-11 w-9 place-items-center rounded-md bg-brand text-[9px] font-bold text-white">PDF</span>
          <span>
            <span className="block text-sm font-semibold">Cell Biology.pdf</span>
            <span className="block text-xs text-subtle">24 pages</span>
          </span>
        </motion.div>
      </div>
      <div className="w-full max-w-sm">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <motion.div className="h-full rounded-full bg-brand" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 2, delay: 0.8, ease: "easeInOut" }} />
        </div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.9 }} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-success">
          <Check className="size-4" /> Ready to study
        </motion.p>
      </div>
    </div>
  );
}

const LESSON = "Glycolysis splits one glucose into two pyruvate, making a little ATP.";

function LearnScene() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN((x) => (x >= LESSON.length ? x : x + 1)), 32);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="flex h-full flex-col justify-center gap-5" aria-hidden="true">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">Step 1 of 5</p>
        <p className="mt-1 font-display text-xl font-bold">Glycolysis</p>
        <p className="mt-2 min-h-12 text-sm text-ink/80">
          {LESSON.slice(0, n)}
          <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-brand" />
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs font-medium">
        {["Glucose", "Pyruvate", "ATP"].map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4 + i * 0.45 }}
              className="flex-1 rounded-lg border border-brand/30 bg-brand-soft px-2 py-2.5 text-center text-brand-deep"
            >
              {label}
            </motion.span>
            {i < 2 && (
              <motion.span initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ delay: 1.7 + i * 0.45 }}>
                <ArrowRight className="size-4 text-subtle" />
              </motion.span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PractiseScene() {
  const [score, setScore] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setScore((s) => (s >= 92 ? 92 : s + 2)), 30);
    return () => window.clearInterval(t);
  }, []);
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex h-full items-center justify-center gap-6 sm:gap-10" aria-hidden="true">
      <div className="text-center">
        <span className="relative inline-grid size-28 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="8" />
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-success)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} />
          </svg>
          <span className="font-display text-2xl font-bold tabular-nums">{score}%</span>
        </span>
        <p className="mt-2 text-sm font-semibold text-success">Excellent</p>
      </div>
      <div className="[perspective:800px]">
        <motion.div
          className="relative h-32 w-40 [transform-style:preserve-3d] sm:w-48"
          initial={{ rotateY: 0 }}
          animate={{ rotateY: 180 }}
          transition={{ delay: 1.6, duration: 0.7, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 flex flex-col justify-center rounded-2xl border border-line bg-canvas p-4 shadow-lg [backface-visibility:hidden]">
            <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-brand uppercase">
              <FileText className="size-3" /> Question
            </p>
            <p className="mt-1 text-sm font-semibold">Where does glycolysis happen?</p>
          </div>
          <div className="absolute inset-0 flex flex-col justify-center rounded-2xl bg-brand p-4 text-white shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="text-[10px] font-semibold tracking-wide text-brand-soft uppercase">Answer</p>
            <p className="mt-1 text-sm font-semibold">In the cytoplasm.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
