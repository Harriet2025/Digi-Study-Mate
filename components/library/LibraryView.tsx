"use client";

import {
  ArrowRight,
  BookOpenText,
  FileText,
  Headphones,
  Layers,
  Library,
  type LucideIcon,
  Mic,
  Plus,
  Search,
  Trash2,
  Trophy,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppHero from "@/components/app/AppHero";
import { useCurrentUser } from "@/components/auth/useCurrentUser";
import { Float } from "@/components/home/Motion";
import { CountUp, RevealGroup } from "@/components/motion/Gsap";
import {
  api,
  ApiError,
  formatDuration,
  LANGUAGE_OPTIONS,
  styleLabel,
  timeAgo,
  unitOf,
  type EpisodeSummary,
  type GuideSummary,
  type LibraryData,
  type QuestionSetSummary,
} from "@/lib/api";
import { ErrorNote, Icons, LinkButton, LoadingBlock, Pill, ProgressBar, Spinner } from "@/components/ui";

type Doc = LibraryData["documents"][number];

export default function LibraryView() {
  const user = useCurrentUser();
  const [data, setData] = useState<LibraryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api.library());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your library.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While any lesson is still being made, refresh every few seconds.
  const building = data?.documents.some(
    (d) =>
      d.episodes.some((e) => e.status === "queued" || e.status === "processing") ||
      d.guides.some((g) => g.status === "queued" || g.status === "processing"),
  );
  useEffect(() => {
    if (!building) return;
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, [building, load]);

  const latest = useMemo(() => {
    const ready = (data?.documents ?? []).flatMap((d) => d.guides.filter((g) => g.status === "ready"));
    return ready.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0] ?? null;
  }, [data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data || !q) return data?.documents ?? [];
    return data.documents.filter((d) => d.filename.toLowerCase().includes(q) || d.guides.some((g) => g.title.toLowerCase().includes(q)));
  }, [data, query]);

  const firstName = user?.name.split(/\s+/)[0];
  const hero = (stats?: Stats) => (
    <AppHero
      icon={Library}
      eyebrow="My library"
      title={firstName ? `Welcome back, ${firstName}` : "Your library"}
      description="Everything you're studying, in one place."
      actions={
        <LinkButton href="/upload">
          <Upload className="size-4" aria-hidden="true" /> Upload notes
        </LinkButton>
      }
      aside={stats ? <StatGrid stats={stats} /> : undefined}
    />
  );

  if (error && !data) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!data) return <LoadingBlock label="Loading your library…" />;

  if (data.documents.length === 0) {
    return (
      <div className="space-y-8">
        {hero()}
        <EmptyLibrary />
      </div>
    );
  }

  const stats: Stats = {
    documents: data.documents.length,
    spaces: data.documents.reduce((n, d) => n + d.guides.filter((g) => g.status === "ready").length, 0),
    due: data.flashcards.due,
    audio: data.documents.reduce((n, d) => n + d.episodes.filter((e) => e.status === "ready").length, 0),
  };

  return (
    <div className="space-y-12">
      {hero(stats)}
      {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}

      {latest && <ContinueCard guide={latest} />}

      {data.continueListening.length > 0 && (
        <section>
          <SectionTitle icon={Headphones} title="Continue listening" />
          <RevealGroup className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.continueListening.map((e) => (
              <Link
                data-reveal
                key={e.scriptId}
                href={`/listen/${e.scriptId}`}
                className="group rounded-2xl border border-line bg-canvas p-5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg hover:shadow-ink/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display text-lg leading-snug font-semibold">{e.title}</p>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-canvas transition group-hover:bg-brand">
                    {Icons.play}
                  </span>
                </div>
                <ProgressBar value={(e.listening.positionSec / Math.max(1, e.totalDurationSec)) * 100} className="mt-4" />
                <p className="mt-2 text-xs text-subtle">
                  {formatDuration(e.totalDurationSec - e.listening.positionSec)} left · {timeAgo(e.listening.updatedAt)}
                </p>
              </Link>
            ))}
          </RevealGroup>
        </section>
      )}

      <section>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionTitle icon={FileText} title="Your documents" count={data.documents.length} />
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Search your library</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes and lessons"
              className="w-full rounded-full border border-line bg-canvas py-2.5 pr-4 pl-10 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
            />
          </label>
        </div>
        {visible.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-subtle">Nothing matches “{query}”.</p>
        ) : (
          <RevealGroup className="mt-6 space-y-6">
            {visible.map((doc) => (
              <div data-reveal key={doc.documentId}>
                <DocumentCard doc={doc} onChanged={load} />
              </div>
            ))}
          </RevealGroup>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Stats = { documents: number; spaces: number; due: number; audio: number };

function StatGrid({ stats }: { stats: Stats }) {
  const tiles: { icon: LucideIcon; label: string; value: number; href?: string }[] = [
    { icon: FileText, label: "Documents", value: stats.documents },
    { icon: BookOpenText, label: "Study spaces", value: stats.spaces },
    { icon: Layers, label: "Cards due", value: stats.due, href: "/flashcards" },
    { icon: Headphones, label: "Audio lessons", value: stats.audio },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((t) => {
        const body = (
          <>
            <span className={`grid size-9 place-items-center rounded-lg ${t.href ? "bg-white/15 text-white" : "bg-brand-soft text-brand"}`} aria-hidden="true">
              <t.icon className="size-4" />
            </span>
            <CountUp value={t.value} className="mt-3 block font-display text-3xl font-bold" />
            <span className={`flex items-center gap-1 text-sm ${t.href ? "text-white/80" : "text-subtle"}`}>
              {t.label}
              {t.href && <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />}
            </span>
          </>
        );
        return t.href ? (
          <Link key={t.label} href={t.href} className="group rounded-2xl bg-brand p-4 text-white shadow-lg shadow-brand/20 transition hover:bg-brand-deep">
            {body}
          </Link>
        ) : (
          <div key={t.label} className="rounded-2xl border border-line bg-canvas/80 p-4 backdrop-blur">
            {body}
          </div>
        );
      })}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, count }: { icon: LucideIcon; title: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight">
      <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
        <Icon className="size-4.5" />
      </span>
      {title}
      {count !== undefined && <span className="rounded-full bg-muted px-2.5 py-0.5 font-sans text-sm font-medium text-subtle">{count}</span>}
    </h2>
  );
}

