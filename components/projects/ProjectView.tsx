"use client";

import DownloadButton from "@/components/DownloadButton";
import { BookOpen, FileText, Mic, Presentation, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type DefensePack, type ProjectDetail } from "@/lib/api";
import { Button, Card, ErrorNote, Icons, LinkButton, LoadingBlock, ProgressBar, Spinner } from "@/components/ui";
import { ClosingSlidePreview, SlidePreview, TitleSlidePreview } from "./SlidePreview";

const TABS = [
  { key: "slides", label: "Slides", icon: Presentation },
  { key: "script", label: "What to say", icon: FileText },
  { key: "understand", label: "Understand it", icon: BookOpen },
  { key: "coach", label: "Defence coach", icon: ShieldCheck },
  { key: "practice", label: "Practise", icon: Mic },
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
      setError(err instanceof ApiError ? err.message : "Couldn't load this presentation.");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const building = project && (project.status === "queued" || project.status === "processing");
  const waiting = building || project?.walkthroughStatus === "processing";
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(load, 2500);
    return () => window.clearTimeout(timer);
  }, [waiting, project, load]);

  if (error && !project) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!project) return <LoadingBlock label="Opening your presentation…" />;
  if (project.status === "failed") {
    return (
      <Card className="mx-auto max-w-xl py-10 text-center">
        <p className="font-display text-2xl font-semibold">This presentation couldn&apos;t be made</p>
        <p className="mt-2 text-subtle">{project.error ?? "Something went wrong. Please try again."}</p>
        <LinkButton href="/projects" className="mt-6">
          Back to presentations
        </LinkButton>
      </Card>
    );
  }
  if (building) return <Building project={project} />;

  return (
    <div>
      <Link href="/projects" className="text-sm font-medium text-subtle hover:text-ink">
        ← All presentations
      </Link>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-deep uppercase">{project.course ?? "Presentation"}</p>
          <h1 className="mt-1 font-display text-4xl leading-tight font-semibold text-balance sm:text-5xl">{project.title}</h1>
          <p className="mt-2 text-subtle">
            {(project.deck?.slides.length ?? 0) + 2} slides · {project.durationMinutes}-minute talk
            {project.sourceFilename && ` · from ${project.sourceFilename}`}
          </p>
        </div>
        {project.downloadUrl && (
          <DownloadButton
            url={project.downloadUrl}
            filename={`${project.title}.pptx`}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 font-medium text-white shadow-md shadow-brand/25 transition hover:bg-brand-deep disabled:opacity-70"
          >
            Download PowerPoint
          </DownloadButton>
        )}
      </div>

      <div className="sticky top-16 z-30 -mx-4 mt-8 border-b border-line bg-canvas/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <nav aria-label="Presentation" className="flex gap-1 overflow-x-auto py-2">
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
                tab === t.key ? "bg-ink text-canvas" : "text-subtle hover:bg-muted hover:text-ink"
              }`}
            >
              <t.icon className="size-4" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-8">
        {tab === "slides" && <SlidesTab project={project} />}
        {tab === "script" && <ScriptTab project={project} />}
        {tab === "understand" && <UnderstandTab project={project} onChange={setProject} />}
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
  { key: "reading", label: "Reading your topic and files" },
  { key: "writing", label: "Writing your slides" },
  { key: "designing", label: "Designing the PowerPoint" },
  { key: "coaching", label: "Preparing your script and defence" },
  { key: "explaining", label: "Explaining every slide" },
];

function Building({ project }: { project: ProjectDetail }) {
  const current = Math.max(0, STAGES.findIndex((s) => s.key === project.stage));
  return (
    <Card className="mx-auto max-w-xl p-8 sm:p-10">
      <div className="flex items-center gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink text-canvas">
          <Spinner className="size-7" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] text-brand-deep uppercase">Building your presentation</p>
          <h1 className="truncate font-display text-2xl font-semibold">{project.title}</h1>
        </div>
      </div>
      <ProgressBar value={project.progress} className="mt-8" />
      <p className="mt-2 text-right text-sm text-subtle tabular-nums" aria-live="polite">
        {project.progress}%
      </p>
      <ol className="mt-4 space-y-3">
        {STAGES.map((stage, i) => {
          const state = project.status === "queued" ? "todo" : i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={stage.key} className="flex items-center gap-3">
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  state === "done" ? "bg-success text-white" : state === "current" ? "bg-brand-soft text-brand-deep" : "bg-muted text-subtle"
                }`}
              >
                {state === "done" ? "✓" : state === "current" ? <Spinner className="size-3.5" /> : i + 1}
              </span>
              <span className={state === "todo" ? "text-subtle" : "font-medium"}>{stage.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-8 rounded-2xl bg-muted px-4 py-3 text-sm text-subtle">
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
        <p className="text-subtle">A preview of your deck. The downloaded PowerPoint has the same design and every speaker note, ready to edit.</p>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} className="size-4 accent-brand" />
          Show speaker notes
        </label>
      </div>
      <ol className="grid grid-cols-1 gap-8 md:grid-cols-2">
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
      <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-subtle uppercase">Slide {number}</p>
      {children}
      {notes && (
        <p className="mt-3 rounded-2xl bg-muted/70 px-4 py-3 text-sm leading-relaxed">
          <span className="font-semibold">Notes: </span>
          {notes}
        </p>
      )}
    </li>
  );
}

