"use client";

import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  FilePlus2,
  FileStack,
  Minus,
  RefreshCw,
  Sparkles,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DrawLine, GrowGroup, RevealGroup, TypedHeading } from "@/components/motion/Gsap";
import { api, ApiError, timeAgo, type BankDetail, type ExamTopic } from "@/lib/api";
import { Button, ErrorNote, LoadingBlock, ProgressBar, Spinner } from "@/components/ui";
import { ScoreBadge } from "./ExamsHome";

const PRIORITY = {
  high: "bg-ink text-canvas",
  medium: "bg-brand-soft text-brand-deep",
  low: "bg-muted text-subtle",
} as const;

const TREND: Record<ExamTopic["trend"], { icon: LucideIcon; label: string }> = {
  rising: { icon: TrendingUp, label: "Rising" },
  steady: { icon: Minus, label: "Steady" },
  falling: { icon: TrendingDown, label: "Falling" },
  new: { icon: Sparkles, label: "New" },
};

type View = "topics" | "predicted" | "mock" | "attempts";
const VIEWS: { key: View; label: string; icon: LucideIcon }[] = [
  { key: "topics", label: "Topics", icon: BarChart3 },
  { key: "predicted", label: "Likely questions", icon: Sparkles },
  { key: "mock", label: "Mock exam", icon: Timer },
  { key: "attempts", label: "Attempts", icon: ClipboardList },
];

