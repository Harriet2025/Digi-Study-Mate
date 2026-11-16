"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type EpisodeManifest } from "@/lib/api";
import { Card, ErrorNote, LinkButton, ProgressBar, Spinner } from "@/components/ui";

const STAGES = [
  { key: "reading", label: "Reading your pages" },
  { key: "writing", label: "Writing Alex & Sam's script" },
  { key: "recording", label: "Recording the voices" },
  { key: "flashcards", label: "Making your flashcards" },
];

const POLL_MS = 2000;

/** Shown while a lesson is being made; polls for progress and reloads the page when it's ready. */
export default function LessonBuilding({ initial }: { initial: EpisodeManifest }) {
  const router = useRouter();
  const [episode, setEpisode] = useState(initial);
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    if (episode.status === "ready") {
      router.refresh();
      return;
    }
    if (episode.status === "failed") return;
    const timer = window.setTimeout(async () => {
      try {
        setEpisode(await api.episode(episode.scriptId));
        setConnectionError(false);
      } catch {
        setConnectionError(true);
        setEpisode((e) => ({ ...e })); // schedule another poll
      }
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [episode, router]);

  if (episode.status === "failed") {
    return (
      <Card className="mx-auto max-w-xl py-10 text-center">
        <p className="font-serif text-2xl font-semibold">This lesson couldn&apos;t be made</p>
        <p className="mt-2 text-stone">{episode.error ?? "Something went wrong. Please try again."}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {episode.documentId && <LinkButton href={`/upload?documentId=${episode.documentId}`}>Try again</LinkButton>}
          <LinkButton href="/library" variant="secondary">
            Back to library
          </LinkButton>
        </div>
      </Card>
    );
  }

  const currentIndex = Math.max(0, STAGES.findIndex((s) => s.key === episode.stage));
  return (
    <Card className="mx-auto max-w-xl p-8 sm:p-10">
      <div className="flex items-center gap-4">
        <div className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-terracotta text-white">
          <Spinner className="size-7" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] text-terracotta-deep uppercase">Making your lesson</p>
          <h1 className="truncate font-serif text-2xl font-semibold">{episode.title}</h1>
        </div>
      </div>

      <ProgressBar value={episode.progress} className="mt-8" />
      <p className="mt-2 text-right text-sm text-stone tabular-nums" aria-live="polite">
        {episode.progress}%
      </p>

      <ol className="mt-4 space-y-3">
        {STAGES.map((stage, i) => {
          const state = episode.status === "queued" ? "todo" : i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
          return (
            <li key={stage.key} className="flex items-center gap-3">
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  state === "done" ? "bg-sage text-white" : state === "current" ? "bg-terracotta-soft text-terracotta-deep" : "bg-cream-deep text-stone"
                }`}
              >
                {state === "done" ? "✓" : state === "current" ? <Spinner className="size-3.5" /> : i + 1}
              </span>
              <span className={state === "todo" ? "text-stone" : "font-medium"}>{stage.label}</span>
            </li>
          );
        })}
      </ol>

      <p className="mt-8 rounded-2xl bg-cream-deep px-4 py-3 text-sm text-stone">
        This usually takes under a minute for a short lesson. You can leave this page; the lesson keeps being made and will be
        waiting in your <Link href="/library" className="font-medium text-terracotta-deep hover:underline">library</Link>.
      </p>
      {connectionError && (
        <div className="mt-4">
          <ErrorNote>Lost connection to the server. Retrying…</ErrorNote>
        </div>
      )}
    </Card>
  );
}