function ScriptTab({ project }: { project: ProjectDetail }) {
  const defence = project.defense!;
  const totalSeconds = defence.script.reduce((n, s) => n + (s.seconds || 0), 0);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl bg-ink p-6 text-canvas sm:p-8">
        <p className="text-xs font-semibold tracking-[0.16em] text-brand-soft uppercase">Open with</p>
        <p className="mt-2 font-display text-2xl leading-snug">“{defence.openingLine}”</p>
        <p className="mt-4 text-sm text-canvas/70">
          Planned length: about {Math.round(totalSeconds / 60)} min for a {project.durationMinutes}-minute slot. Practise out loud with a timer
          at least twice.
        </p>
      </div>
      <ol className="mt-8 space-y-4">
        {defence.script.map((s) => (
          <li key={s.slideNumber} className="rounded-2xl border border-line bg-canvas p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-xl font-semibold">
                <span className="text-brand">Slide {s.slideNumber}.</span> {s.title}
              </p>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-subtle">~{s.seconds}s</span>
            </div>
            <p className="mt-3 text-[17px] leading-relaxed">{s.talkingPoints}</p>
            {s.transition && (
              <p className="mt-3 border-l-2 border-brand pl-3 text-sm text-subtle italic">Then: “{s.transition}”</p>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-8 rounded-2xl bg-brand p-6 text-white sm:p-8">
        <p className="text-xs font-semibold tracking-[0.16em] uppercase opacity-80">Close with</p>
        <p className="mt-2 font-display text-2xl leading-snug">“{defence.closingLine}”</p>
      </div>
    </div>
  );
}

function UnderstandTab({ project, onChange }: { project: ProjectDetail; onChange: (p: ProjectDetail) => void }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walk = project.walkthrough;

  const request = async () => {
    setAsking(true);
    setError(null);
    try {
      onChange(await api.requestWalkthrough(project.projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the walkthrough. Please try again.");
    } finally {
      setAsking(false);
    }
  };

  if (!walk) {
    const working = project.walkthroughStatus === "processing" || asking;
    return (
      <Card className="mx-auto max-w-xl py-10 text-center">
        <p className="font-display text-2xl font-semibold">Understand every slide</p>
        <p className="mt-2 text-subtle">
          {working
            ? "Writing your slide-by-slide walkthrough. This takes about a minute."
            : project.walkthroughStatus === "failed"
              ? "The walkthrough couldn't be written last time. Try again."
              : "A plain explanation of each slide, what to say, key terms and the question you're most likely to get."}
        </p>
        {working ? (
          <div className="mt-6 flex justify-center">
            <Spinner />
          </div>
        ) : (
          <Button className="mt-6" onClick={request}>
            Explain my presentation
          </Button>
        )}
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl bg-ink p-6 text-canvas sm:p-8">
        <p className="text-xs font-semibold tracking-[0.16em] text-brand-soft uppercase">The big picture</p>
        <p className="mt-2 text-[17px] leading-relaxed">{walk.overview}</p>
      </div>

      <ol className="mt-8 space-y-4">
        {walk.slides.map((s) => (
          <li key={s.number} className="rounded-2xl border border-line bg-canvas p-5 sm:p-6">
            <p className="font-display text-xl font-semibold break-words">
              <span className="text-brand">Slide {s.number}.</span> {s.title}
            </p>
            <p className="mt-3 text-[17px] leading-relaxed break-words">{s.explanation}</p>

            <div className="mt-4 rounded-xl bg-brand/5 p-4">
              <p className="text-xs font-semibold tracking-[0.14em] text-brand uppercase">Say it like this</p>
              <p className="mt-1 leading-relaxed break-words italic">“{s.sayItLikeThis}”</p>
            </div>

            {s.keyTerms.length > 0 && (
              <dl className="mt-4 space-y-2">
                {s.keyTerms.map((t) => (
                  <div key={t.term} className="text-sm leading-relaxed break-words">
                    <dt className="inline font-semibold">{t.term}: </dt>
                    <dd className="inline text-subtle">{t.definition}</dd>
                  </div>
                ))}
              </dl>
            )}

            <details className="group mt-4 rounded-xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-semibold">If they ask: {s.ifAsked.question}</summary>
              <p className="mt-2 text-sm leading-relaxed break-words">{s.ifAsked.answer}</p>
            </details>
          </li>
        ))}
      </ol>

      {walk.beforeYouPresent.length > 0 && (
        <div className="mt-8 rounded-2xl bg-brand p-6 text-white sm:p-8">
          <p className="text-xs font-semibold tracking-[0.16em] uppercase opacity-80">Before you present</p>
          <ul className="mt-3 space-y-2">
            {walk.beforeYouPresent.map((item) => (
              <li key={item} className="flex gap-2 leading-relaxed">
                <span aria-hidden="true">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CoachTab({ project, onPractise }: { project: ProjectDetail; onPractise: () => void }) {
  const defence = project.defense!;
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
      <section>
        <h2 className="font-display text-2xl font-semibold">Questions your lecturer is likely to ask</h2>
        <p className="mt-1 text-subtle">Try answering each one out loud before you reveal the model answer.</p>
        <ol className="mt-5 space-y-4">
          {defence.likelyQuestions.map((q, i) => (
            <LikelyQuestion key={i} number={i + 1} q={q} />
          ))}
        </ol>
        <Button onClick={onPractise} className="mt-6">
          Practise with an examiner who grades you →
        </Button>
      </section>
      <aside className="space-y-5 lg:sticky lg:top-36 lg:self-start">
        <Card className="bg-ink text-canvas">
          <p className="text-xs font-semibold tracking-[0.16em] text-brand-soft uppercase">How to defend it</p>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed">
            {defence.strategy.map((s) => (
              <li key={s} className="flex gap-2">
                <span className="text-brand-soft" aria-hidden="true">
                  ✓
                </span>
                {s}
              </li>
            ))}
          </ul>
        </Card>
        {defence.weakSpots.length > 0 && (
          <Card>
            <p className="text-xs font-semibold tracking-[0.16em] text-brand-deep uppercase">Be ready to defend</p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
              {defence.weakSpots.map((w) => (
                <li key={w} className="flex gap-2">
                  <span className="text-brand" aria-hidden="true">
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
    <li className="rounded-2xl border border-line bg-canvas p-6">
      <p className="font-display text-xl leading-snug">
        <span className="font-semibold text-brand">{number}.</span> “{q.question}”
      </p>
      <p className="mt-2 text-sm text-subtle">
        <span className="font-semibold text-ink">What they&apos;re testing:</span> {q.why}
      </p>
      {open ? (
        <div className="mt-4 rounded-2xl bg-success-soft/60 p-4">
          <p className="text-xs font-semibold tracking-[0.14em] text-success uppercase">Model answer</p>
          <p className="mt-1 leading-relaxed">{q.modelAnswer}</p>
          {q.tip && (
            <p className="mt-3 text-sm text-subtle">
              <span className="font-semibold text-ink">Delivery tip:</span> {q.tip}
            </p>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-brand/50">
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
    <Card className="mx-auto max-w-2xl bg-ink p-8 text-center text-canvas sm:p-10">
      <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand text-white">{Icons.shield}</span>
      <h2 className="mt-5 font-display text-3xl font-semibold">Rehearse with a strict examiner</h2>
      <p className="mx-auto mt-3 max-w-md text-canvas/75">
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
      {busy && <p className="mt-3 text-xs text-canvas/60">This takes about 20–40 seconds the first time.</p>}
    </Card>
  );
}