export default function BankView({ bankId }: { bankId: string }) {
  const router = useRouter();
  const [bank, setBank] = useState<BankDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [mode, setMode] = useState<"exam" | "practice">("exam");
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState(30);
  const [view, setView] = useState<View>("topics");
  const addRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setBank(await api.bank(bankId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this bank.");
    }
  }, [bankId]);
  useEffect(() => {
    load();
  }, [load]);

  const building = bank?.status === "queued" || bank?.status === "processing";
  useEffect(() => {
    if (!building) return;
    const t = window.setInterval(load, 3000);
    return () => window.clearInterval(t);
  }, [building, load]);

  const startMock = async (opts: { mode: "exam" | "practice"; topic?: string; questionCount?: number; durationMinutes?: number }) => {
    setStarting(opts.topic ?? opts.mode);
    try {
      const mock = await api.createMock({
        bankId,
        mode: opts.mode,
        topic: opts.topic,
        questionCount: opts.questionCount ?? count,
        durationMinutes: opts.durationMinutes ?? minutes,
      });
      router.push(`/exams/mock/${mock.mockId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start that test.");
      setStarting(null);
    }
  };

  const addPapers = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const form = new FormData();
    [...files].forEach((f) => form.append("papers", f));
    try {
      await api.addPapers(bankId, form);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add those papers.");
    }
  };

  const remove = async () => {
    if (!bank || !window.confirm(`Delete the ${bank.course} bank, its papers and mock exams? This can't be undone.`)) return;
    await api.deleteBank(bankId).catch(() => undefined);
    router.push("/exams");
  };

  if (error && !bank) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!bank) return <LoadingBlock label="Loading your past papers…" />;

  const maxPapers = Math.max(1, ...bank.topics.map((t) => t.papersAppeared), bank.paperCount);

  return (
    <div className="space-y-12">
      <div>
        <Link href="/exams" className="text-sm font-medium text-subtle hover:text-ink">
          ← All exams
        </Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              <FileStack className="size-4" aria-hidden="true" /> Past-paper bank
            </p>
            <TypedHeading text={bank.course} className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-4xl" />
            <DrawLine className="mt-1 h-3 w-40 text-brand/30" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => addRef.current?.click()} disabled={building}>
              <FilePlus2 className="size-4" aria-hidden="true" /> Add papers
            </Button>
            <input ref={addRef} type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md" className="sr-only" onChange={(e) => addPapers(e.target.files)} />
            {bank.status === "failed" && (
              <Button variant="secondary" onClick={() => api.reanalyseBank(bankId).then(load)}>
                <RefreshCw className="size-4" aria-hidden="true" /> Try again
              </Button>
            )}
            <Button variant="danger" onClick={remove} aria-label="Delete this bank">
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <ul className="mt-5 flex flex-wrap gap-2">
          {bank.papers.map((p) => (
            <li key={p.paperId} className="rounded-full border border-line bg-canvas px-3 py-1 text-sm">
              <span className="font-medium">{p.year || p.filename}</span>
              {p.questionCount > 0 && <span className="text-subtle"> · {p.questionCount} questions</span>}
            </li>
          ))}
        </ul>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {building && (
        <section className="rounded-3xl border border-line bg-canvas p-8 text-center">
          <Spinner className="mx-auto size-7 text-brand" />
          <p className="mt-4 font-display text-xl font-bold">{bank.stageLabel}…</p>
          <p className="mt-1 text-subtle">Reading every question and grouping them by topic. About a minute per paper.</p>
          <ProgressBar value={bank.progress} className="mx-auto mt-6 max-w-md" />
        </section>
      )}

      {bank.status === "failed" && !building && <ErrorNote>{bank.error ?? "These papers couldn't be analysed."}</ErrorNote>}

      {bank.status === "ready" && (
        <>
          {bank.overview && (
            <details className="group max-w-3xl rounded-2xl border border-line bg-canvas px-4 py-3 text-sm">
              <summary className="cursor-pointer list-none font-medium text-ink">
                How these exams work <span className="text-subtle group-open:hidden">(tap to read)</span>
              </summary>
              <p className="mt-2 text-subtle">{bank.overview}</p>
            </details>
          )}

          {/* One section at a time */}
          <div className="sticky top-16 z-20 -mx-4 border-b border-line bg-page/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
            <nav aria-label="Bank sections" className="flex gap-1 overflow-x-auto">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  aria-current={view === v.key ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${
                    view === v.key ? "bg-ink text-canvas" : "text-subtle hover:bg-muted hover:text-ink"
                  }`}
                >
                  <v.icon className="size-4" aria-hidden="true" />
                  {v.label}
                  {v.key === "attempts" && bank.mocks.length > 0 && <span className="text-xs opacity-70">{bank.mocks.length}</span>}
                </button>
              ))}
            </nav>
          </div>

          {view === "topics" && (
            <>
          {/* Topics */}
          <section>
            <SectionTitle icon={BarChart3} title="Topics that keep coming up" />
            <GrowGroup axis="x" className="mt-6 space-y-3">
              {bank.topics.map((t) => {
                const Trend = TREND[t.trend];
                return (
                  <details key={t.name} className="group rounded-2xl border border-line bg-canvas p-4 open:shadow-md sm:p-5">
                    <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center">
                      <span className="min-w-0 sm:w-64 sm:shrink-0">
                        <span className="block font-semibold">{t.name}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${PRIORITY[t.priority]}`}>{t.priority} priority</span>
                          <span className="inline-flex items-center gap-1 text-subtle">
                            <Trend.icon className="size-3.5" aria-hidden="true" /> {Trend.label}
                          </span>
                        </span>
                      </span>
                      <span className="flex flex-1 items-center gap-3">
                        <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                          <span data-grow className="block h-full rounded-full bg-brand" style={{ width: `${(t.papersAppeared / maxPapers) * 100}%` }} />
                        </span>
                        <span className="w-28 shrink-0 text-right text-sm text-subtle">
                          {t.papersAppeared}/{bank.paperCount} papers{t.totalMarks > 0 && ` · ${t.totalMarks}m`}
                        </span>
                      </span>
                    </summary>
                    <div className="mt-4 border-t border-line pt-4 text-sm">
                      <p className="text-subtle">{t.summary}</p>
                      {t.sampleQuestions.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {t.sampleQuestions.map((q) => (
                            <li key={q} className="rounded-lg bg-page px-3 py-2">
                              “{q}”
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        onClick={() => startMock({ mode: "practice", topic: t.name, questionCount: 6, durationMinutes: 15 })}
                        disabled={starting !== null}
                        className="mt-4 inline-flex items-center gap-2 font-medium text-brand hover:underline"
                      >
                        {starting === t.name ? <Spinner className="size-3.5" /> : null} Practise this topic <ArrowRight className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </details>
                );
              })}
            </GrowGroup>
          </section>

            </>
          )}
          {view === "predicted" && (
            <>
          {/* Predicted questions */}
          <section>
            <SectionTitle icon={Sparkles} title="Likely to come out" />
            <p className="mt-2 text-sm text-subtle">Informed predictions from your past papers and slides, not guarantees. Revise the whole course.</p>
            <RevealGroup className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {bank.predicted.map((p, i) => (
                <article data-reveal key={i} className="flex flex-col rounded-2xl border border-line bg-canvas p-5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className={`rounded-full px-2.5 py-0.5 font-semibold ${p.likelihood === "high" ? "bg-ink text-canvas" : "bg-brand-soft text-brand-deep"}`}>
                      {p.likelihood === "high" ? "Very likely" : "Likely"}
                    </span>
                    <span className="text-subtle">
                      {p.topic}
                      {p.marks > 0 && ` · ${p.marks} marks`}
                    </span>
                  </div>
                  <p className="mt-3 font-display text-lg leading-snug font-semibold">{p.question}</p>
                  <p className="mt-2 text-sm text-subtle">{p.reason}</p>
                  <button
                    type="button"
                    onClick={() => startMock({ mode: "practice", topic: p.topic, questionCount: 6, durationMinutes: 15 })}
                    disabled={starting !== null}
                    className="mt-auto inline-flex items-center gap-2 pt-4 text-sm font-medium text-brand hover:underline"
                  >
                    Practise this <ArrowRight className="size-4" aria-hidden="true" />
                  </button>
                </article>
              ))}
            </RevealGroup>
          </section>

            </>
          )}
          {view === "mock" && (
            <>
          {/* Exam builder */}
          <section className="relative overflow-hidden rounded-3xl bg-ink p-6 text-canvas sm:p-8">
            <div aria-hidden="true" className="absolute -top-20 -right-16 size-72 rounded-full bg-brand/40 blur-3xl" />
            <div className="relative grid grid-cols-1 items-end gap-6 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-brand-soft uppercase">
                  <Timer className="size-4" aria-hidden="true" /> Practise like it&apos;s the real thing
                </p>
                <div className="mt-4 inline-flex rounded-full bg-canvas/10 p-1" role="radiogroup" aria-label="Type of test">
                  {(["exam", "practice"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      onClick={() => setMode(m)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${mode === m ? "bg-canvas text-ink" : "text-canvas/80 hover:text-canvas"}`}
                    >
                      {m === "exam" ? "Timed mock exam" : "Practice test"}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-sm text-canvas/70">
                  {mode === "exam" ? "No hints. Marked at the end, with the topics that cost you the most marks." : "Check each answer as you go, with explanations."}
                </p>
                <div className="mt-5 grid max-w-md grid-cols-2 gap-4">
                  <DarkSlider label="Questions" value={count} min={4} max={25} onChange={setCount} />
                  <DarkSlider label="Minutes" value={minutes} min={5} max={120} step={5} onChange={setMinutes} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => startMock({ mode })}
                disabled={starting !== null}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-canvas px-7 py-3.5 font-medium text-ink transition hover:bg-brand-soft disabled:opacity-60"
              >
                {starting === mode ? <Spinner className="size-4" /> : <Timer className="size-4" aria-hidden="true" />}
                {mode === "exam" ? "Start mock exam" : "Start practice test"}
              </button>
            </div>
          </section>

            </>
          )}
          {view === "attempts" && (
            <>
          {bank.mocks.length > 0 && (
            <section>
              <SectionTitle icon={Timer} title="Your attempts" />
              <ul className="mt-5 space-y-3">
                {bank.mocks.map((m) => (
                  <li key={m.mockId}>
                    <Link href={`/exams/mock/${m.mockId}`} className="flex items-center gap-4 rounded-2xl border border-line bg-canvas p-4 hover:border-brand/30">
                      <ScoreBadge mock={m} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.title}</span>
                        <span className="text-xs text-subtle">{timeAgo(m.submittedAt ?? m.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
              {bank.mocks.length === 0 && <p className="text-subtle">No attempts yet. Start one from Mock exam.</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight">
      <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
        <Icon className="size-4.5" />
      </span>
      {title}
    </h2>
  );
}

function DarkSlider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block text-sm">
      <span className="flex justify-between text-canvas/70">
        {label} <span className="font-semibold text-canvas">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-white"
        style={{ background: `linear-gradient(to right, white ${pct}%, rgb(255 255 255 / 0.2) ${pct}%)` }}
      />
    </label>
  );
}
