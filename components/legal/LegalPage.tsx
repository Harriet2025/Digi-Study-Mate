import type { ReactNode } from "react";

/** Shared layout for the privacy and terms pages. */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">Study Mate</p>
      <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-subtle">Last updated {updated}</p>
      <div className="mt-10 space-y-8 leading-relaxed text-ink [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-2 [&_p]:text-subtle [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-subtle">
        {children}
      </div>
    </main>
  );
}
