"use client";

import { useEffect, useState } from "react";
import { api, ApiError, STYLE_OPTIONS, type GuideDetail, type LessonStyle } from "@/lib/api";
import { Button, Card, ChoiceGroup, ErrorNote, Icons, LinkButton, ProgressBar, Spinner } from "@/components/ui";

const LENGTHS = [
  { value: 3, label: "3 min" },
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
];

/** The audio version of a study space: Alex & Sam talk the student through the same pages. */
export default function ListenTab({ guide, onChanged }: { guide: GuideDetail; onChanged: () => void }) {
  const audio = guide.audio;
  const [minutes, setMinutes] = useState(5);
  const [style, setStyle] = useState<LessonStyle>("standard");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const building = audio && (audio.status === "queued" || audio.status === "processing");
  useEffect(() => {
    if (!building) return;
    const timer = window.setTimeout(onChanged, 3000);
    return () => window.clearTimeout(timer);
  }, [building, audio, onChanged]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      await api.createEpisode({
        documentId: guide.documentId,
        pageStart: guide.pageStart ?? undefined,
        pageEnd: guide.pageEnd ?? undefined,
        targetMinutes: minutes,
        title: guide.title,
        style,
        level: guide.level,
        language: guide.language,
        guideId: guide.guideId,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the audio lesson.");
    } finally {
      setCreating(false);
    }
  };

  if (audio?.status === "ready") {
    return (
      <Card className="mx-auto max-w-2xl bg-charcoal p-8 text-center text-cream">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-terracotta text-white">{Icons.headphones}</span>
        <h2 className="mt-4 font-serif text-3xl font-semibold">Your audio lesson is ready</h2>
        <p className="mx-auto mt-2 max-w-md text-cream/75">
          Alex and Sam talk you through the same pages, with quiz pauses and the Interrupt &amp; Ask button.
        </p>
        <LinkButton href={`/listen/${audio.scriptId}`} className="mt-6 px-7 py-3 text-base">
          {Icons.play} Open the player
        </LinkButton>
      </Card>
    );
  }

  if (building) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <Spinner className="mx-auto size-8 text-terracotta" />
        <p className="mt-4 font-serif text-xl font-semibold">Recording Alex &amp; Sam…</p>
        <ProgressBar value={audio!.progress} className="mx-auto mt-5 max-w-sm" />
        <p className="mt-3 text-sm text-stone">You can keep studying in the other tabs; this keeps going in the background.</p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl space-y-6 p-7 sm:p-8">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-terracotta-deep uppercase">Prefer to listen?</p>
        <h2 className="mt-1 font-serif text-3xl font-semibold">Turn this lesson into a podcast</h2>
        <p className="mt-2 text-stone">
          Alex (a friendly tutor) and Sam (a curious student) talk you through the same pages, pausing to quiz you. Great for the bus,
          the gym or a walk.
        </p>
        {audio?.status === "failed" && <p className="mt-3 text-sm text-terracotta-deep">The last attempt didn&apos;t work. Try again below.</p>}
      </div>
      <ChoiceGroup label="Length" value={minutes} onChange={setMinutes} options={LENGTHS} columns={3} />
      <ChoiceGroup label="Style" value={style} onChange={setStyle} options={STYLE_OPTIONS} />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button onClick={create} disabled={creating} className="w-full py-3 text-base">
        {creating ? <Spinner className="size-4" /> : Icons.headphones}
        {creating ? "Starting…" : "Create the audio lesson"}
      </Button>
      <p className="text-center text-xs text-stone">Uses your ElevenLabs voice credit (roughly 1,000 characters per minute of audio).</p>
    </Card>
  );
}
