import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import LessonBuilding from "@/components/lesson/LessonBuilding";
import LessonToolbar from "@/components/lesson/LessonToolbar";
import { Page, Pill } from "@/components/ui";
import { LANGUAGE_OPTIONS, LEVEL_OPTIONS, styleLabel, type EpisodeManifest } from "@/lib/api";
import { loginUrl } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/types";

export const metadata = { title: "Listen · Study Mate" };

type LoadResult = { ok: true; episode: EpisodeManifest } | { ok: false; reason: "not_found" | "unavailable" | "signed_out" };

async function loadEpisode(scriptId: string): Promise<LoadResult> {
  try {
    // Server-side request: pass the visitor's session cookie on to the API.
    const cookie = (await cookies()).toString();
    const res = await fetch(`${BACKEND_URL}/api/episodes/${scriptId}`, { cache: "no-store", headers: { cookie } });
    if (res.status === 401) return { ok: false, reason: "signed_out" };
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, episode: (await res.json()) as EpisodeManifest };
  } catch {
    // Backend not running, or MySQL down.
    return { ok: false, reason: "unavailable" };
  }
}

/** Plays a generated lesson, or shows its progress while it's being made: /listen/<scriptId> */
export default async function ListenPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params;
  if (!/^[A-Za-z0-9-]{1,100}$/.test(scriptId)) notFound();

  const result = await loadEpisode(scriptId);
  if (!result.ok && result.reason === "not_found") notFound();
  if (!result.ok && result.reason === "signed_out") redirect(loginUrl(`/listen/${scriptId}`));

  if (!result.ok) {
    return (
      <Page narrow>
        <div className="mx-auto max-w-xl rounded-2xl border border-line bg-muted p-8 text-center">
          <h1 className="font-display text-2xl font-semibold">This lesson isn&apos;t available right now</h1>
          <p className="mt-2 text-subtle">
            We couldn&apos;t reach the Study Mate server. Check that it&apos;s running and try again in a moment.
          </p>
          <Link href="/library" className="mt-6 inline-block font-medium text-brand-deep underline-offset-4 hover:underline">
            Back to library
          </Link>
        </div>
      </Page>
    );
  }

  const episode = result.episode;
  if (episode.status !== "ready") {
    return (
      <Page narrow>
        <LessonBuilding initial={episode} />
      </Page>
    );
  }

  const language = LANGUAGE_OPTIONS.find((l) => l.value === episode.language)?.label;
  const level = LEVEL_OPTIONS.find((l) => l.value === episode.level)?.label;

  return (
    <Page narrow>
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/library" className="mr-2 text-sm font-medium text-subtle hover:text-ink">
            ← Library
          </Link>
          <Pill tone="brand">{styleLabel(episode.style)}</Pill>
          {level && <Pill>{level}</Pill>}
          {language && episode.language !== "en" && <Pill>{language}</Pill>}
          {episode.pageStart && (
            <Pill>
              Pages {episode.pageStart}–{episode.pageEnd}
            </Pill>
          )}
        </div>
        <LessonToolbar
          episodeId={episode.scriptId}
          title={episode.title}
          flashcardCount={episode.flashcardCount}
          downloadUrl={episode.downloadUrl}
        />
      </div>
      <AudioPlayer
        manifest={episode}
        title={episode.title}
        episodeId={episode.scriptId}
        language={episode.language}
        initialPositionSec={episode.listening.completed ? 0 : episode.listening.positionSec}
        flashcardCount={episode.flashcardCount}
      />
    </Page>
  );
}
