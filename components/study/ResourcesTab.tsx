"use client";

import type { GuideDetail, GuideResource } from "@/lib/api";
import { EmptyState, Icons } from "@/components/ui";

export default function ResourcesTab({ guide }: { guide: GuideDetail }) {
  const videos = guide.resources.filter((r) => r.kind !== "reading");
  const reading = guide.resources.filter((r) => r.kind === "reading");

  if (guide.resources.length === 0) {
    return (
      <EmptyState icon={Icons.headphones} title="No resources yet">
        Resources are added along with the quiz. Use “Make them again” above to create them.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-2xl font-semibold">Watch</h2>
        <p className="mt-1 text-subtle">Explainer videos on the ideas in this lesson. Watching a second explanation is one of the fastest ways to make something click.</p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((r) => (
            <ResourceCard key={r.url} resource={r} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold">Read further</h2>
        <p className="mt-1 text-subtle">Background reading and academic sources for going deeper or for assignments.</p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reading.map((r) => (
            <ResourceCard key={r.url} resource={r} />
          ))}
        </div>
      </section>

      <p className="text-xs text-subtle">
        Links open YouTube, Wikipedia and Google Scholar searches (or specific videos when a YouTube key is configured). Always check
        a source against your course material.
      </p>
    </div>
  );
}

function ResourceCard({ resource: r }: { resource: GuideResource }) {
  const isVideo = r.kind !== "reading";
  return (
    <a
      href={r.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-canvas transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      {r.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.thumbnailUrl} alt="" className="aspect-video w-full object-cover" />
      ) : (
        <div className={`grid aspect-[16/7] place-items-center ${isVideo ? "bg-ink text-canvas" : "bg-muted text-brand-deep"}`}>
          {isVideo ? (
            <span className="">{Icons.play}</span>
          ) : (
            <span className="font-display text-4xl" aria-hidden="true">
              📚
            </span>
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold tracking-wide text-brand-deep uppercase">
          {r.kind === "video_search" ? "YouTube search" : r.source}
        </p>
        <p className="mt-1 font-display text-lg leading-snug font-semibold group-hover:text-brand-deep">{r.title}</p>
        {r.description && <p className="mt-2 text-sm text-subtle">{r.description}</p>}
        <p className="mt-auto pt-4 text-sm font-medium text-brand-deep">{isVideo ? "Watch" : "Read"} ↗</p>
      </div>
    </a>
  );
}
