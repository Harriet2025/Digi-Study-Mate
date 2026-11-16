"use client";

import { useEffect, useState } from "react";
import type { GuideDetail, GuideSection } from "@/lib/api";
import { Button, ProgressBar } from "@/components/ui";
import Markdown from "./Markdown";
import MermaidDiagram from "./MermaidDiagram";

export default function LearnTab({ guide, onFinish, onAsk }: { guide: GuideDetail; onFinish: () => void; onAsk: () => void }) {
  const storageKey = `studymate.guide.${guide.guideId}.section`;
  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const sections = guide.sections;
  const section = sections[index];

  // Remember where the student was in this lesson.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (saved > 0 && saved < sections.length) {
        setIndex(saved);
        setVisited(new Set(Array.from({ length: saved + 1 }, (_, i) => i)));
      }
    } catch {
      /* storage unavailable */
    }
  }, [storageKey, sections.length]);

  const go = (i: number) => {
    setIndex(i);
    setVisited((v) => new Set(v).add(i));
    try {
      localStorage.setItem(storageKey, String(i));
    } catch {
      /* storage unavailable */
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!section) return <p className="text-stone">This lesson has no sections.</p>;
  const isLast = index === sections.length - 1;

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      {/* Outline */}
      <aside className="space-y-5 lg:sticky lg:top-36 lg:self-start">
        {index === 0 && guide.overview && (
          <div className="rounded-3xl bg-charcoal p-5 text-cream lg:hidden">
            <Overview guide={guide} />
          </div>
        )}
        <div className="hidden rounded-3xl bg-charcoal p-5 text-cream lg:block">
          <Overview guide={guide} />
        </div>
        <nav aria-label="Lesson sections">
          <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-stone uppercase">
            Step {index + 1} of {sections.length}
          </p>
          <ProgressBar value={((index + 1) / sections.length) * 100} className="mb-3" />
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {sections.map((s, i) => (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === index ? "step" : undefined}
                  className={`flex w-56 items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition lg:w-full ${
                    i === index ? "bg-terracotta-soft/60 font-semibold" : "hover:bg-cream-deep"
                  }`}
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      i === index ? "bg-terracotta text-white" : visited.has(i) ? "bg-sage text-white" : "bg-cream-deep text-stone"
                    }`}
                  >
                    {visited.has(i) && i !== index ? "✓" : i + 1}
                  </span>
                  <span className="line-clamp-2">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      {/* Current section */}
      <article key={section.id} className="min-w-0">
        <SectionView section={section} number={index + 1} />

        <div className="mt-10 flex flex-col-reverse gap-3 border-t border-sand pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="secondary" onClick={() => go(index - 1)} disabled={index === 0}>
            ← Previous
          </Button>
          <button type="button" onClick={onAsk} className="text-sm font-medium text-terracotta-deep hover:underline">
            Confused? Ask a question about this
          </button>
          {isLast ? (
            <Button onClick={onFinish}>Finish: take the quiz →</Button>
          ) : (
            <Button onClick={() => go(index + 1)}>Next: {sections[index + 1]!.title.slice(0, 32)}{sections[index + 1]!.title.length > 32 ? "…" : ""} →</Button>
          )}
        </div>
      </article>
    </div>
  );
}

function Overview({ guide }: { guide: GuideDetail }) {
  return (
    <>
      <p className="text-xs font-semibold tracking-[0.16em] text-terracotta-soft uppercase">What you&apos;ll learn</p>
      {guide.overview && <p className="mt-2 text-sm leading-relaxed text-cream/85">{guide.overview}</p>}
      {guide.objectives.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {guide.objectives.map((o) => (
            <li key={o} className="flex gap-2">
              <span className="text-terracotta-soft" aria-hidden="true">
                ✓
              </span>
              {o}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function SectionView({ section, number }: { section: GuideSection; number: number }) {
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-terracotta-deep uppercase">
            Step {number}
            {section.sourcePages && <span className="ml-2 font-medium text-stone normal-case tracking-normal">· {section.sourcePages}</span>}
          </p>
          <h2 className="mt-1 font-serif text-3xl leading-tight font-semibold text-balance sm:text-4xl">{section.title}</h2>
        </div>
        <ReadAloud section={section} />
      </div>

      <Markdown className="mt-6 text-[17px]">{section.explanation}</Markdown>

      {section.diagram && <MermaidDiagram source={section.diagram} caption={section.diagramCaption} />}

      {section.analogy && (
        <aside className="mt-6 flex gap-4 rounded-3xl bg-terracotta-soft/50 p-5">
          <span className="text-2xl" aria-hidden="true">
            💡
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-terracotta-deep uppercase">Think of it like this</p>
            <p className="mt-1 font-serif text-lg leading-relaxed">{section.analogy}</p>
          </div>
        </aside>
      )}

      {section.example && (
        <aside className="mt-4 rounded-3xl border border-sand bg-cream p-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-sage uppercase">Worked example</p>
          <Markdown className="mt-1">{section.example}</Markdown>
        </aside>
      )}

      {section.keyTerms.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold tracking-[0.14em] text-stone uppercase">Key terms</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {section.keyTerms.map((t) => (
              <div key={t.term} className="rounded-2xl bg-cream-deep/70 px-4 py-3">
                <dt className="font-semibold">{t.term}</dt>
                <dd className="text-sm text-stone">{t.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {section.checkQuestion && (
        <div className="mt-8 rounded-3xl bg-charcoal p-6 text-cream">
          <p className="text-xs font-semibold tracking-[0.16em] text-terracotta-soft uppercase">Quick check</p>
          <p className="mt-2 font-serif text-xl leading-snug">{section.checkQuestion}</p>
          {showAnswer ? (
            <p className="mt-4 rounded-2xl bg-cream/10 px-4 py-3 text-cream/90">{section.checkAnswer}</p>
          ) : (
            <button
              type="button"
              onClick={() => setShowAnswer(true)}
              className="mt-4 rounded-full bg-terracotta px-4 py-2 text-sm font-medium text-white hover:bg-terracotta-deep"
            >
              Think first, then reveal the answer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Reads the section aloud with the browser's built-in speech (free, works offline). */
function ReadAloud({ section }: { section: GuideSection }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [section.id]);

  if (!supported) return null;

  const toggle = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const plain = (text: string) => text.replace(/[*_`#>|]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1");
    const text = [section.title, plain(section.explanation), section.analogy && `Think of it like this. ${section.analogy}`, section.example && `For example. ${plain(section.example)}`]
      .filter(Boolean)
      .join(". ");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-sand bg-cream px-4 py-2 text-sm font-medium transition hover:border-terracotta/50"
    >
      <span aria-hidden="true">{speaking ? "⏹" : "🔊"}</span>
      {speaking ? "Stop reading" : "Read aloud"}
    </button>
  );
}
