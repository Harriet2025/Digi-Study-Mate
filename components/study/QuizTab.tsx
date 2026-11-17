"use client";

import { useState } from "react";
import { api, ApiError, timeAgo, type GuideDetail, type QuizResult } from "@/lib/api";
import { Button, EmptyState, ErrorNote, Icons, Pill, Spinner } from "@/components/ui";

const LETTERS = ["A", "B", "C", "D"];

const RATING_MESSAGE: Record<string, string> = {
  Excellent: "Outstanding. You've really got this. Lock it in with your flashcards over the next few days.",
  Strong: "Great work. Review the questions you missed and you'll have it nailed.",
  "Getting there": "A solid start. Re-read the steps behind the questions you missed, then try again.",
  "Needs review": "This one needs another pass. Go back through the lesson, ask the tutor about anything unclear, then retake the quiz.",
};

export default function QuizTab({ guide, onSubmitted, onReview }: { guide: GuideDetail; onSubmitted: () => void; onReview: () => void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => guide.quiz.map(() => null));
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (guide.quiz.length === 0) {
    return (
      <EmptyState icon={Icons.shield} title="No quiz yet">
        The quiz for this lesson wasn&apos;t made. Use “Make them again” above to create it.
      </EmptyState>
    );
  }

  const answered = answers.filter((a) => a !== null).length;

  const submit = async () => {
    if (answers.some((a) => a === null)) {
      setError(`Answer all ${guide.quiz.length} questions first (${guide.quiz.length - answered} left).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setResult(await api.submitQuiz(guide.guideId, answers as number[]));
      onSubmitted();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't grade your quiz. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => {
    setAnswers(guide.quiz.map(() => null));
    setResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (result) return <QuizResults result={result} onRetake={retake} onReview={onReview} />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-brand-deep uppercase">Final quiz</p>
          <h2 className="mt-1 font-display text-3xl font-semibold">How well do you know it?</h2>
          <p className="mt-1 text-subtle">{guide.quiz.length} questions. You&apos;ll get a score, a rating and an explanation for each answer.</p>
        </div>
        {guide.quizAttempts.length > 0 && (
          <p className="text-sm text-subtle">
            Last attempt: <span className="font-semibold text-ink">{guide.quizAttempts.at(-1)!.score}%</span> ·{" "}
            {timeAgo(guide.quizAttempts.at(-1)!.createdAt)}
          </p>
        )}
      </div>

      <ol className="mt-8 space-y-6">
        {guide.quiz.map((q, qi) => (
          <li key={q.position} className="rounded-2xl border border-line bg-canvas p-6">
            <fieldset>
              <legend className="flex gap-3">
                <span className="font-display text-xl font-semibold text-brand">{qi + 1}.</span>
                <span className="font-display text-xl leading-snug">{q.question}</span>
              </legend>
              <div className="mt-4 grid gap-2">
                {q.options.map((option, oi) => {
                  const selected = answers[qi] === oi;
                  return (
                    <label
                      key={oi}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                        selected ? "border-brand bg-brand-soft/50" : "border-line hover:border-brand/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q${qi}`}
                        className="sr-only"
                        checked={selected}
                        onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                      />
                      <span
                        className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                          selected ? "bg-brand text-white" : "bg-muted text-subtle"
                        }`}
                      >
                        {LETTERS[oi]}
                      </span>
                      <span className="pt-0.5">{option}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      {error && (
        <div className="mt-6">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-4 rounded-2xl border border-line bg-white/95 p-3 pl-6 shadow-lg backdrop-blur">
        <span className="text-sm text-subtle">
          {answered} of {guide.quiz.length} answered
        </span>
        <Button onClick={submit} disabled={submitting} className="px-6 py-3">
          {submitting && <Spinner className="size-4" />}
          {submitting ? "Grading…" : "Submit and see my rating"}
        </Button>
      </div>
    </div>
  );
}

function QuizResults({ result, onRetake, onReview }: { result: QuizResult; onRetake: () => void; onReview: () => void }) {
  const good = result.score >= 75;
  return (
    <div className="mx-auto max-w-3xl">
      <div className={`rounded-2xl p-8 text-center sm:p-10 ${good ? "bg-success text-white" : "bg-ink text-canvas"}`}>
        <p className="text-xs font-semibold tracking-[0.18em] uppercase opacity-80">Your rating</p>
        <p className="mt-2 font-display text-5xl font-semibold">{result.rating}</p>
        <p className="mt-4 font-display text-7xl leading-none font-semibold">
          {result.score}
          <span className="text-3xl opacity-70">%</span>
        </p>
        <p className="mt-2 opacity-85">
          {result.correct} of {result.total} correct
          {result.previousBest !== null && ` · previous best ${result.previousBest}%`}
        </p>
        <p className="mx-auto mt-5 max-w-lg leading-relaxed opacity-90">{RATING_MESSAGE[result.rating]}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onRetake} className="rounded-full bg-canvas px-5 py-2.5 text-sm font-medium text-ink hover:bg-white">
            Retake the quiz
          </button>
          <button type="button" onClick={onReview} className="rounded-full border border-current px-5 py-2.5 text-sm font-medium hover:bg-white/10">
            Review the lesson
          </button>
        </div>
      </div>

      <h3 className="mt-10 font-display text-2xl font-semibold">Question by question</h3>
      <ol className="mt-4 space-y-4">
        {result.results.map((r, i) => (
          <li key={r.position} className={`rounded-2xl border p-5 ${r.correct ? "border-success/40 bg-success-soft/40" : "border-brand/30 bg-brand-soft/30"}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-display text-lg leading-snug">
                <span className="font-semibold">{i + 1}.</span> {r.question}
              </p>
              <Pill tone={r.correct ? "success" : "warning"}>{r.correct ? "Correct" : "Incorrect"}</Pill>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {r.options.map((o, oi) => (
                <li
                  key={oi}
                  className={`rounded-xl px-3 py-1.5 ${
                    oi === r.correctIndex ? "bg-success text-white" : oi === r.chosenIndex ? "bg-brand-soft text-brand-deep line-through" : "text-subtle"
                  }`}
                >
                  <span className="font-semibold">{LETTERS[oi]}.</span> {o}
                  {oi === r.chosenIndex && oi !== r.correctIndex && " (your answer)"}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm leading-relaxed">
              <span className="font-semibold">Why: </span>
              {r.explanation}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
