"use client";

import { BookOpenText, FileText, Headphones, Swords, Layers, MessageCircleQuestion, PlayCircle, Sparkles, Trophy } from "lucide-react";
import { useCurrentUser } from "@/components/auth/useCurrentUser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, LANGUAGE_OPTIONS, LEVEL_OPTIONS, type GuideDetail } from "@/lib/api";
import { Card, ErrorNote, LinkButton, LoadingBlock, Pill, ProgressBar, Spinner } from "@/components/ui";
import ReviewSession from "@/components/flashcards/ReviewSession";
import AskTab from "./AskTab";
import LearnTab from "./LearnTab";
import ListenTab from "./ListenTab";
import QuizTab from "./QuizTab";
import ResourcesTab from "./ResourcesTab";
import SummaryTab from "./SummaryTab";

const TABS = [
  { key: "learn", label: "Learn", icon: BookOpenText },
  { key: "ask", label: "Ask", icon: MessageCircleQuestion },
  { key: "flashcards", label: "Flashcards", icon: Layers },
  { key: "quiz", label: "Quiz", icon: Trophy },
  { key: "summary", label: "Summary", icon: FileText },
  { key: "resources", label: "Resources", icon: PlayCircle },
  { key: "listen", label: "Listen", icon: Headphones },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function StudySpace({ guideId, initialTab }: { guideId: string; initialTab?: string }) {
  const user = useCurrentUser();
  const [guide, setGuide] = useState<GuideDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(TABS.some((t) => t.key === initialTab) ? (initialTab as TabKey) : "learn");

  const load = useCallback(async () => {
    try {
      setGuide(await api.guide(guideId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this study space.");
    }
  }, [guideId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while it's being made.
  const building = guide && (guide.status === "queued" || guide.status === "processing");
  useEffect(() => {
    if (!building) return;
    const timer = window.setTimeout(load, 2500);
    return () => window.clearTimeout(timer);
  }, [building, guide, load]);

  const switchTab = (key: TabKey) => {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (error && !guide) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!guide) return <LoadingBlock label="Opening your study space…" />;
  if (guide.status === "failed") return <Failed guide={guide} />;
  if (building) return <Building guide={guide} />;

  const level = LEVEL_OPTIONS.find((l) => l.value === guide.level)?.label;
  const language = LANGUAGE_OPTIONS.find((l) => l.value === guide.language)?.label;

  return (
    <div>
      <Link href="/library" className="text-sm font-medium text-subtle hover:text-ink">
        ← Library
      </Link>
      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-deep uppercase">Study space</p>
          <h1 className="mt-1 font-display text-4xl leading-tight font-semibold text-balance sm:text-5xl">{guide.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {guide.pageStart && (
              <Pill>
                Pages {guide.pageStart}–{guide.pageEnd}
              </Pill>
            )}
            {level && <Pill>{level}</Pill>}
            {language && guide.language !== "en" && <Pill>{language}</Pill>}
            {guide.bestQuizScore !== null && <Pill tone={guide.bestQuizScore >= 75 ? "success" : "brand"}>Best quiz: {guide.bestQuizScore}%</Pill>}
          </div>
        </div>
        {user && !user.isGuest && guide.quiz.length >= 3 && <BattleButton guideId={guide.guideId} />}
      </div>

      {user?.isGuest && <TrialBanner guideId={guide.guideId} />}

      {/* Tabs */}
      <div className="sticky top-16 z-30 -mx-4 mt-8 border-b border-line bg-canvas/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <nav aria-label="Study space" className="flex gap-1 overflow-x-auto py-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                tab === t.key ? "bg-ink text-canvas" : "text-subtle hover:bg-muted hover:text-ink"
              }`}
            >
              <t.icon className="size-4" aria-hidden="true" />
              {t.label}
              {t.key === "flashcards" && guide.flashcardCount > 0 && <span className="text-xs opacity-70">{guide.flashcardCount}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-8">
        {guide.error && tab !== "learn" && tab !== "ask" && tab !== "listen" && (
          <div className="mb-6">
            <RemakePractice guide={guide} onDone={setGuide} />
          </div>
        )}
        {tab === "learn" && <LearnTab guide={guide} onFinish={() => switchTab("quiz")} onAsk={() => switchTab("ask")} />}
        {tab === "ask" && <AskTab guide={guide} />}
        {tab === "flashcards" && <ReviewSession guideId={guide.guideId} embedded />}
        {tab === "quiz" && <QuizTab guide={guide} onSubmitted={load} onReview={() => switchTab("learn")} />}
        {tab === "summary" && <SummaryTab guide={guide} />}
        {tab === "resources" && <ResourcesTab guide={guide} />}
        {tab === "listen" && <ListenTab guide={guide} onChanged={load} />}
      </div>
    </div>
  );
}

const STAGES = [
  { key: "reading", label: "Reading your pages" },
  { key: "writing", label: "Writing your lesson and diagrams" },
  { key: "practice", label: "Making flashcards and your quiz" },
  { key: "resources", label: "Finding videos and reading" },
];

function Building({ guide }: { guide: GuideDetail }) {
  const current = Math.max(0, STAGES.findIndex((s) => s.key === guide.stage));
  return (
    <Card className="mx-auto max-w-xl p-8 sm:p-10">
      <div className="flex items-center gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand text-white">
          <Spinner className="size-7" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] text-brand-deep uppercase">Building your study space</p>
          <h1 className="truncate font-display text-2xl font-semibold">{guide.title}</h1>
        </div>
      </div>
      <ProgressBar value={guide.progress} className="mt-8" />
      <p className="mt-2 text-right text-sm text-subtle tabular-nums" aria-live="polite">
        {guide.progress}%
      </p>
      <ol className="mt-4 space-y-3">
        {STAGES.map((stage, i) => {
          const state = guide.status === "queued" ? "todo" : i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={stage.key} className="flex items-center gap-3">
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  state === "done" ? "bg-success text-white" : state === "current" ? "bg-brand-soft text-brand-deep" : "bg-muted text-subtle"
                }`}
              >
                {state === "done" ? "✓" : state === "current" ? <Spinner className="size-3.5" /> : i + 1}
              </span>
              <span className={state === "todo" ? "text-subtle" : "font-medium"}>{stage.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-8 rounded-2xl bg-muted px-4 py-3 text-sm text-subtle">
        This usually takes one to two minutes (a little longer on the free AI plan). You can leave this page; your study space will be
        waiting in your <Link href="/library" className="font-medium text-brand-deep hover:underline">library</Link>.
      </p>
    </Card>
  );
}

function Failed({ guide }: { guide: GuideDetail }) {
  return (
    <Card className="mx-auto max-w-xl py-10 text-center">
      <p className="font-display text-2xl font-semibold">This study space couldn&apos;t be made</p>
      <p className="mt-2 text-subtle">{guide.error ?? "Something went wrong. Please try again."}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <LinkButton href={`/upload?documentId=${guide.documentId}`}>Try again</LinkButton>
        <LinkButton href="/library" variant="secondary">
          Back to library
        </LinkButton>
      </div>
    </Card>
  );
}

function RemakePractice({ guide, onDone }: { guide: GuideDetail; onDone: (g: GuideDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remake = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.remakePractice(guide.guideId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't make them. Please try again in a minute.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand-soft/50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-brand-deep">{error ?? guide.error}</p>
      <button type="button" onClick={remake} disabled={busy} className="shrink-0 font-semibold text-brand-deep hover:underline disabled:opacity-50">
        {busy ? "Making them…" : "Make them again"}
      </button>
    </div>
  );
}


/** Shown to guests: their trial lesson is temporary until they create an account. */
function TrialBanner({ guideId }: { guideId: string }) {
  const next = encodeURIComponent(`/study/${guideId}`);
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-brand/20 bg-brand-soft/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-3 text-sm">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        <span>
          <span className="font-semibold">You&apos;re on a free trial.</span> Create a free account to keep this lesson and unlock
          audio, projects and defence practice.
        </span>
      </p>
      <Link
        href={`/signup?reason=trial&next=${next}`}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-deep"
      >
        Save my lesson
      </Link>
    </div>
  );
}


/** Start a live quiz battle on this lesson and go to its lobby to invite coursemates. */
function BattleButton({ guideId }: { guideId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const b = await api.createBattle({ guideId });
          router.push(`/battle/${b.code}`);
        } catch {
          setBusy(false);
        }
      }}
      className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition hover:bg-ink/85 disabled:opacity-60 lg:self-auto"
    >
      <Swords className="size-4" aria-hidden="true" /> Challenge coursemates
    </button>
  );
}