/** A circular score meter (e.g. best quiz result). */
export function ScoreRing({ value, size = 64, stroke = 6, light = false }: { value: number | null; size?: number; stroke?: number; light?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value ?? 0;
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className={light ? "text-white/15" : "text-muted"} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          className={`transition-[stroke-dashoffset] duration-1000 ${light ? "text-white" : pct >= 75 ? "text-success" : "text-brand"}`}
        />
      </svg>
      <span className={`absolute text-xs font-bold ${light ? "text-white" : "text-ink"}`}>{value === null ? "–" : `${value}%`}</span>
    </span>
  );
}

function ContinueCard({ guide }: { guide: GuideSummary }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-ink p-6 text-canvas sm:p-10">
      <div aria-hidden="true" className="absolute -top-20 -right-10 size-72 rounded-full bg-brand/40 blur-3xl" />
      <div className="relative grid grid-cols-1 items-center gap-8 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-soft uppercase">Pick up where you left off</p>
          <h2 className="mt-3 font-display text-2xl leading-tight font-bold text-balance sm:text-4xl">{guide.title}</h2>
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-canvas/70">
            <MetaChip icon={BookOpenText}>{guide.sectionCount} steps</MetaChip>
            <MetaChip icon={Layers}>{guide.flashcardCount} cards</MetaChip>
            {guide.pageStart && <MetaChip icon={FileText}>pp. {guide.pageStart}–{guide.pageEnd}</MetaChip>}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={`/study/${guide.guideId}`}
              className="inline-flex items-center gap-2 rounded-full bg-canvas px-6 py-3 font-medium text-ink transition hover:bg-brand-soft"
            >
              Continue studying <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href={`/study/${guide.guideId}?tab=quiz`}
              className="inline-flex items-center gap-2 rounded-full border border-canvas/20 px-6 py-3 font-medium transition hover:bg-canvas/10"
            >
              <Trophy className="size-4" aria-hidden="true" /> {guide.bestQuizScore === null ? "Take the quiz" : "Retake the quiz"}
            </Link>
          </div>
        </div>
        <Float distance={8} duration={6} className="hidden md:block">
          <div className="rounded-2xl bg-canvas/5 p-6 text-center ring-1 ring-canvas/10 backdrop-blur">
            <ScoreRing value={guide.bestQuizScore} size={112} stroke={9} light />
            <p className="mt-3 text-sm text-canvas/70">Best quiz score</p>
          </div>
        </Float>
      </div>
    </section>
  );
}

