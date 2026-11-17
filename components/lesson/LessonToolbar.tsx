"use client";

import { useState } from "react";
import { Icons, LinkButton } from "@/components/ui";

/** Actions under the lesson title: flashcards, offline download, share. */
export default function LessonToolbar({
  episodeId,
  title,
  flashcardCount,
  downloadUrl,
}: {
  episodeId: string;
  title: string;
  flashcardCount: number;
  downloadUrl: string | null;
}) {
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");

  const share = async () => {
    const url = `${window.location.origin}/listen/${episodeId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${title} · Study Mate`, text: "Listen to this lesson with Alex & Sam", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // closed the share sheet
      setShareState("failed");
    }
    window.setTimeout(() => setShareState("idle"), 2500);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <LinkButton href={`/flashcards?episodeId=${episodeId}`} variant="secondary">
        {Icons.cards}
        <span>Flashcards{flashcardCount ? ` (${flashcardCount})` : ""}</span>
      </LinkButton>
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-5 py-2.5 text-sm font-medium transition hover:border-brand/50 hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" />
          </svg>
          Download MP3
        </a>
      )}
      <button
        type="button"
        onClick={share}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-5 py-2.5 text-sm font-medium transition hover:border-brand/50 hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
        </svg>
        <span aria-live="polite">{shareState === "copied" ? "Link copied!" : shareState === "failed" ? "Couldn't copy" : "Share"}</span>
      </button>
    </div>
  );
}
