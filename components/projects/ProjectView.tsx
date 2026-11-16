"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type DefensePack, type ProjectDetail } from "@/lib/api";
import { Button, Card, ErrorNote, Icons, LinkButton, LoadingBlock, ProgressBar, Spinner } from "@/components/ui";
import { ClosingSlidePreview, SlidePreview, TitleSlidePreview } from "./SlidePreview";

const TABS = [
  { key: "slides", label: "Slides", icon: "🖼️" },
  { key: "script", label: "Presenter script", icon: "🎤" },
  { key: "coach", label: "Defense coach", icon: "🛡️" },
  { key: "practice", label: "Practise", icon: "🎯" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function ProjectView({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("slides");

  const load = useCallback(async () => {
    try {
      setProject(await api.project(projectId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this project.");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const building = project && (project.status === "queued" || project.status === "processing");
  useEffect(() => {
    if (!building) return;
    const timer = window.setTimeout(load, 2500);
    return () => window.clearTimeout(timer);
  }, [building, project, load]);

  if (error && !project) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!project) return <LoadingBlock label="Opening your project…" />;
  if (project.status === "failed") {
    return (
      <Card className="mx-auto max-w-xl py-10 text-center">
        <p className="font-serif text-2xl font-semibold">This presentation couldn&apos;t be made</p>
        <p className="mt-2 text-stone">{project.error ?? "Something went wrong. Please try again."}</p>
        <LinkButton href="/projects" className="mt-6">
          Back to projects
        </LinkButton>
      </Card>
    );
  }
  if (building) return <Building project={project} />;

  return (
    <div>
      <Link href="/projects" className="text-sm font-medium text-stone hover:text-charcoal">
        ← All projects
      </Link>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-terracotta-deep uppercase">{project.course ?? "Project"}</p>
          <h1 className="mt-1 font-serif text-4xl leading-tight font-semibold text-balance sm:text-5xl">{project.title}</h1>
          <p className="mt-2 text-stone">
            {(project.deck?.slides.length ?? 0) + 2} slides · {project.durationMinutes}-minute talk
            {project.sourceFilename && ` · from ${project.sourceFilename}`}
          </p>
        </div>
        {project.downloadUrl && (
          <a
            href={project.downloadUrl}
            download
            className="inline-flex items-center justify-center gap-2 rounded-full bg-terracotta px-6 py-3 font-medium text-white shadow-md shadow-terracotta/25 transition hover:bg-terracotta-deep"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" />
            </svg>
            Download PowerPoint
          </a>
        )}
      </div>

      <div className="sticky top-16 z-30 -mx-4 mt-8 border-b border-sand bg-cream/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <nav aria-label="Project" className="flex gap-1 overflow-x-auto py-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-current={tab === t.key ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                tab === t.key ? "bg-charcoal text-cream" : "text-stone hover:bg-cream-deep hover:text-charcoal"
              }`}
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-8">
        {tab === "slides" && <SlidesTab project={project} />}
        {tab === "script" && <ScriptTab project={project} />}
        {tab === "coach" && (
          <CoachTab
            project={project}
            onPractise={() => {
              setTab("practice");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
        {tab === "practice" && <PracticeTab project={project} />}
      </div>
    </div>
  );
}

const STAGES = [
  { key: "reading", label: "Reading your brief" },
  { key: "writing", label: "Writing your slides" },
  { key: "designing", label: "Designing the PowerPoint" },
  { key: "coaching", label: "Preparing your script and defense" },
];

function Building({ project }: { project: ProjectDetail }) {
  const current = Math.max(0, STAGES.findIndex((s) => s.key === project.stage));
  return (
    <Card className="mx-auto max-w-xl p-8 sm:p-10">
      <div className="flex items-center gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-charcoal text-cream">
          <Spinner className="size-7" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] text-terracotta-deep uppercase">Building your presentation</p>
          <h1 className="truncate font-serif text-2xl font-semibold">{project.title}</h1>
        </div>
      </div>
      <ProgressBar value={project.progress} className="mt-8" />
      <p className="mt-2 text-right text-sm text-stone tabular-nums" aria-live="polite">
        {project.progress}%
      </p>
      <ol className="mt-4 space-y-3">
        {STAGES.map((stage, i) => {
          const state = project.status === "queued" ? "todo" : i < current ? "done" : i === current ? "current" : "todo";
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
        This takes about one to three minutes. You can leave this page; your project will be waiting under Projects.
      </p>
    </Card>
  );
}

function SlidesTab({ project }: { project: ProjectDetail }) {
  const deck = project.deck!;
  const total = deck.slides.length + 2;
  const [showNotes, setShowNotes] = useState(true);
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-stone">A preview of your deck. The downloaded PowerPoint has the same design and every speaker note, ready to edit.</p>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} className="size-4 accent-terracotta" />
          Show speaker notes
        </label>
      </div>
      <ol className="grid gap-8 md:grid-cols-2">
        <SlideItem number={1} notes={showNotes ? deck.titleNotes : null}>
          <TitleSlidePreview title={deck.title} subtitle={deck.subtitle} course={project.course} />
        </SlideItem>
        {deck.slides.map((s, i) => (
          <SlideItem key={i} number={i + 2} notes={showNotes ? s.speakerNotes : null}>
            <SlidePreview slide={s} number={i + 2} total={total} course={project.course} />
          </SlideItem>
        ))}
        <SlideItem number={total} notes={showNotes ? deck.closingNotes : null}>
          <ClosingSlidePreview message={deck.closingMessage} />
        </SlideItem>
      </ol>
    </div>
  );
}

function SlideItem({ number, notes, children }: { number: number; notes: string | null; children: React.ReactNode }) {
  return (
    <li>
      <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-stone uppercase">Slide {number}</p>
      {children}
      {notes && (
        <p className="mt-3 rounded-2xl bg-cream-deep/70 px-4 py-3 text-sm leading-relaxed">
          <span className="font-semibold">Notes: </span>
          {notes}
        </p>
      )}
    </li>
  );
}

function ScriptTab({ project }: { project: ProjectDetail }) {
  const defense = project.defense!;
  const totalSeconds = defense.script.reduce((n, s) => n + (s.seconds || 0), 0);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-3xl bg-charcoal p-6 text-cream sm:p-8">
        <p className="text-xs font-semibold tracking-[0.16em] text-terracotta-soft uppercase">Open with</p>
        <p className="mt-2 font-serif text-2xl leading-snug">“{defense.openingLine}”</p>
        <p className="mt-4 text-sm text-cream/70">
          Planned length: about {Math.round(totalSeconds / 60)} min for a {project.durationMinutes}-minute slot. Practise out loud with a timer
          at least twice.
        </p>
      </div>
      <ol className="mt-8 space-y-4">
        {defense.script.map((s) => (
          <li key={s.slideNumber} className="rounded-3xl border border-sand bg-cream p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-serif text-xl font-semibold">
                <span className="text-terracotta">Slide {s.slideNumber}.</span> {s.title}
              </p>
              <span className="rounded-full bg-cream-deep px-3 py-1 text-xs font-semibold text-stone">~{s.seconds}s</span>
            </div>
            <p className="mt-3 text-[17px] leading-relaxed">{s.talkingPoints}</p>
            {s.transition && (
              <p className="mt-3 border-l-2 border-terracotta pl-3 text-sm text-stone italic">Then: “{s.transition}”</p>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-8 rounded-3xl bg-terracotta p-6 text-white sm:p-8">
        <p className="text-xs font-semibold tracking-[0.16em] uppercase opacity-80">Close with</p>
        <p className="mt-2 font-serif text-2xl leading-snug">“{defense.closingLine}”</p>
      </div>
    </div>
  );
}

function CoachTab({ project, onPractise }: { project: ProjectDetail; onPractise: () => void }) {
  const defense = project.defense!;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section>
        <h2 className="font-serif text-2xl font-semibold">Questions your lecturer is likely to ask</h2>
        <p className="mt-1 text-stone">Try answering each one out loud before you reveal the model answer.</p>
        <ol className="mt-5 space-y-4">
          {defense.likelyQuestions.map((q, i) => (
            <LikelyQuestion key={i} number={i + 1} q={q} />
          ))}
        </ol>
        <Button onClick={onPractise} className="mt-6">
          Practise with an examiner who grades you →
        </Button>
      </section>
      <aside className="space-y-5 lg:sticky lg:top-36 lg:self-start">
        <Card className="bg-charcoal text-cream">
          <p className="text-xs font-semibold tracking-[0.16em] text-terracotta-soft uppercase">How to defend it</p>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed">
            {defense.strategy.map((s) => (
              <li key={s} className="flex gap-2">
                <span className="text-terracotta-soft" aria-hidden="true">
                  ✓
                </span>
                {s}
              </li>
            ))}
          </ul>
        </Card>
        {defense.weakSpots.length > 0 && (
          <Card>
            <p className="text-xs font-semibold tracking-[0.16em] text-terracotta-deep uppercase">Be ready to defend</p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
              {defense.weakSpots.map((w) => (
                <li key={w} className="flex gap-2">
                  <span className="text-terracotta" aria-hidden="true">
                    !
                  </span>
                  {w}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}

function LikelyQuestion({ number, q }: { number: number; q: DefensePack["likelyQuestions"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-3xl border border-sand bg-cream p-6">
      <p className="font-serif text-xl leading-snug">
        <span className="font-semibold text-terracotta">{number}.</span> “{q.question}”
      </p>
      <p className="mt-2 text-sm text-stone">
        <span className="font-semibold text-charcoal">What they&apos;re testing:</span> {q.why}
      </p>
      {open ? (
        <div className="mt-4 rounded-2xl bg-sage-soft/60 p-4">
          <p className="text-xs font-semibold tracking-[0.14em] text-sage uppercase">Model answer</p>
          <p className="mt-1 leading-relaxed">{q.modelAnswer}</p>
          {q.tip && (
            <p className="mt-3 text-sm text-stone">
              <span className="font-semibold text-charcoal">Delivery tip:</span> {q.tip}
            </p>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-full border border-sand px-4 py-2 text-sm font-medium hover:border-terracotta/50">
          I&apos;ve tried. Show the model answer
        </button>
      )}
    </li>
  );
}

function PracticeTab({ project }: { project: ProjectDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const { setId } = await api.practiceProject(project.projectId);
      router.push(`/practice/${setId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the practice session. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto max-w-2xl bg-charcoal p-8 text-center text-cream sm:p-10">
      <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-terracotta text-white">{Icons.shield}</span>
      <h2 className="mt-5 font-serif text-3xl font-semibold">Rehearse with a strict examiner</h2>
      <p className="mx-auto mt-3 max-w-md text-cream/75">
        The examiner reads your slides, finds the weak spots and asks you five tough questions. Answer by typing or speaking and get
        graded against a marking rubric, with feedback on what you missed.
      </p>
      {error && (
        <div className="mt-5 text-left">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <Button onClick={start} disabled={busy} className="mt-7 px-7 py-3 text-base">
        {busy ? <Spinner className="size-4" /> : Icons.shield}
        {busy ? "The examiner is reading your slides…" : project.questionSetId ? "Continue practising" : "Start practice session"}
      </Button>
      {busy && <p className="mt-3 text-xs text-cream/60">This takes about 20–40 seconds the first time.</p>}
    </Card>
  );
}