function MetaChip({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas/10 px-3 py-1">
      <Icon className="size-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}

function EmptyLibrary() {
  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: Upload, title: "Upload", body: "A PDF or PowerPoint from your course." },
    { icon: BookOpenText, title: "Learn", body: "A step-by-step lesson with diagrams." },
    { icon: Trophy, title: "Practise", body: "Flashcards, a rated quiz and a tutor." },
  ];
  return (
    <section className="rounded-3xl border border-dashed border-line bg-canvas p-8 text-center sm:p-12">
      <h2 className="font-display text-2xl font-bold">Your library is empty</h2>
      <p className="mt-2 text-subtle">Three steps to your first lesson.</p>
      <ol className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-2xl bg-page p-5">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-brand text-white">
              <s.icon className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-3 font-semibold">
              {i + 1}. {s.title}
            </p>
            <p className="text-sm text-subtle">{s.body}</p>
          </li>
        ))}
      </ol>
      <LinkButton href="/upload" className="mt-8">
        <Upload className="size-4" aria-hidden="true" /> Upload your first notes
      </LinkButton>
    </section>
  );
}

// ---------------------------------------------------------------------------

function DocumentCover({ type, pages }: { type: string; pages: number }) {
  return (
    <span
      className="relative grid h-[4.5rem] w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-brand to-brand-deep text-white shadow-md shadow-brand/25"
      aria-hidden="true"
    >
      <span className="absolute top-0 right-0 size-4 rounded-bl-md bg-white/25" />
      <span className="text-center leading-tight">
        <span className="block text-[11px] font-bold tracking-wide uppercase">{type === "images" ? "Photos" : type}</span>
        <span className="block text-[10px] text-white/70">{pages} pp</span>
      </span>
    </span>
  );
}

