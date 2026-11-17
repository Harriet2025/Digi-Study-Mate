"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRecorder } from "@/hooks/useRecorder";
import {
  api,
  ApiError,
  CATEGORY_LABELS,
  type Evaluation,
  type Grade,
  type PointStatus,
  type PracticeQuestion,
  type PracticeSet,
} from "@/lib/api";
import { Button, Card, ErrorNote, Icons, LoadingBlock, Pill, Spinner } from "@/components/ui";
import { ScoreBadge } from "./PracticeHome";

const GRADE_LABEL: Record<Grade, string> = { excellent: "Excellent", good: "Good", partial: "Partial", insufficient: "Needs work" };

export default function PracticeSession({ setId, initialQuestionId }: { setId: string; initialQuestionId?: string }) {
  const [set, setSet] = useState<PracticeSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialQuestionId ?? null);

  const load = useCallback(async () => {
    try {
      const data = await api.practiceSet(setId);
      setSet(data);
      setActiveId((id) => id ?? data.questions.find((q) => q.attemptCount === 0)?.id ?? data.questions[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this practice set.");
    }
  }, [setId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!set) return <LoadingBlock label="Loading the panel's questions…" />;

  const active = set.questions.find((q) => q.id === activeId) ?? set.questions[0]!;
  const answered = set.questions.filter((q) => q.attemptCount > 0).length;

  return (
    <div>
      <Link href="/practice" className="text-sm font-medium text-subtle hover:text-ink">
        ← All practice sets
      </Link>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-deep uppercase">Defense practice</p>
          <h1 className="mt-1 font-display text-4xl font-semibold text-balance">{set.title ?? "Practice set"}</h1>
        </div>
        <p className="text-sm text-subtle">
          {answered} of {set.questions.length} questions answered
        </p>
      </div>

      {set.overallWeaknesses.length > 0 && (
        <details className="group mt-6 rounded-2xl border border-line bg-muted/60 p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
            What the panel thinks needs strengthening
            <span className="text-brand transition group-open:rotate-45" aria-hidden="true">+</span>
          </summary>
          <ul className="mt-3 space-y-2 text-subtle">
            {set.overallWeaknesses.map((w) => (
              <li key={w} className="flex gap-2">
                <span className="text-brand" aria-hidden="true">•</span>
                {w}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Question list */}
        <nav aria-label="Questions">
          <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {set.questions.map((q, i) => (
              <li key={q.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setActiveId(q.id)}
                  aria-current={q.id === active.id ? "true" : undefined}
                  className={`flex w-56 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition lg:w-full ${
                    q.id === active.id ? "border-brand bg-brand-soft/50" : "border-line bg-canvas hover:border-brand/40"
                  }`}
                >
                  <span className="font-display text-lg font-semibold text-brand">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{CATEGORY_LABELS[q.category]}</span>
                    <span className="block truncate text-xs text-subtle">{q.sourceReference}</span>
                  </span>
                  {q.bestScore !== null ? <Pill tone={q.bestScore >= 65 ? "success" : "brand"}>{q.bestScore}</Pill> : null}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <QuestionPanel key={active.id} setId={set.setId} question={active} index={set.questions.indexOf(active)} onAnswered={load} />
      </div>
    </div>
  );
}

function QuestionPanel({
  setId,
  question,
  index,
  onAnswered,
}: {
  setId: string;
  question: PracticeQuestion;
  index: number;
  onAnswered: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Evaluation | null>(question.latest);
  const [mode, setMode] = useState<"answer" | "result">(question.latest ? "result" : "answer");
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRecorder();

  const submitTyped = async () => {
    if (answer.trim().split(/\s+/).length < 3) {
      setError("Write at least a sentence or two so there's something to grade.");
      return;
    }
    await grade(() => api.answerTyped({ setId, questionId: question.id, answer: answer.trim() }));
  };

  const toggleRecording = async () => {
    if (recorder.state === "recording") {
      const blob = await recorder.stop();
      if (blob) await grade(() => api.answerSpoken(setId, question.id, blob));
    } else {
      await recorder.start();
    }
  };

  const grade = async (call: () => Promise<Evaluation>) => {
    setGrading(true);
    setError(null);
    try {
      const evaluation = await call();
      setResult(evaluation);
      setMode("result");
      setAnswer("");
      onAnswered();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Your answer couldn't be graded. Please try again.");
    } finally {
      setGrading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="bg-ink p-7 text-canvas sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="warning">Question {index + 1}</Pill>
          <Pill tone="glass">{CATEGORY_LABELS[question.category]}</Pill>
          <span className="text-xs text-canvas/60">{question.sourceReference}</span>
        </div>
        <p className="mt-4 font-display text-2xl leading-snug text-balance sm:text-[1.7rem]">“{question.question}”</p>
        {question.history.length > 0 && (
          <p className="mt-4 text-sm text-canvas/60">
            {question.history.length} attempt{question.history.length === 1 ? "" : "s"} · best {question.bestScore}/100
          </p>
        )}
      </Card>

      {mode === "result" && result ? (
        <ResultView result={result} weakness={question.targetsWeakness} onRetry={() => setMode("answer")} />
      ) : (
        <Card className="space-y-4">
          <label htmlFor="answer" className="block font-semibold">
            Your answer
          </label>
          <textarea
            id="answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={7}
            maxLength={10000}
            disabled={grading || recorder.state !== "idle"}
            placeholder="Answer as you would to the panel: state your position, justify it, and mention the specifics."
            className="w-full resize-y rounded-2xl border border-line bg-white px-4 py-3 leading-relaxed focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none disabled:opacity-60"
          />
          {(error || recorder.error) && <ErrorNote>{error ?? recorder.error}</ErrorNote>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={toggleRecording}
              disabled={grading || recorder.state === "starting"}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
                recorder.state === "recording" ? "bg-brand-deep text-white" : "border border-line bg-canvas hover:border-brand/50"
              }`}
            >
              {recorder.state === "recording" ? (
                <>
                  <span className="size-2.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" aria-hidden="true" />
                  Stop &amp; submit ({formatSeconds(recorder.elapsed)})
                </>
              ) : (
                <>
                  {Icons.mic} {recorder.state === "starting" ? "Opening microphone…" : "Answer out loud"}
                </>
              )}
            </button>
            <Button onClick={submitTyped} disabled={grading || recorder.state !== "idle" || !answer.trim()} className="px-6 py-3">
              {grading ? <Spinner className="size-4" /> : null}
              {grading ? "The examiner is grading…" : "Submit answer"}
            </Button>
          </div>
          {result && (
            <button type="button" onClick={() => setMode("result")} className="text-sm font-medium text-brand-deep hover:underline">
              See your last result
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<PointStatus, { label: string; className: string; icon: string }> = {
  covered: { label: "Covered", className: "bg-success-soft text-success", icon: "✓" },
  partial: { label: "Partly", className: "bg-brand-soft text-brand-deep", icon: "~" },
  missing: { label: "Missing", className: "bg-muted text-subtle", icon: "✕" },
};

function ResultView({ result, weakness, onRetry }: { result: Evaluation; weakness: string; onRetry: () => void }) {
  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <ScoreRing score={result.score} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={result.score >= 65 ? "success" : "brand"}>{GRADE_LABEL[result.grade]}</Pill>
            <Pill>{result.inputMode === "spoken" ? "Spoken answer" : "Typed answer"}</Pill>
          </div>
          <p className="mt-3 leading-relaxed">{result.feedback}</p>
        </div>
      </Card>

      <Card>
        <h3 className="font-display text-xl font-semibold">Key points the panel listens for</h3>
        <ul className="mt-4 space-y-3">
          {result.keyPointResults.map((k) => {
            const s = STATUS_STYLE[k.status];
            return (
              <li key={k.keyPointId} className="flex gap-3">
                <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${s.className}`} aria-label={s.label}>
                  {s.icon}
                </span>
                <div>
                  <p className="font-medium">
                    {k.point} {k.importance === "core" && <Pill tone="dark">Core</Pill>}
                  </p>
                  <p className="text-sm text-subtle">{k.comment}</p>
                  {k.evidence && <p className="mt-1 border-l-2 border-line pl-3 text-sm text-subtle italic">“{k.evidence}”</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {result.missingTechnicalDetails.length > 0 && (
          <ListCard title="Technical details to add" items={result.missingTechnicalDetails} tone="brand" />
        )}
        {result.strengths.length > 0 && <ListCard title="What you did well" items={result.strengths} tone="success" />}
        {result.misconceptions.length > 0 && <ListCard title="Things to correct" items={result.misconceptions} tone="brand" />}
        <ListCard title="A stronger answer would…" items={result.improvedAnswerOutline} tone="neutral" ordered />
      </div>

      <Card className="bg-muted/60">
        <p className="text-xs font-semibold tracking-[0.16em] text-brand-deep uppercase">The panel&apos;s likely follow-up</p>
        <p className="mt-2 font-display text-xl">“{result.followUpQuestion}”</p>
        <p className="mt-3 text-sm text-subtle">
          <span className="font-semibold text-ink">Why they asked:</span> {weakness}
        </p>
      </Card>

      <details className="group rounded-2xl border border-line bg-canvas p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
          See the ideal answer
          <span className="text-brand transition group-open:rotate-45" aria-hidden="true">+</span>
        </summary>
        <p className="mt-3 leading-relaxed text-subtle">{result.rubric.idealAnswerSummary}</p>
        {result.rubric.redFlags.length > 0 && (
          <>
            <p className="mt-4 text-sm font-semibold">Answers that lose marks</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-subtle">
              {result.rubric.redFlags.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </details>

      <div className="flex justify-end">
        <Button onClick={onRetry}>Try this question again</Button>
      </div>
    </div>
  );
}

function ListCard({ title, items, tone, ordered = false }: { title: string; items: string[]; tone: "success" | "brand" | "neutral"; ordered?: boolean }) {
  const dot = { success: "text-success", brand: "text-brand", neutral: "text-subtle" }[tone];
  const List = ordered ? "ol" : "ul";
  return (
    <Card>
      <h3 className="font-semibold">{title}</h3>
      <List className="mt-3 space-y-2 text-sm leading-relaxed">
        {items.map((item, i) => (
          <li key={item} className="flex gap-2">
            <span className={`font-semibold ${dot}`} aria-hidden="true">
              {ordered ? `${i + 1}.` : "•"}
            </span>
            {item}
          </li>
        ))}
      </List>
    </Card>
  );
}

function ScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 42;
  const color = score >= 65 ? "var(--color-success)" : "var(--color-brand)";
  return (
    <div className=" ">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-line)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <p className="text-center">
        <span className="block font-display text-3xl leading-none font-semibold">{score}</span>
        <span className="text-xs text-subtle">/ 100</span>
      </p>
    </div>
  );
}

function formatSeconds(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
