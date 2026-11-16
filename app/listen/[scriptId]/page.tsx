import Link from "next/link";
import { notFound } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import { BACKEND_URL, type AudioManifest } from "@/lib/types";

export const metadata = { title: "Listen · Study Mate" };

type LoadResult = { ok: true; manifest: AudioManifest } | { ok: false; reason: "not_found" | "unavailable" };

async function loadEpisode(scriptId: string): Promise<LoadResult> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/episodes/${scriptId}`, { cache: "no-store" });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, manifest: (await res.json()) as AudioManifest };
  } catch {
    // Backend not running, or MySQL down.
    return { ok: false, reason: "unavailable" };
  }
}

/** Plays a generated episode: /listen/<scriptId> */
export default async function ListenPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params;
  if (!/^[A-Za-z0-9-]{1,100}$/.test(scriptId)) notFound();

  const result = await loadEpisode(scriptId);
  if (!result.ok && result.reason === "not_found") notFound();

  return (
    <main className="px-4 py-8 sm:py-14">
      {result.ok ? (
        <AudioPlayer manifest={result.manifest} title={result.manifest.title} />
      ) : (
        <div className="mx-auto max-w-xl rounded-3xl border border-sand bg-cream-deep p-8 text-center">
          <h1 className="font-serif text-2xl font-semibold">This lesson isn&apos;t available right now</h1>
          <p className="mt-2 text-stone">
            We couldn&apos;t reach the Study Mate server. Check that it&apos;s running and try again in a moment.
          </p>
          <Link href="/" className="mt-6 inline-block font-medium text-terracotta-deep underline-offset-4 hover:underline">
            Back to home
          </Link>
        </div>
      )}
    </main>
  );
}
