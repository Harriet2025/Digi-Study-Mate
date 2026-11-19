"use client";

import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  FileText,
  Flame,
  Headphones,
  Layers,
  type LucideIcon,
  MessageCircleQuestion,
  Mic,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppHero from "@/components/app/AppHero";
import { Float } from "@/components/home/Motion";
import { CountUp, GrowGroup, RevealGroup } from "@/components/motion/Gsap";
import { api, ApiError, type Insights } from "@/lib/api";
import { ErrorNote, LinkButton, LoadingBlock } from "@/components/ui";

type Day = Insights["calendar"][number];

/** One number per day for "how much did I study": a card review counts 1, a quiz 3, a practice answer 2… */
function activityScore(d: Day): number {
  return d.reviews + d.quizzes * 3 + d.questionsAsked + d.defense * 2 + (d.exams ?? 0) * 5 + (d.battles ?? 0) * 3 + Math.round(d.listenMinutes / 5);
}

export default function ProgressView() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .insights()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your progress."));
  }, []);

  const hero = (aside?: React.ReactNode) => (
    <AppHero
      icon={TrendingUp}
      eyebrow="Progress"
      title="Your study rhythm"
      description="A little every day beats a lot the night before."
      aside={aside}
    />
  );

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <LoadingBlock label="Loading your progress…" />;

  const { streak, totals, flashcards, weakSpots, calendar } = data;

  return (
    <div className="space-y-12">
      {hero(<StreakCard streak={streak} calendar={calendar} />)}

      <RevealGroup className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile icon={BookOpenText} label="Study spaces" value={totals.studySpaces} />
        <StatTile icon={Trophy} label="Quizzes taken" value={totals.quizzesTaken} />
        <StatTile icon={MessageCircleQuestion} label="Questions asked" value={totals.questionsAsked} />
        <StatTile icon={Layers} label="Cards reviewed" value={totals.cardsReviewed} />
        <StatTile icon={Mic} label="Practice answers" value={totals.defenseAnswers} />
        <StatTile icon={Headphones} label="Minutes listened" value={totals.listenMinutes} />
        <StatTile icon={FileText} label="Documents" value={totals.documents} />
        <Link
          data-reveal
          href="/flashcards"
          className="group rounded-2xl bg-brand p-5 text-white shadow-lg shadow-brand/20 transition hover:bg-brand-deep"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-white/15" aria-hidden="true">
            <Target className="size-4" />
          </span>
          <CountUp value={flashcards.due} className="mt-3 block font-display text-3xl font-bold" />
          <span className="flex items-center gap-1 text-sm text-white/80">
            Cards due now <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>
      </RevealGroup>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Panel icon={TrendingUp} title="Last 14 days" subtitle="Reviews, quizzes, questions and practice.">
          <ActivityBars calendar={calendar.slice(-14)} />
        </Panel>
        <Panel icon={CalendarDays} title="Last 12 weeks" subtitle="Each square is a day. Darker means more studying." right={<Legend />}>
          <Heatmap calendar={calendar} />
        </Panel>
      </div>

      <section>
        <h2 className="font-display text-2xl font-bold tracking-tight">Weak spots to revisit</h2>
        <p className="mt-1 text-subtle">Cards you keep missing and practice questions where you scored under 65.</p>
        <RevealGroup className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div data-reveal>
            <Panel icon={Layers} title="Tricky flashcards">
              {weakSpots.flashcards.length === 0 ? (
                <AllClear text="None. Nice work!" />
              ) : (
                <ul className="divide-y divide-line">
                  {weakSpots.flashcards.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={c.guideId ? `/study/${c.guideId}?tab=flashcards` : `/flashcards?episodeId=${c.episodeId}`}
                        className="group flex items-start justify-between gap-3 py-3"
                      >
                        <span>
                          <span className="font-medium group-hover:text-brand">{c.front}</span>
                          <span className="mt-0.5 block text-xs text-subtle">
                            {c.lessonTitle} · missed {c.lapses}×
                          </span>
                        </span>
                        <ArrowRight className="mt-1 size-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <div data-reveal>
            <Panel icon={Mic} title="Practice questions to retry">
              {weakSpots.defense.length === 0 ? (
                <AllClear text="None. Every answered question scored 65 or more." />
              ) : (
                <ul className="divide-y divide-line">
                  {weakSpots.defense.map((q) => (
                    <li key={`${q.setId}-${q.questionId}`}>
                      <Link href={`/practice/${q.setId}?q=${q.questionId}`} className="group flex items-start justify-between gap-3 py-3">
                        <span>
                          <span className="line-clamp-2 font-medium group-hover:text-brand">{q.question}</span>
                          <span className="mt-0.5 block text-xs text-subtle">
                            {q.title} · {q.attempts} attempt{q.attempts === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-deep">
                          {q.bestScore}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </RevealGroup>
      </section>

      {totals.studySpaces === 0 && (
        <div className="text-center">
          <LinkButton href="/upload">Create your first lesson</LinkButton>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StreakCard({ streak, calendar }: { streak: Insights["streak"]; calendar: Day[] }) {
  // This week, Monday to Sunday.
  const today = calendar.at(-1)!;
  const todayIndex = (new Date(today.date + "T00:00:00").getDay() + 6) % 7;
  const week = calendar.slice(-(todayIndex + 1));
  const labels = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink p-6 text-white sm:p-7">
      <div aria-hidden="true" className="absolute -top-16 -right-12 size-48 rounded-full bg-brand/50 blur-2xl" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-brand-soft uppercase">Study streak</p>
          <p className="mt-3 font-display text-6xl leading-none font-bold">
            <CountUp value={streak.current} />
            <span className="ml-2 font-sans text-lg font-medium text-white/70">day{streak.current === 1 ? "" : "s"}</span>
          </p>
        </div>
        <Float distance={6} duration={3.5}>
          <span className="grid size-14 place-items-center rounded-2xl bg-white/10 text-brand-soft ring-1 ring-white/15" aria-hidden="true">
            <Flame className="size-7" />
          </span>
        </Float>
      </div>
      <p className="relative mt-4 text-sm text-white/80">
        {streak.activeToday
          ? "You've studied today. See you tomorrow!"
          : streak.current > 0
            ? "Study today to keep your streak alive."
            : "Start a streak today: one lesson or a few flashcards is enough."}
      </p>
      <div className="relative mt-6 grid grid-cols-7 gap-2" aria-label="This week">
        {labels.map((l, i) => {
          const day = week[i];
          const done = !!day?.active;
          const isToday = i === todayIndex;
          return (
            <div key={i} className="text-center">
              <span
                className={`mx-auto grid size-8 place-items-center rounded-full text-xs font-semibold ${
                  done ? "bg-brand-soft text-brand-deep" : isToday ? "ring-2 ring-brand-soft/60 text-white" : "bg-white/10 text-white/50"
                }`}
              >
                {done ? <CheckCircle2 className="size-4" aria-label="studied" /> : l}
              </span>
            </div>
          );
        })}
      </div>
      <p className="relative mt-4 text-xs text-white/60">Longest streak: {streak.longest} day{streak.longest === 1 ? "" : "s"}</p>
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div data-reveal className="rounded-2xl border border-line bg-canvas p-5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/5">
      <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <CountUp value={value} className="mt-3 block font-display text-3xl font-bold" />
      <span className="text-sm text-subtle">{label}</span>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  subtitle,
  right,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="h-full rounded-2xl border border-line bg-canvas p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
            <Icon className="size-4" />
          </span>
          <div>
            <h3 className="font-display text-lg font-bold">{title}</h3>
            {subtitle && <p className="text-sm text-subtle">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function AllClear({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-3 rounded-2xl bg-success-soft/60 px-4 py-4 text-sm text-success">
      <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}

function ActivityBars({ calendar }: { calendar: Day[] }) {
  const scores = calendar.map(activityScore);
  const max = Math.max(4, ...scores);
  const total = scores.reduce((a, b) => a + b, 0);
  return (
    <div>
      <GrowGroup className="flex h-40 items-end gap-1.5 sm:gap-2">
        {calendar.map((d, i) => {
          const date = new Date(d.date + "T00:00:00");
          const h = scores[i]! === 0 ? 4 : Math.max(10, (scores[i]! / max) * 100);
          return (
            <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <span
                data-grow
                title={`${date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}: ${d.reviews} cards, ${d.quizzes} quizzes, ${d.questionsAsked} questions, ${d.defense} practice answers`}
                className={`w-full rounded-md ${scores[i] ? "bg-brand" : "bg-muted"} ${i === calendar.length - 1 ? "ring-2 ring-brand-soft ring-offset-1" : ""}`}
                style={{ height: `${h}%` }}
              />
              <span className="text-[10px] text-subtle">{date.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
            </div>
          );
        })}
      </GrowGroup>
      <p className="mt-4 text-sm text-subtle">
        {total === 0 ? "No activity in the last two weeks yet." : `${calendar.filter((d) => activityScore(d) > 0).length} active days in the last two weeks.`}
      </p>
    </div>
  );
}

const LEVELS = ["bg-muted", "bg-brand/25", "bg-brand/50", "bg-brand/75", "bg-brand"];

function level(d: Day): number {
  const s = activityScore(d);
  if (!d.active && s === 0) return 0;
  if (s < 3) return 1;
  if (s < 8) return 2;
  if (s < 15) return 3;
  return 4;
}

function Heatmap({ calendar }: { calendar: Day[] }) {
  // Columns are weeks (Mon–Sun); pad the first week so days line up with weekdays.
  const firstWeekday = (new Date(calendar[0]!.date + "T00:00:00").getDay() + 6) % 7;
  const cells: (Day | null)[] = [...Array(firstWeekday).fill(null), ...calendar];
  const weeks: (Day | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const monthOf = (w: (Day | null)[]) => w.find(Boolean)?.date.slice(0, 7);

  return (
    <div className="flex gap-1.5">
      <div className="grid grid-rows-[auto_repeat(7,1fr)] gap-1 pr-1 text-[10px] text-subtle" aria-hidden="true">
        <span className="h-4" />
        {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
          <span key={i} className="flex items-center">
            {d}
          </span>
        ))}
      </div>
      <RevealGroup className="grid flex-1 gap-1" >
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
          {weeks.map((week, w) => {
            const month = monthOf(week);
            const showMonth = month && month !== monthOf(weeks[w - 1] ?? []);
            return (
              <div key={w} data-reveal className="grid grid-rows-[auto_repeat(7,1fr)] gap-1">
                <span className="h-4 text-[10px] whitespace-nowrap text-subtle">
                  {showMonth ? new Date(month + "-01T00:00:00").toLocaleDateString(undefined, { month: "short" }) : ""}
                </span>
                {Array.from({ length: 7 }, (_, d) => {
                  const day = week[d];
                  return day ? (
                    <span
                      key={day.date}
                      title={`${new Date(day.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}: ${day.reviews} cards, ${day.quizzes} quizzes, ${day.questionsAsked} questions`}
                      className={`aspect-square w-full rounded-[4px] ${LEVELS[level(day)]}`}
                    />
                  ) : (
                    <span key={`pad-${d}`} className="aspect-square w-full" />
                  );
                })}
              </div>
            );
          })}
        </div>
      </RevealGroup>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-subtle" aria-hidden="true">
      Less
      {LEVELS.map((c) => (
        <span key={c} className={`size-3 rounded-[3px] ${c}`} />
      ))}
      More
    </div>
  );
}
