import AudioPlayer from "@/components/AudioPlayer";
import { buildDemoManifest, DEMO_TITLE } from "@/lib/demo/demoManifest";

export const metadata = { title: "Demo episode · Study Mate" };

export default function DemoListenPage() {
  return (
    <main className="px-4 py-8 sm:py-14">
      <p className="mx-auto mb-4 max-w-3xl rounded-2xl border border-sand bg-cream-deep px-4 py-3 text-sm text-stone">
        Demo episode: the audio is silent placeholder sound so you can try playback, seeking and the live transcript.
        “Interrupt &amp; Ask” works once API keys are set in <code className="font-mono text-charcoal">.env.local</code>.
      </p>
      <AudioPlayer manifest={buildDemoManifest()} title={DEMO_TITLE} />
    </main>
  );
}
