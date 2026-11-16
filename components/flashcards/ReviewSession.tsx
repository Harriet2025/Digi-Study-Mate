"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatInterval, timeAgo, type DeckStats, type Flashcard, type Rating } from "@/lib/api";
import { Button, EmptyState, ErrorNote, Icons, LinkButton, LoadingBlock, PageHeader, Pill, ProgressBar } from "@/components/ui";

const RATING_BUTTONS: { rating: Rating; label: string; key: string; style: string }[] = [
  { rating: "again", label: "Again", key: "1", style: "border-terracotta/40 hover:bg-terracotta-soft" },
  { rating: "hard", label: "Hard", key: "2", style: "border-sand hover:bg-cream-deep" },
  { rating: "good", label: "Good", key: "3", style: "border-sage/50 hover:bg-sage-soft" },
  { rating: "easy", label: "Easy", key: "4", style: "border-sage hover:bg-sage-soft" },
];

export default function ReviewSession({
  episodeId,
  guideId,
  embedded = false,
}: {
  episodeId?: string;
  guideId?: string;
  /** Inside a study space tab: no page heading. */
  embedded?: boolean;
}) {
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [stats, setStats] = useState<DeckStats | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState<Record<Rating, number>>({ again: 0, hard: 0, good: 0, easy: 0 });
  const [cramMode, setCramMode] = useState(false);

  const load = useCallback(
    async (due = true) => {
      setError(null);
      try {
        const data = await api.flashcards({ episodeId, guideId, due, limit: 50 });
        setCards(data.cards);
        setStats(data.stats);
        setIndex(0);
        setFlipped(false);
        setTally({ again: 0, hard: 0, good: 0, easy: 0 });
        setCramMode(!due);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't load your flashcards.");
      }
    },
    [episodeId, guideId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const card = cards?.[index];
  const lessonTitle = cards?.[0]?.lessonTitle;

  const rate = useCallback(
    async (rating: Rating) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        await api.reviewCard(card.id, rating);
        setTally((t) => ({ ...t, [rating]: t[rating] + 1 }));
        // "Again" cards come back at the end of this session too.
        if (rating === "again") setCards((cs) => (cs ? [...cs, card] : cs));
        setIndex((i) => i + 1);
        setFlipped(false);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't save that review.");
      } finally {
        setBusy(false);
      }
    },
    [card, busy],
  );

  // Keyboard: Space/Enter flips, 1–4 rate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (!card) return;
      if (!flipped && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped) {
        const button = RATING_BUTTONS.find((b) => b.key === e.key);
        if (button) rate(button.rating);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, flipped, rate]);

  const scoped = Boolean(episodeId || guideId);
  const header = embedded ? null : (
    <div className="mb-8">
      {episodeId && (
        <Link href={`/listen/${episodeId}`} className="mb-4 inline-block text-sm font-medium text-stone hover:text-charcoal">
          ← Back to the lesson
        </Link>
      )}
      <PageHeader
        eyebrow={cramMode ? "Practice round" : "Spaced repetition"}
        title={scoped && lessonTitle ? lessonTitle : "Flashcards"}
        description={
          scoped
            ? "Cards from this lesson. Rate each one honestly and Study Mate will decide when you see it again."
            : "Cards from all your lessons that are due today. The ones you find hard come back sooner."
        }
      />
    </div>
  );

  if (error && !cards) {
    return (
      <>
        {header}
        <ErrorNote onRetry={() => load()}>{error}</ErrorNote>
      </>
    );
  }
  if (!cards || !stats) return <LoadingBlock label="Loading flashcards…" />;

  // Nothing due
  if (cards.length === 0) {
    return (
      <>
        {header}
        {stats.total === 0 ? (
          <EmptyState icon={Icons.cards} title="No flashcards yet" action={<LinkButton href="/upload">Create a lesson</LinkButton>}>
            Every lesson comes with a deck made from its quiz checkpoints and key ideas.
          </EmptyState>
        ) : (
          <EmptyState
            icon={Icons.cards}
            title="All caught up!"
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button onClick={() => load(false)}>Practise anyway</Button>
                <LinkButton href="/library" variant="secondary">
                  Back to library
                </LinkButton>
              </div>
            }
          >
            You&apos;ve reviewed everything that&apos;s due.
            {stats.nextDueAt && ` The next card is due ${timeUntil(stats.nextDueAt)}.`} {stats.learned} of {stats.total} cards are
            well learned.
          </EmptyState>
        )}
      </>
    );
  }

  // Session finished
  if (!card) {
    const reviewed = Object.values(tally).reduce((a, b) => a + b, 0);
    return (
      <>
        {header}
        <div className="rounded-[2rem] bg-charcoal px-6 py-12 text-center text-cream">
          <p className="text-xs font-semibold tracking-[0.18em] text-terracotta-soft uppercase">Session complete</p>
          <p className="mt-2 font-serif text-4xl font-semibold">{reviewed} cards reviewed</p>
          <div className="mx-auto mt-8 grid max-w-md grid-cols-4 gap-2">
            {RATING_BUTTONS.map((b) => (
              <div key={b.rating} className="rounded-2xl bg-cream/10 px-2 py-3">
                <p className="font-serif text-2xl font-semibold">{tally[b.rating]}</p>
                <p className="text-xs text-cream/70">{b.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button onClick={() => load()} variant="primary">
              Check for more
            </Button>
            <LinkButton href="/progress" variant="secondary">
              See your progress
            </LinkButton>
          </div>
        </div>
      </>
    );
  }

  const remaining = cards.length - index;
  return (
    <>
      {header}
      <div className="mb-4 flex items-center justify-between gap-4 text-sm text-stone">
        <span>
          Card {index + 1} of {cards.length}
        </span>
        <span>{remaining - 1} left after this</span>
      </div>
      <ProgressBar value={(index / cards.length) * 100} />

      {/* The card */}
      <div className="mt-8 [perspective:1600px]">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? "Show question" : "Show answer"}
          className="relative block min-h-72 w-full text-left transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none focus-visible:outline-none"
          style={{ transform: flipped ? "rotateY(180deg)" : undefined }}
        >
          <CardFace label="Question" card={card}>
            {card.front}
          </CardFace>
          <CardFace label="Answer" card={card} back>
            {card.back}
          </CardFace>
        </button>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {/* Actions */}
      <div className="mt-6">
        {!flipped ? (
          <Button onClick={() => setFlipped(true)} variant="dark" className="w-full py-3.5 text-base">
            Show answer <kbd className="ml-2 rounded bg-cream/15 px-1.5 text-xs">Space</kbd>
          </Button>
        ) : (
          <div>
            <p className="mb-3 text-center text-sm text-stone">How well did you know it?</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATING_BUTTONS.map((b) => (
                <button
                  key={b.rating}
                  type="button"
                  disabled={busy}
                  onClick={() => rate(b.rating)}
                  className={`rounded-2xl border bg-cream px-3 py-3 text-center transition focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none disabled:opacity-50 ${b.style}`}
                >
                  <span className="block font-semibold">{b.label}</span>
                  <span className="block text-xs text-stone">
                    {formatInterval(card.nextIntervals[b.rating])} · <kbd>{b.key}</kbd>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function CardFace({ label, card, back = false, children }: { label: string; card: Flashcard; back?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`absolute inset-0 flex flex-col rounded-[2rem] border p-7 shadow-[0_20px_60px_-30px_rgba(41,37,36,0.5)] [backface-visibility:hidden] sm:p-10 ${
        back ? "border-charcoal bg-charcoal text-cream [transform:rotateY(180deg)]" : "border-sand bg-cream"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-semibold tracking-[0.16em] uppercase ${back ? "text-terracotta-soft" : "text-terracotta-deep"}`}>
          {label}
        </span>
        {card.source === "checkpoint" && !back && <Pill tone="terracotta">From a checkpoint</Pill>}
        {card.lapses > 0 && back && <Pill tone="warning">Missed {card.lapses}×</Pill>}
      </div>
      <p className="my-auto py-6 font-serif text-2xl leading-snug text-balance sm:text-3xl">{children}</p>
      {!back && card.lessonTitle && <p className="truncate text-xs text-stone">{card.lessonTitle}</p>}
      {!back && <p className="mt-1 text-xs text-stone">Tap the card to flip it</p>}
    </div>
  );
}

function timeUntil(iso: string): string {
  const minutes = (new Date(iso).getTime() - Date.now()) / 60000;
  if (minutes < 60) return `in ${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 60 * 24) return `in ${Math.round(minutes / 60)} h`;
  const days = Math.round(minutes / 1440);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}
