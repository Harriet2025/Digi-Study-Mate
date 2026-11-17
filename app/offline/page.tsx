import { WifiOff } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Offline · Study Mate" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand">
        <WifiOff className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-6 font-display text-3xl font-semibold">You&apos;re offline</h1>
      <p className="mt-2 text-subtle">Reconnect to keep studying. Downloaded lessons still play in your device&apos;s audio app.</p>
      <Link href="/library" className="mt-8 rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand-deep">
        Try again
      </Link>
    </main>
  );
}
