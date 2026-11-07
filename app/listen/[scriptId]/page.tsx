import { notFound } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import { AUDIO_BUCKET } from "@/lib/tts/generateAudio";
import type { AudioManifest } from "@/lib/tts/types";

export const metadata = { title: "Listen · Study Mate" };

/** Plays a generated episode: /listen/<scriptId>?title=Optional+Title */
export default async function ListenPage({
  params,
  searchParams,
}: {
  params: Promise<{ scriptId: string }>;
  searchParams: Promise<{ title?: string }>;
}) {
  const { scriptId } = await params;
  const { title } = await searchParams;

  if (!/^[A-Za-z0-9-]{1,100}$/.test(scriptId) || !process.env.SUPABASE_URL) notFound();

  const manifestUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${scriptId}/manifest.json`;
  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) notFound();

  const manifest = (await res.json()) as AudioManifest;

  return (
    <main className="px-4 py-8 sm:py-14">
      <AudioPlayer manifest={manifest} title={typeof title === "string" ? title.slice(0, 200) : undefined} />
    </main>
  );
}
