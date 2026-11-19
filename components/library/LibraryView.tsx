"use client";

import { BookOpenText } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  formatDuration,
  LANGUAGE_OPTIONS,
  styleLabel,
  timeAgo,
  type EpisodeSummary,
  type GuideSummary,
  type LibraryData,
  type QuestionSetSummary,
} from "@/lib/api";
import { Button, Card, EmptyState, ErrorNote, Icons, LinkButton, LoadingBlock, Pill, ProgressBar, Spinner } from "@/components/ui";

export default function LibraryView() {
  const [data, setData] = useState<LibraryData | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error && !data) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!data) return <LoadingBlock label="Loading your library…" />;

  if (data.documents.length === 0) {
    return (
      <EmptyState
        icon={Icons.upload}
        title="Your library is empty"
        action={<LinkButton href="/upload">Upload your first notes</LinkButton>}
      >
        Upload a PDF or PowerPoint and Alex &amp; Sam will turn it into a lesson you can listen to.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-12">
      {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}

      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Documents" value={data.documents.length} />
        <StatCard label="Study spaces" value={data.documents.reduce((n, d) => n + d.guides.filter((g) => g.status === "ready").length, 0)} />
        <Link href="/flashcards" className="group rounded-2xl bg-brand p-5 text-white transition hover:bg-brand-deep">
          <p className="text-sm text-white/80">Flashcards due</p>
          <p className="mt-1 flex items-baseline justify-between font-display text-4xl font-semibold">
            {data.flashcards.due}
            <span className="font-sans text-sm font-medium text-white/90 group-hover:underline">Review →</span>
          </p>
        </Link>
      </div>

      {data.continueListening.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-semibold">Continue listening</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.continueListening.map((e) => (
              <Link
                key={e.scriptId}
                href={`/listen/${e.scriptId}`}
                className="group rounded-2xl border border-line bg-canvas p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
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
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-2xl font-semibold">Your documents</h2>
        <div className="mt-4 space-y-5">
          {data.documents.map((doc) => (
            <DocumentCard key={doc.documentId} doc={doc} onChanged={load} />
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-canvas p-5">
      <p className="text-sm text-subtle">{label}</p>
      <p className="mt-1 font-display text-4xl font-semibold">{value}</p>
    </div>
  );
}

function DocumentCard({ doc, onChanged }: { doc: LibraryData["documents"][number]; onChanged: () => void }) {
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
    <Card className="p-0">
      <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-xs font-bold text-brand-deep uppercase">
            {doc.sourceType}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-display text-xl font-semibold">{doc.filename.replace(/\.(pdf|pptx)$/i, "")}</h3>
            <p className="text-sm text-subtle">
              {doc.pageCount} {doc.sourceType === "pptx" ? "slides" : "pages"} · added {timeAgo(doc.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/upload?documentId=${doc.documentId}`} className="px-4 py-2">
            + New study space
          </LinkButton>
          <LinkButton href={`/practice?documentId=${doc.documentId}`} variant="secondary" className="px-4 py-2">
            Practise questions
          </LinkButton>
          <Button variant="danger" onClick={remove} disabled={deleting} aria-label={`Delete ${doc.filename}`} className="px-3 py-2">
            {deleting ? <Spinner className="size-4" /> : "Delete"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-5 pt-4 sm:px-6">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {doc.guides.length > 0 && (
        <div className="border-b border-line p-5 sm:p-6">
          <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">Study spaces</p>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {doc.guides.map((g) => (
              <GuideCard key={g.guideId} guide={g} onChanged={onChanged} />
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">Audio lessons</p>
          {doc.episodes.length === 0 ? (
            <p className="mt-3 text-sm text-subtle">No audio lessons yet. Add one from a study space&apos;s Listen tab.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {doc.episodes.map((e) => (
                <EpisodeRow key={e.scriptId} episode={e} onChanged={onChanged} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">Defence practice</p>
          {doc.questionSets.length === 0 ? (
            <p className="mt-3 text-sm text-subtle">No practice sets yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {doc.questionSets.map((qs) => (
                <SetRow key={qs.setId} set={qs} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
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
    <li className="group relative rounded-2xl border border-line bg-canvas p-4 transition hover:border-brand/40 hover:shadow-md">
      <Link href={`/study/${g.guideId}`} className="block">
        <div className="flex items-start gap-3">
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-2xl text-lg ${
              g.status === "failed" ? "bg-brand-soft text-brand-deep" : building ? "bg-muted text-brand" : "bg-brand text-white"
            }`}
            aria-hidden="true"
          >
            {building ? <Spinner className="size-5" /> : g.status === "failed" ? "!" : <BookOpenText className="size-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 font-display text-lg leading-snug font-semibold">{g.title}</span>
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
                  {g.bestQuizScore !== null && <Pill tone={g.bestQuizScore >= 75 ? "success" : "brand"}>Quiz {g.bestQuizScore}%</Pill>}
                </>
              )}
            </span>
          </span>
        </div>
      </Link>
      {!building && (
        <button
          type="button"
          onClick={remove}
          aria-label={`Delete study space ${g.title}`}
          className="absolute top-3 right-3 rounded-full p-1.5 text-subtle opacity-0 transition group-hover:opacity-100 hover:bg-brand-soft hover:text-brand-deep focus-visible:opacity-100"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
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
    <li className="group flex items-center gap-3 rounded-2xl border border-line/70 bg-canvas px-4 py-3 transition hover:border-brand/40">
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
                {e.flashcardCount > 0 && <span>· {e.flashcardCount} cards</span>}
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
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
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
        className="flex items-center justify-between gap-3 rounded-2xl border border-line/70 bg-canvas px-4 py-3 transition hover:border-brand/40"
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