function DocumentCard({ doc, onChanged }: { doc: Doc; onChanged: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!window.confirm(`Delete "${doc.filename}" and all its lessons, flashcards and practice sets? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await api.deleteDocument(doc.documentId);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete this document.");
      setDeleting(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-3xl border border-line bg-canvas shadow-sm shadow-ink/[0.03]">
      <header className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex min-w-0 items-center gap-4">
          <DocumentCover type={doc.sourceType} pages={doc.pageCount} />
          <div className="min-w-0">
            <h3 className="truncate font-display text-xl font-bold">{doc.filename.replace(/\.(pdf|pptx)$/i, "")}</h3>
            <p className="text-sm text-subtle">
              {doc.pageCount} {unitOf(doc.sourceType)}s · added {timeAgo(doc.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href={`/upload?documentId=${doc.documentId}`} className="px-4 py-2">
            <Plus className="size-4" aria-hidden="true" /> Study space
          </LinkButton>
          <LinkButton href={`/practice?documentId=${doc.documentId}`} variant="secondary" className="px-4 py-2">
            <Mic className="size-4" aria-hidden="true" /> Practise
          </LinkButton>
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            aria-label={`Delete ${doc.filename}`}
            title="Delete"
            className="grid size-10 place-items-center rounded-full text-subtle transition hover:bg-brand-soft hover:text-brand-deep disabled:opacity-50"
          >
            {deleting ? <Spinner className="size-4" /> : <Trash2 className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {error && (
        <div className="px-5 pb-4 sm:px-7">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="border-t border-line bg-page/60 p-5 sm:p-7">
        <Label icon={BookOpenText}>Study spaces</Label>
        {doc.guides.length === 0 ? (
          <EmptyRow href={`/upload?documentId=${doc.documentId}`} text="No study space yet." cta="Make one" />
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {doc.guides.map((g) => (
              <GuideCard key={g.guideId} guide={g} onChanged={onChanged} />
            ))}
          </ul>
        )}

        <div className="mt-7 grid grid-cols-1 gap-7 md:grid-cols-2">
          <div>
            <Label icon={Headphones}>Audio lessons</Label>
            {doc.episodes.length === 0 ? (
              <EmptyRow text="Add one from a study space's Listen tab." />
            ) : (
              <ul className="mt-3 space-y-2">
                {doc.episodes.map((e) => (
                  <EpisodeRow key={e.scriptId} episode={e} onChanged={onChanged} />
                ))}
              </ul>
            )}
          </div>
          <div>
            <Label icon={Mic}>Question practice</Label>
            {doc.questionSets.length === 0 ? (
              <EmptyRow href={`/practice?documentId=${doc.documentId}`} text="No practice sets yet." cta="Start one" />
            ) : (
              <ul className="mt-3 space-y-2">
                {doc.questionSets.map((qs) => (
                  <SetRow key={qs.setId} set={qs} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function Label({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
      <Icon className="size-3.5 text-brand" aria-hidden="true" />
      {children}
    </p>
  );
}

function EmptyRow({ text, href, cta }: { text: string; href?: string; cta?: string }) {
  return (
    <p className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-subtle">
      {text}
      {href && cta && (
        <Link href={href} className="shrink-0 font-medium text-brand hover:underline">
          {cta} →
        </Link>
      )}
    </p>
  );
}

function GuideCard({ guide: g, onChanged }: { guide: GuideSummary; onChanged: () => void }) {
  const building = g.status === "queued" || g.status === "processing";
  const remove = async () => {
    if (!window.confirm(`Delete the study space "${g.title}" with its flashcards, quiz results and chat? This can't be undone.`)) return;
    try {
      await api.deleteGuide(g.guideId);
      onChanged();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Couldn't delete this study space.");
    }
  };
  return (
    <li className="group relative rounded-2xl border border-line bg-canvas p-4 transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg hover:shadow-ink/5">
      <Link href={`/study/${g.guideId}`} className="flex items-center gap-4">
        {building ? (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-muted text-brand">
            <Spinner className="size-5" />
          </span>
        ) : g.status === "failed" ? (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand-deep">!</span>
        ) : (
          <ScoreRing value={g.bestQuizScore} size={56} stroke={5} />
        )}
        <span className="min-w-0 flex-1 pr-6">
          <span className="line-clamp-2 font-display leading-snug font-semibold">{g.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
            {building ? (
              <span className="text-brand-deep">
                {g.stageLabel}… {g.progress}%
              </span>
            ) : g.status === "failed" ? (
              <span className="text-brand-deep">Couldn&apos;t be made</span>
            ) : (
              <>
                <span>{g.sectionCount} steps</span>
                <span aria-hidden="true">·</span>
                <span>{g.flashcardCount} cards</span>
                {g.pageStart && <span>· pp. {g.pageStart}–{g.pageEnd}</span>}
                <span>· {g.bestQuizScore === null ? "quiz not taken" : "best quiz"}</span>
              </>
            )}
          </span>
        </span>
      </Link>
      {!building && (
        <button
          type="button"
          onClick={remove}
          aria-label={`Delete study space ${g.title}`}
          className="absolute top-3 right-3 rounded-full p-1.5 text-subtle opacity-0 transition group-hover:opacity-100 hover:bg-brand-soft hover:text-brand-deep focus-visible:opacity-100"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

function EpisodeRow({ episode: e, onChanged }: { episode: EpisodeSummary; onChanged: () => void }) {
  const building = e.status === "queued" || e.status === "processing";
  const language = e.language !== "en" ? LANGUAGE_OPTIONS.find((l) => l.value === e.language)?.label : null;
  const listenedPct = e.listening.completed ? 100 : (e.listening.positionSec / Math.max(1, e.totalDurationSec)) * 100;

  const remove = async () => {
    if (!window.confirm(`Delete the lesson "${e.title}" and its flashcards? This can't be undone.`)) return;
    try {
      await api.deleteEpisode(e.scriptId);
      onChanged();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Couldn't delete this lesson.");
    }
  };

  return (
    <li className="group flex items-center gap-3 rounded-2xl border border-line bg-canvas px-4 py-3 transition hover:border-brand/30">
      <Link href={`/listen/${e.scriptId}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full ${
            e.status === "failed" ? "bg-brand-soft text-brand-deep" : building ? "bg-muted text-brand" : "bg-ink text-canvas"
          }`}
        >
          {building ? <Spinner className="size-4" /> : e.status === "failed" ? "!" : Icons.play}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{e.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
            {building ? (
              <span className="text-brand-deep">
                {e.stageLabel}… {e.progress}%
              </span>
            ) : e.status === "failed" ? (
              <span className="text-brand-deep">Couldn&apos;t be made</span>
            ) : (
              <>
                <span>{formatDuration(e.totalDurationSec)}</span>
                <span aria-hidden="true">·</span>
                <span>{styleLabel(e.style)}</span>
                {language && <Pill>{language}</Pill>}
                {e.listening.completed && <Pill tone="success">Done</Pill>}
              </>
            )}
          </span>
          {e.status === "ready" && listenedPct > 0 && !e.listening.completed && <ProgressBar value={listenedPct} className="mt-2 h-1" />}
        </span>
      </Link>
      {!building && (
        <button
          type="button"
          onClick={remove}
          aria-label={`Delete lesson ${e.title}`}
          className="rounded-full p-2 text-subtle opacity-60 transition hover:bg-brand-soft hover:text-brand-deep group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

function SetRow({ set }: { set: QuestionSetSummary }) {
  return (
    <li>
      <Link
        href={`/practice/${set.setId}`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-canvas px-4 py-3 transition hover:border-brand/30"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{set.title ?? "Practice set"}</span>
          <span className="text-xs text-subtle">
            {set.answeredCount}/{set.questionCount} answered · {timeAgo(set.createdAt)}
          </span>
        </span>
        {set.averageBest !== null ? (
          <Pill tone={set.averageBest >= 65 ? "success" : "brand"}>{set.averageBest}/100</Pill>
        ) : (
          <Pill>Start</Pill>
        )}
      </Link>
    </li>
  );
}
