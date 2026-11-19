"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, type Insights } from "@/lib/api";
import { Card, ErrorNote, Icons, LinkButton, LoadingBlock, Pill } from "@/components/ui";

export default function ProgressView() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .insights()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your progress."));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <LoadingBlock label="Loading your progress…" />;

  const { streak, totals, flashcards, weakSpots } = data;

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_2fr]">
        {/* Streak */}
        <div className="relative overflow-hidden rounded-2xl bg-brand p-7 text-white">
          <div className="absolute -top-6 -right-6 size-40 rounded-full bg-white/10" aria-hidden="true" />
          <div className="relative flex items-center gap-2 text-white/85">
            {Icons.flame}
            <span className="text-sm font-semibold tracking-wide uppercase">Study streak</span>
          </div>
          <p className="relative mt-4 font-display text-7xl leading-none font-semibold">
            {streak.current}
            <span className="ml-2 font-sans text-xl font-medium text-white/85">day{streak.current === 1 ? "" : "s"}</span>
          </p>
          <p className="relative mt-4 text-white/90">
            {streak.activeToday
              ? "You've studied today. See you tomorrow!"
              : streak.current > 0
                ? "Study today to keep your streak alive."
                : "Start a streak today: one lesson or a few flashcards is enough."}
          </p>
          <p className="relative mt-2 text-sm text-white/75">Longest streak: {streak.longest} day{streak.longest === 1 ? "" : "s"}</p>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Minutes listened" value={totals.listenMinutes} />
          <Stat label="Lessons" value={totals.lessons} />
          <Stat label="Documents" value={totals.documents} />
          <Stat label="Cards reviewed" value={totals.cardsReviewed} />
          <Stat label="Practice answers" value={totals.defenseAnswers} />
          <Link href="/flashcards" className="group rounded-2xl border border-brand/40 bg-brand-soft/50 p-5 transition hover:bg-brand-soft">
            <p className="text-sm text-brand-deep">Cards due now</p>
            <p className="mt-1 font-display text-4xl font-semibold">{flashcards.due}</p>
            <p className="mt-1 text-xs font-medium text-brand-deep group-hover:underline">Review →</p>
          </Link>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold">Last 12 weeks</h2>
            <p className="text-sm text-subtle">Each square is a day. Darker means more studying.</p>
          </div>
          <Legend />
        </div>
        <Heatmap calendar={data.calendar} />
      </Card>

      <section>
        <h2 className="font-display text-2xl font-semibold">Weak spots to revisit</h2>
        <p className="mt-1 text-subtle">Cards you keep missing and practice questions where you scored under 65.</p>
        {weakSpots.flashcards.length === 0 && weakSpots.defense.length === 0 ? (
          <Card className="mt-4 text-center text-subtle">
            No weak spots yet. As you review cards and answer practice questions, the trickiest ones will show up here.
          </Card>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <h3 className="flex items-center gap-2 font-semibold">{Icons.cards} Tricky flashcards</h3>
              {weakSpots.flashcards.length === 0 ? (
                <p className="mt-3 text-sm text-subtle">None. Nice work!</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {weakSpots.flashcards.map((c) => (
                    <li key={c.id} className="py-3">
                      <Link href={`/flashcards?episodeId=${c.episodeId}`} className="group block">
                        <p className="font-medium group-hover:text-brand-deep">{c.front}</p>
                        <p className="mt-0.5 text-xs text-subtle">
                          {c.lessonTitle} · missed {c.lapses}×
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h3 className="flex items-center gap-2 font-semibold">{Icons.shield} Practice questions to retry</h3>
              {weakSpots.defense.length === 0 ? (
                <p className="mt-3 text-sm text-subtle">None. Every answered question scored 65 or more.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {weakSpots.defense.map((q) => (
                    <li key={`${q.setId}-${q.questionId}`} className="py-3">
                      <Link href={`/practice/${q.setId}?q=${q.questionId}`} className="group flex items-start justify-between gap-3">
                        <span>
                          <span className="line-clamp-2 font-medium group-hover:text-brand-deep">{q.question}</span>
                          <span className="mt-0.5 block text-xs text-subtle">
                            {q.title} · {q.attempts} attempt{q.attempts === 1 ? "" : "s"}
                          </span>
                        </span>
                        <Pill tone="brand">{q.bestScore}</Pill>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </section>

      {totals.lessons === 0 && (
        <div className="text-center">
          <LinkButton href="/upload">Create your first lesson</LinkButton>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-canvas p-5">
      <p className="text-sm text-subtle">{label}</p>
      <p className="mt-1 font-display text-4xl font-semibold">{value}</p>
    </div>
  );
}

function intensity(day: Insights["calendar"][number]): number {
  const score = day.listenMinutes / 5 + day.reviews / 5 + day.defense;
  if (!day.active && score === 0) return 0;
  if (score < 1) return 1;
  if (score < 3) return 2;
  if (score < 6) return 3;
  return 4;
}

const LEVELS = ["bg-muted", "bg-brand/25", "bg-brand/50", "bg-brand/75", "bg-brand"];

function Heatmap({ calendar }: { calendar: Insights["calendar"] }) {
  // Columns are weeks (Mon–Sun); pad the first week so days line up with weekdays.
  const firstWeekday = (new Date(calendar[0]!.date + "T00:00:00").getDay() + 6) % 7;
  const cells: (Insights["calendar"][number] | null)[] = [...Array(firstWeekday).fill(null), ...calendar];
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="mt-6 overflow-x-auto pb-1">
      <div className="flex gap-1.5">
        <div className="mr-1 grid grid-rows-7 gap-1.5 text-[10px] text-subtle" aria-hidden="true">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
            <span key={i} className="flex h-4 items-center">
              {d}
            </span>
          ))}
        </div>
        {weeks.map((week, w) => (
          <div key={w} className="grid grid-rows-7 gap-1.5">
            {week.map((day, d) =>
              day ? (
                <span
                  key={day.date}
                  title={`${new Date(day.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}: ${
                    day.listenMinutes
                  } min listened, ${day.reviews} cards, ${day.defense} practice answers`}
                  className={`size-4 rounded-[4px] ${LEVELS[intensity(day)]}`}
                />
              ) : (
                <span key={`pad-${d}`} className="size-4" />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-subtle" aria-hidden="true">
      Less
      {LEVELS.map((c) => (
        <span key={c} className={`size-3.5 rounded-[4px] ${c}`} />
      ))}
      More
    </div>
  );
}
