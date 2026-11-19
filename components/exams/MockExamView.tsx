"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock, Eye, Flag, RotateCcw, Timer, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScoreRing } from "@/components/library/LibraryView";
import { CountUp, GrowGroup } from "@/components/motion/Gsap";
import { api, ApiError, type MockAnswer, type MockDetail, type MockQuestion } from "@/lib/api";
import { Button, ErrorNote, LoadingBlock, ProgressBar, Spinner } from "@/components/ui";

const storageKey = (id: string) => `study-mate-mock-${id}`;

function loadSaved(id: string): Record<string, MockAnswer> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(id)) ?? "{}");
  } catch {
    return {};
  }
}

export default function MockExamView({ mockId }: { mockId: string }) {
  const [mock, setMock] = useState<MockDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMock(await api.mock(mockId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this exam.");
    }
  }, [mockId]);
  useEffect(() => {
    load();
  }, [load]);

  const generating = mock?.status === "queued" || mock?.status === "processing";
  useEffect(() => {
    if (!generating) return;
    const t = window.setInterval(load, 2500);
    return () => window.clearInterval(t);
  }, [generating, load]);

  if (error && !mock) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!mock) return <LoadingBlock label="Loading your exam…" />;

  const back = mock.bankId ? `/exams/bank/${mock.bankId}` : mock.guideId ? `/study/${mock.guideId}` : "/exams";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={back} className="text-sm font-medium text-subtle hover:text-ink">
        ← Back
      </Link>
      {generating && (
        <div className="mt-6 rounded-3xl border border-line bg-canvas p-10 text-center">
          <Spinner className="mx-auto size-7 text-brand" />
          <p className="mt-4 font-display text-xl font-bold">Writing your {mock.mode === "exam" ? "mock exam" : "practice test"}…</p>
          <p className="mt-1 text-subtle">Weighted towards the topics that come up most. About 30 seconds.</p>
        </div>
      )}
      {mock.status === "failed" && (
        <div className="mt-6">
          <ErrorNote>{mock.error ?? "This exam couldn't be written. Go back and try again."}</ErrorNote>
        </div>
      )}
      {mock.status === "ready" && <StartScreen mock={mock} onStarted={setMock} />}
      {mock.status === "in_progress" && <ExamRunner mock={mock} onSubmitted={setMock} />}
      {mock.status === "submitted" && <Results mock={mock} />}
    </div>
  );
}

