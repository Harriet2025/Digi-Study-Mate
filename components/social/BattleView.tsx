"use client";

import { Check, Copy, Crown, Play, Share2, Swords, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type BattleState } from "@/lib/api";
import { ErrorNote, LoadingBlock, Spinner } from "@/components/ui";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** A live quiz battle. Every player polls the same state; the phase comes from the server's clock. */
export default function BattleView({ code }: { code: string }) {
  const [state, setState] = useState<BattleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  const [copied, setCopied] = useState(false);
  const fetchedAt = useRef(Date.now());
  const [, tick] = useState(0);

  const poll = useCallback(async () => {
    try {
      const s = await api.battle(code);
      fetchedAt.current = Date.now();
      setState(s);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_A_PLAYER") {
        try {
          setState(await api.joinBattle(code));
        } catch (e) {
          setFatal(e instanceof ApiError ? e.message : "Couldn't join this battle.");
        }
      } else if (err instanceof ApiError && err.status === 404) setFatal(err.message);
      else setError("Connection hiccup… retrying.");
    }
  }, [code]);

  // Poll quickly while live, slowly in the lobby, not at all once finished.
  useEffect(() => {
    poll();
  }, [poll]);
  const phase = state?.phase;
  useEffect(() => {
    if (!phase || phase === "finished") return;
    const every = phase === "lobby" ? 2000 : 800;
    const t = window.setInterval(poll, every);
    return () => window.clearInterval(t);
  }, [phase, poll]);
  // Smooth countdowns between polls.
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 200);
    return () => window.clearInterval(t);
  }, []);

  if (fatal) {
    return (
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <ErrorNote>{fatal}</ErrorNote>
        <Link href="/rooms" className="font-medium text-brand hover:underline">
          Back to study rooms
        </Link>
      </div>
    );
  }
  if (!state) return <LoadingBlock label="Joining the battle…" />;

  const secondsLeft = Math.max(0, (state.secondsLeft ?? 0) - (Date.now() - fetchedAt.current) / 1000);

  const answer = async (choice: number) => {
    if (!state.question || state.question.myChoice !== null || answering) return;
    setAnswering(true);
    setState({ ...state, question: { ...state.question, myChoice: choice } });
    try {
      await api.answerBattle(code, state.question.index, choice);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That answer didn't go through.");
    }
    setAnswering(false);
    poll();
  };

  const link = typeof window !== "undefined" ? `${window.location.origin}/battle/${state.code}` : "";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-brand">
          <Swords className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{state.title}</span>
        </p>
        {state.phase !== "lobby" && state.phase !== "finished" && state.question && (
          <span className="shrink-0 text-sm text-subtle">
            Question {state.question.index + 1}/{state.questionCount}
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-subtle">{error}</p>}

      {state.phase === "lobby" && (
        <section className="mt-6 rounded-3xl bg-ink p-8 text-center text-canvas sm:p-10">
          <p className="text-xs font-semibold tracking-[0.2em] text-brand-soft uppercase">Battle code</p>
          <p className="mt-2 font-mono text-5xl font-bold tracking-[0.3em] sm:text-6xl">{state.code}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* ignore */
                }
              }}
              className="inline-flex items-center gap-2 rounded-full bg-canvas/10 px-4 py-2 text-sm ring-1 ring-canvas/20 hover:bg-canvas/15"
            >
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />} {copied ? "Copied" : "Copy link"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Quiz battle on "${state.title}"! Join: ${link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#1f8f4e] px-4 py-2 text-sm text-white hover:bg-[#187240]"
            >
              <Share2 className="size-4" aria-hidden="true" /> WhatsApp
            </a>
          </div>
          <div className="mt-8 text-left">
            <p className="flex items-center gap-2 text-sm text-canvas/70">
              <Users className="size-4" aria-hidden="true" /> {state.players.length} player{state.players.length === 1 ? "" : "s"} in the lobby
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {state.players.map((p) => (
                <li key={p.name} className={`rounded-full px-3 py-1.5 text-sm ${p.isMe ? "bg-canvas text-ink" : "bg-canvas/10"}`}>
                  {p.name}
                </li>
              ))}
            </ul>
          </div>
          {state.isHost ? (
            <button
              type="button"
              onClick={async () => setState(await api.startBattle(code))}
              disabled={state.players.length < 1}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-canvas px-8 py-3.5 font-medium text-ink hover:bg-brand-soft"
            >
              <Play className="size-4 fill-current" aria-hidden="true" /> Start the battle
            </button>
          ) : (
            <p className="mt-8 flex items-center justify-center gap-2 text-sm text-canvas/70">
              <Spinner className="size-4" /> Waiting for the host to start…
            </p>
          )}
        </section>
      )}

      {state.phase === "countdown" && (
        <section className="mt-6 grid min-h-80 place-items-center rounded-3xl bg-ink text-canvas">
          <div className="text-center">
            <p className="text-sm tracking-[0.2em] text-brand-soft uppercase">Get ready</p>
            <p className="mt-2 font-display text-8xl font-bold tabular-nums">{Math.ceil(secondsLeft)}</p>
          </div>
        </section>
      )}

      {(state.phase === "question" || state.phase === "reveal") && state.question && (
        <section className="mt-6">
          {/* Timer bar */}
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ease-linear ${state.phase === "reveal" ? "bg-subtle" : secondsLeft < 5 ? "bg-brand-deep" : "bg-brand"}`}
              style={{ width: `${state.phase === "reveal" ? 0 : (secondsLeft / state.secondsPerQuestion) * 100}%` }}
            />
          </div>
          <div className="mt-6 rounded-3xl border border-line bg-canvas p-6 sm:p-8">
            <h1 className="font-display text-2xl leading-snug font-bold text-balance sm:text-3xl">{state.question.text}</h1>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {state.question.options.map((o, i) => {
                const mine = state.question!.myChoice === i;
                const reveal = state.phase === "reveal";
                const right = reveal && state.question!.correctIndex === i;
                const wrong = reveal && mine && !right;
                const total = state.question!.counts?.reduce((a, b) => a + b, 0) || 0;
                const share = reveal && total ? (state.question!.counts![i]! / total) * 100 : 0;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => answer(i)}
                    disabled={reveal || state.question!.myChoice !== null}
                    className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border-2 px-4 py-4 text-left font-medium transition ${
                      right ? "border-success bg-success-soft" : wrong ? "border-brand-deep bg-brand-soft" : mine ? "border-brand bg-brand-soft" : "border-line hover:border-brand/50 disabled:hover:border-line"
                    }`}
                  >
                    {reveal && <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-ink/5" style={{ width: `${share}%` }} />}
                    <span className={`relative grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${mine ? "bg-brand text-white" : "bg-muted text-subtle"}`}>
                      {LETTERS[i]}
                    </span>
                    <span className="relative flex-1">{o}</span>
                    {right && <Check className="relative size-5 text-success" aria-label="Correct" />}
                    {wrong && <X className="relative size-5 text-brand-deep" aria-label="Wrong" />}
                    {reveal && <span className="relative text-xs text-subtle">{state.question!.counts?.[i] ?? 0}</span>}
                  </button>
                );
              })}
            </div>
            {state.phase === "question" && state.question.myChoice !== null && (
              <p className="mt-5 flex items-center gap-2 text-sm text-subtle">
                <Spinner className="size-4" /> Locked in. Waiting for the others…
              </p>
            )}
            {state.phase === "reveal" && (
              <div className="mt-5 rounded-2xl bg-page p-4">
                <p className="font-semibold">{(state.question.myPoints ?? 0) > 0 ? `+${state.question.myPoints} points` : state.question.myChoice === null ? "Too slow this time" : "Not this one"}</p>
                {state.question.explanation && <p className="mt-1 text-sm text-subtle">{state.question.explanation}</p>}
              </div>
            )}
          </div>
          <Scoreboard players={state.players} compact />
        </section>
      )}

      {state.phase === "finished" && (
        <section className="mt-6 space-y-6">
          <div className="rounded-3xl bg-ink p-8 text-center text-canvas">
            <Crown className="mx-auto size-10 text-brand-soft" aria-hidden="true" />
            <p className="mt-3 text-sm tracking-[0.2em] text-brand-soft uppercase">Winner</p>
            <p className="mt-1 font-display text-4xl font-bold">{state.players[0]?.name}</p>
            <p className="mt-1 text-canvas/70">{state.players[0]?.score} points</p>
          </div>
          <Scoreboard players={state.players} />
          {state.review && (
            <div className="rounded-3xl border border-line bg-canvas p-6">
              <h2 className="font-display text-xl font-bold">Answers</h2>
              <ol className="mt-4 space-y-3 text-sm">
                {state.review.map((r, i) => (
                  <li key={i}>
                    <p className="font-medium">
                      {i + 1}. {r.question}
                    </p>
                    <p className="text-success">{r.answer}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="text-center">
            <Link href={state.roomId ? `/rooms/${state.roomId}` : "/rooms"} className="font-medium text-brand hover:underline">
              Back to {state.roomId ? "the room" : "study rooms"}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Scoreboard({ players, compact = false }: { players: BattleState["players"]; compact?: boolean }) {
  const shown = compact ? players.slice(0, 5) : players;
  return (
    <ol className={`${compact ? "mt-5" : ""} divide-y divide-line rounded-2xl border border-line bg-canvas`}>
      {shown.map((p, i) => (
        <li key={p.name} className={`flex items-center gap-3 px-4 py-3 ${p.isMe ? "bg-brand-soft/50" : ""}`}>
          <span className="w-6 text-center font-display font-bold text-subtle">{i + 1}</span>
          <span className="flex-1 font-medium">
            {p.name}
            {p.isMe && <span className="text-subtle"> (you)</span>}
          </span>
          {compact && p.answered && <Check className="size-4 text-success" aria-label="Answered" />}
          <span className="font-display text-lg font-bold tabular-nums">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}