function StartScreen({ mock, onStarted }: { mock: MockDetail; onStarted: (m: MockDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exam = mock.mode === "exam";
  const start = async () => {
    setBusy(true);
    try {
      onStarted(await api.startMock(mock.mockId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start.");
      setBusy(false);
    }
  };
  return (
    <section className="mt-6 overflow-hidden rounded-3xl bg-ink p-8 text-canvas sm:p-10">
      <p className="text-xs font-semibold tracking-[0.18em] text-brand-soft uppercase">{exam ? "Timed mock exam" : "Practice test"}</p>
      <h1 className="mt-3 font-display text-3xl font-bold text-balance">{mock.title}</h1>
      <ul className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <li className="rounded-2xl bg-canvas/10 p-4">
          <Flag className="size-5 text-brand-soft" aria-hidden="true" />
          <p className="mt-2 font-semibold">{mock.questionCount} questions</p>
          <p className="text-canvas/70">Multiple choice and short answers</p>
        </li>
        <li className="rounded-2xl bg-canvas/10 p-4">
          <Clock className="size-5 text-brand-soft" aria-hidden="true" />
          <p className="mt-2 font-semibold">{mock.durationMinutes} minutes</p>
          <p className="text-canvas/70">{exam ? "Submits itself when time's up" : "Take your time"}</p>
        </li>
        <li className="rounded-2xl bg-canvas/10 p-4">
          {exam ? <XCircle className="size-5 text-brand-soft" aria-hidden="true" /> : <Eye className="size-5 text-brand-soft" aria-hidden="true" />}
          <p className="mt-2 font-semibold">{exam ? "No hints" : "Check as you go"}</p>
          <p className="text-canvas/70">{exam ? "Marked at the end, by topic" : "Explanations after each answer"}</p>
        </li>
      </ul>
      {error && <p className="mt-4 text-sm text-brand-soft">{error}</p>}
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-canvas px-7 py-3.5 font-medium text-ink transition hover:bg-brand-soft disabled:opacity-60"
      >
        {busy ? <Spinner className="size-4" /> : <Timer className="size-4" aria-hidden="true" />} Start {exam ? "the clock" : "practising"}
      </button>
    </section>
  );
}

function formatClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ExamRunner({ mock, onSubmitted }: { mock: MockDetail; onSubmitted: (m: MockDetail) => void }) {
  const exam = mock.mode === "exam";
  const [answers, setAnswers] = useState<Record<string, MockAnswer>>(() => loadSaved(mock.mockId));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, MockQuestion>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deadline = useRef(Date.now() + (mock.remainingSeconds ?? mock.durationMinutes * 60) * 1000);
  const [left, setLeft] = useState(mock.remainingSeconds ?? mock.durationMinutes * 60);
  const submitted = useRef(false);

  // Keep answers on this device in case the page is refreshed mid-exam.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(mock.mockId), JSON.stringify(answers));
    } catch {
      /* storage unavailable */
    }
  }, [answers, mock.mockId]);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError(null);
    try {
      const done = await api.submitMock(mock.mockId, answers);
      try {
        localStorage.removeItem(storageKey(mock.mockId));
      } catch {
        /* ignore */
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      onSubmitted(done);
    } catch (err) {
      submitted.current = false;
      setError(err instanceof ApiError ? err.message : "Couldn't submit. Check your connection and try again.");
      setBusy(false);
    }
  }, [answers, mock.mockId, onSubmitted]);

  useEffect(() => {
    if (!exam) return;
    const t = window.setInterval(() => {
      const s = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) void submit();
    }, 1000);
    return () => window.clearInterval(t);
  }, [exam, submit]);

  const q = mock.questions[index]!;
  const answered = useMemo(() => mock.questions.filter((x) => answers[x.id] !== undefined && answers[x.id] !== null && answers[x.id] !== "").length, [answers, mock.questions]);
  const set = (value: MockAnswer) => setAnswers((a) => ({ ...a, [q.id]: value }));
  const reveal = async () => {
    try {
      const full = await api.checkAnswer(mock.mockId, q.id);
      setRevealed((r) => ({ ...r, [q.id]: full }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't check that answer.");
    }
  };
  const shown = revealed[q.id];
  const lowTime = exam && left <= 60;

  const confirmSubmit = () => {
    const missing = mock.questions.length - answered;
    if (missing > 0 && !window.confirm(`${missing} question${missing === 1 ? " is" : "s are"} unanswered. Submit anyway?`)) return;
    void submit();
  };

  return (
    <div className="mt-4">
      {/* Sticky bar: timer, progress, submit */}
      <div className="sticky top-16 z-20 -mx-4 border-b border-line bg-page/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex items-center justify-between gap-3">
          {exam ? (
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-display text-lg font-bold tabular-nums ${lowTime ? "bg-brand text-white" : "bg-canvas"}`} aria-live={lowTime ? "polite" : "off"}>
              <Clock className="size-4" aria-hidden="true" /> {formatClock(left)}
            </span>
          ) : (
            <span className="text-sm font-medium text-subtle">Practice test</span>
          )}
          <span className="hidden text-sm text-subtle sm:inline">
            {answered}/{mock.questions.length} answered
          </span>
          <Button onClick={confirmSubmit} disabled={busy} className="px-4 py-2">
            {busy ? <Spinner className="size-4" /> : <CheckCircle2 className="size-4" aria-hidden="true" />} {busy ? "Marking…" : "Submit"}
          </Button>
        </div>
        <ProgressBar value={(answered / mock.questions.length) * 100} className="mt-3 h-1" />
      </div>

      {/* Question navigator */}
      <nav aria-label="Questions" className="mt-6 flex flex-wrap gap-2">
        {mock.questions.map((x, i) => {
          const done = answers[x.id] !== undefined && answers[x.id] !== null && answers[x.id] !== "";
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? "step" : undefined}
              aria-label={`Question ${i + 1}${done ? ", answered" : ""}`}
              className={`grid size-9 place-items-center rounded-lg text-sm font-semibold transition ${
                i === index ? "bg-ink text-canvas" : done ? "bg-brand-soft text-brand-deep" : "border border-line bg-canvas text-subtle hover:border-brand/40"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <article className="mt-6 rounded-3xl border border-line bg-canvas p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-subtle">
          <span className="font-semibold tracking-[0.14em] text-brand uppercase">
            Question {index + 1} of {mock.questions.length}
          </span>
          <span>
            {q.topic} · {q.marks} mark{q.marks === 1 ? "" : "s"}
          </span>
        </div>
        <h2 className="mt-3 font-display text-xl leading-snug font-semibold sm:text-2xl">{q.question}</h2>

        {q.type === "mcq" ? (
          <div className="mt-6 space-y-2.5" role="radiogroup">
            {q.options.map((o, i) => {
              const chosen = answers[q.id] === i;
              const right = shown && shown.correctIndex === i;
              const wrong = shown && chosen && shown.correctIndex !== i;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  onClick={() => !shown && set(i)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
                    right ? "border-success bg-success-soft" : wrong ? "border-brand bg-brand-soft" : chosen ? "border-brand bg-brand-soft/60" : "border-line hover:border-brand/40"
                  }`}
                >
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${chosen ? "bg-brand text-white" : "bg-muted text-subtle"}`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  {o}
                </button>
              );
            })}
          </div>
        ) : (
          <textarea
            value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
            onChange={(e) => set(e.target.value)}
            readOnly={!!shown}
            rows={7}
            maxLength={4000}
            placeholder="Write your answer as you would in the exam…"
            className="mt-6 w-full resize-y rounded-2xl border border-line bg-white px-4 py-3 focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none"
          />
        )}

        {shown && (
          <div className="mt-5 rounded-2xl bg-page p-4 text-sm">
            <p className="font-semibold">Why</p>
            <p className="mt-1 text-subtle">{shown.explanation}</p>
            {shown.modelAnswer && (
              <>
                <p className="mt-3 font-semibold">A full-marks answer</p>
                <p className="mt-1 text-subtle">{shown.modelAnswer}</p>
              </>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Previous
          </Button>
          {!exam && !shown && (
            <Button variant="secondary" onClick={reveal}>
              <Eye className="size-4" aria-hidden="true" /> Check answer
            </Button>
          )}
          {index < mock.questions.length - 1 ? (
            <Button variant="dark" onClick={() => setIndex((i) => i + 1)}>
              Next <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button onClick={confirmSubmit} disabled={busy}>
              <CheckCircle2 className="size-4" aria-hidden="true" /> Submit
            </Button>
          )}
        </div>
      </article>
    </div>
  );
}

function grade(percent: number) {
  if (percent >= 70) return { label: "First-class work", tone: "text-success" };
  if (percent >= 60) return { label: "Strong", tone: "text-success" };
  if (percent >= 50) return { label: "A pass, with room to grow", tone: "text-brand" };
  return { label: "Needs more revision", tone: "text-brand-deep" };
}

function Results({ mock }: { mock: MockDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const r = mock.result!;
  const g = grade(r.percent);
  const weakest = r.topics.find((t) => t.lost > 0);

  const practiseWeakest = async () => {
    if (!weakest) return;
    setBusy(true);
    try {
      const next = await api.createMock({
        bankId: mock.bankId ?? undefined,
        guideId: mock.bankId ? undefined : (mock.guideId ?? undefined),
        mode: "practice",
        topic: weakest.topic,
        questionCount: 6,
        durationMinutes: 15,
      });
      router.push(`/exams/mock/${next.mockId}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-8">
      <section className="rounded-3xl bg-ink p-6 text-canvas sm:p-10">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
          <ScoreRing value={r.percent} size={128} stroke={10} light />
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-brand-soft uppercase">{mock.mode === "exam" ? "Mock exam result" : "Practice test result"}</p>
            <p className="mt-2 font-display text-4xl font-bold">
              <CountUp value={r.score} /> <span className="text-2xl text-canvas/60">/ {r.total} marks</span>
            </p>
            <p className={`mt-1 font-medium ${g.tone === "text-success" ? "text-success-soft" : "text-brand-soft"}`}>{g.label}</p>
            {r.late && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-canvas/70">
                <AlertTriangle className="size-4" aria-hidden="true" /> Submitted after the time limit
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-canvas p-6 sm:p-8">
        <h2 className="font-display text-xl font-bold">Where the marks went</h2>
        <p className="text-sm text-subtle">Topics that cost you the most marks come first.</p>
        <GrowGroup axis="x" className="mt-6 space-y-4">
          {r.topics.map((t) => (
            <div key={t.topic}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{t.topic}</span>
                <span className="text-subtle">
                  {t.awarded}/{t.available} · {t.lost > 0 ? <span className="font-semibold text-brand-deep">−{t.lost}</span> : "full marks"}
                </span>
              </div>
              <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-muted">
                <span data-grow className={`h-full ${t.percent >= 70 ? "bg-success" : "bg-brand"}`} style={{ width: `${t.percent}%` }} />
              </div>
            </div>
          ))}
        </GrowGroup>
        {weakest && (
          <Button onClick={practiseWeakest} disabled={busy} className="mt-6">
            {busy ? <Spinner className="size-4" /> : <RotateCcw className="size-4" aria-hidden="true" />} Practise {weakest.topic}
          </Button>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">Question by question</h2>
        {mock.questions.map((q, i) => {
          const res = r.questions.find((x) => x.id === q.id)!;
          const given = mock.answers?.[q.id];
          const full = res.awarded === res.marks;
          return (
            <article key={q.id} className="rounded-2xl border border-line bg-canvas p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">
                  {i + 1}. {q.question}
                </p>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold ${full ? "bg-success-soft text-success" : res.awarded > 0 ? "bg-brand-soft text-brand-deep" : "bg-muted text-subtle"}`}>
                  {res.awarded}/{res.marks}
                </span>
              </div>
              {q.type === "mcq" ? (
                <p className="mt-2 text-sm">
                  <span className="text-subtle">Your answer: </span>
                  {typeof given === "number" ? q.options[given] : "—"}
                  {!full && (
                    <>
                      <br />
                      <span className="text-subtle">Correct: </span>
                      <span className="font-medium text-success">{q.options[q.correctIndex ?? 0]}</span>
                    </>
                  )}
                </p>
              ) : (
                <p className="mt-2 rounded-xl bg-page px-3 py-2 text-sm whitespace-pre-wrap">{typeof given === "string" && given ? given : "No answer"}</p>
              )}
              <p className="mt-2 text-sm text-subtle">{res.feedback}</p>
              {!full && (q.modelAnswer || q.explanation) && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer font-medium text-brand">What a full-marks answer says</summary>
                  <p className="mt-1 text-subtle">{q.modelAnswer || q.explanation}</p>
                  {q.markingPoints && q.markingPoints.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-subtle">
                      {q.markingPoints.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                </details>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
