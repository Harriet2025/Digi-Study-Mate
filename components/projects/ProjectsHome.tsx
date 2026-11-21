"use client";

import {
  ArrowRight,
  Clock,
  FileText,
  FileUp,
  Layers,
  type LucideIcon,
  Mic,
  Plus,
  Presentation,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AppHero from "@/components/app/AppHero";
import { RevealGroup } from "@/components/motion/Gsap";
import { api, ApiError, timeAgo, type ProjectSummary } from "@/lib/api";
import { Button, ErrorNote, LoadingBlock, ProgressBar, Spinner } from "@/components/ui";

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FileUp, title: "Share the brief", body: "Upload it or describe the task." },
  { icon: Presentation, title: "Get a draft", body: "Slide structure and speaking notes to adapt." },
  { icon: Mic, title: "Practise", body: "Likely questions, then a strict examiner." },
];

export default function ProjectsHome() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .projects()
      .then((list) => {
        setProjects(list);
        if (list.length === 0) setFormOpen(true);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your projects."));
  }, []);

  const openForm = () => {
    setFormOpen(true);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="space-y-12">
      <AppHero
        icon={Presentation}
        eyebrow="Projects & presentations"
        title="Prepare to present"
        description="A draft to build on, and practice for the questions. The ideas stay yours."
        actions={
          <Button onClick={openForm}>
            <Plus className="size-4" aria-hidden="true" /> New project
          </Button>
        }
        aside={
          <ol className="relative space-y-3">
            <span aria-hidden="true" className="absolute top-6 bottom-6 left-[1.6rem] border-l-2 border-dashed border-line" />
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex items-center gap-3 rounded-2xl border border-line bg-canvas/90 px-4 py-3 backdrop-blur">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white" aria-hidden="true">
                  <s.icon className="size-5" />
                </span>
                <span className="font-semibold">
                  {i + 1}. {s.title}
                </span>
              </li>
            ))}
          </ol>
        }
      />

      <section>
        <h2 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight">
          <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
            <Layers className="size-4.5" />
          </span>
          Your projects
          {projects && projects.length > 0 && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 font-sans text-sm font-medium text-subtle">{projects.length}</span>
          )}
        </h2>
        {error && (
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        {!projects && !error && <LoadingBlock />}
        {projects && (
          <RevealGroup className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div data-reveal key={p.projectId}>
                <ProjectCard project={p} />
              </div>
            ))}
            {!formOpen && (
              <div data-reveal>
                <button
                  type="button"
                  onClick={openForm}
                  className="group flex aspect-[4/3] h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line text-subtle transition hover:border-brand/40 hover:bg-canvas hover:text-ink sm:aspect-auto sm:min-h-64"
                >
                  <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand transition group-hover:scale-110">
                    <Plus className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-semibold">Start a new project</span>
                </button>
              </div>
            )}
          </RevealGroup>
        )}
      </section>

      {formOpen && (
        <div ref={formRef} className="scroll-mt-24">
          <NewProjectForm onClose={projects && projects.length > 0 ? () => setFormOpen(false) : undefined} />
        </div>
      )}
    </div>
  );
}

/** A project shown as its title slide. */
function ProjectCard({ project: p }: { project: ProjectSummary }) {
  const building = p.status === "queued" || p.status === "processing";
  return (
    <Link
      href={`/projects/${p.projectId}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-canvas transition hover:-translate-y-1 hover:border-brand/30 hover:shadow-xl hover:shadow-ink/5"
    >
      <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-ink to-brand-deep p-5 text-white">
        <span aria-hidden="true" className="absolute -right-8 -bottom-10 size-32 rounded-full bg-brand/60 transition duration-500 group-hover:scale-110" />
        <p className="relative truncate text-[10px] font-bold tracking-[0.16em] text-brand-soft uppercase">{p.course || "Presentation"}</p>
        <span aria-hidden="true" className="relative mt-2 block h-1 w-10 bg-brand-soft/80" />
        <p className="relative mt-3 line-clamp-2 font-display text-xl leading-tight font-bold">{p.title}</p>
        {p.status === "failed" && (
          <span className="absolute top-4 right-4 rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-brand-deep">Failed</span>
        )}
      </div>
      <div className="p-4">
        {building ? (
          <>
            <p className="flex items-center gap-2 text-sm font-medium text-brand">
              <Spinner className="size-3.5" /> {p.stageLabel}…
            </p>
            <ProgressBar value={p.progress} className="mt-2 h-1.5" />
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-subtle">
              <span className="inline-flex items-center gap-1">
                <Layers className="size-3.5" aria-hidden="true" /> {p.slideCount} slides
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden="true" /> {p.durationMinutes} min
              </span>
              <span>{timeAgo(p.createdAt)}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-brand transition group-hover:translate-x-1" aria-hidden="true" />
          </div>
        )}
      </div>
    </Link>
  );
}

function NewProjectForm({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [instructions, setInstructions] = useState("");
  const [slideCount, setSlideCount] = useState(10);
  const [duration, setDuration] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "pptx", "txt", "md"].includes(ext ?? "")) {
      setError("Upload the brief as PDF, Word (.docx), PowerPoint (.pptx) or a text file.");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setError("That file is larger than 25 MB.");
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give your presentation a working title.");
      return;
    }
    if (!file && instructions.trim().length < 20) {
      setError("Upload the brief, or describe what the presentation must cover (at least a sentence or two).");
      return;
    }
    setSubmitting(true);
    setError(null);
    const form = new FormData();
    form.append("title", title.trim());
    form.append("course", course.trim());
    form.append("instructions", instructions.trim());
    form.append("slideCount", String(slideCount));
    form.append("durationMinutes", String(duration));
    if (file) form.append("brief", file);
    try {
      const project = await api.createProject(form);
      router.push(`/projects/${project.projectId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start your project. Please try again.");
      setSubmitting(false);
    }
  };

  const perSlide = duration / slideCount;

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-canvas">
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5 sm:px-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">New project</p>
          <h2 className="mt-1 font-display text-2xl font-bold">What do you need to present?</h2>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full text-subtle hover:bg-muted hover:text-ink">
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5 p-6 sm:p-8">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files[0]);
            }}
            className="flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-line bg-page px-5 py-5 text-left transition hover:border-brand/50"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white" aria-hidden="true">
              {file ? <FileText className="size-5" /> : <FileUp className="size-5" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{file ? file.name : "Drop or choose the brief"}</span>
              <span className="text-sm text-subtle">{file ? "Click to change" : "PDF, Word, PowerPoint or text. Optional if you describe it below."}</span>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.pptx,.txt,.md"
            className="sr-only"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField id="title" label="Presentation title" value={title} onChange={setTitle} placeholder="e.g. Smart library system" />
            <TextField id="course" label="Course (optional)" value={course} onChange={setCourse} placeholder="e.g. BCP 202" />
          </div>

          <div>
            <label htmlFor="instructions" className="mb-2 block text-sm font-semibold">
              Anything else we should know? <span className="font-normal text-subtle">(optional with a brief)</span>
            </label>
            <textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              maxLength={12000}
              placeholder="Your topic and angle, the marking criteria, your group members' parts…"
              className="w-full resize-y rounded-2xl border border-line bg-white px-4 py-3 focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none"
            />
          </div>
        </div>

        {/* Talk settings: two sliders instead of rows of buttons */}
        <div className="flex flex-col gap-6 border-t border-line bg-page/70 p-6 sm:p-8 lg:border-t-0 lg:border-l">
          <p className="text-sm font-semibold">Your talk</p>
          <Slider icon={Layers} label="Slides" value={slideCount} min={5} max={20} onChange={setSlideCount} unit="slides" />
          <Slider icon={Clock} label="Speaking time" value={duration} min={3} max={30} onChange={setDuration} unit="min" />
          <p className="rounded-2xl bg-canvas px-4 py-3 text-sm text-subtle">
            About <span className="font-semibold text-ink">{perSlide >= 1 ? `${perSlide.toFixed(1)} min` : `${Math.round(perSlide * 60)} s`}</span> per slide.
            {perSlide < 0.5 && " That's quick; consider fewer slides."}
            {perSlide > 3 && " Plenty of time; you could add slides."}
          </p>

          <div className="mt-auto space-y-3">
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={submitting} className="w-full py-3.5 text-base">
              {submitting ? <Spinner className="size-4" /> : <Sparkles className="size-4" aria-hidden="true" />}
              {submitting ? "Starting…" : "Create my draft and practice pack"}
            </Button>
            <p className="text-center text-xs text-subtle">A draft to edit and make your own. Check your course&apos;s rules on AI help.</p>
          </div>
        </div>
      </form>
    </section>
  );
}

function Slider({
  icon: Icon,
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-subtle">
          <Icon className="size-4 text-brand" aria-hidden="true" />
          {label}
        </span>
        <span className="font-display text-xl font-bold">
          {value} <span className="text-sm font-medium text-subtle">{unit}</span>
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full accent-brand"
        style={{ background: `linear-gradient(to right, var(--color-brand) ${pct}%, var(--color-line) ${pct}%)` }}
      />
      <span className="mt-1 flex justify-between text-xs text-subtle">
        <span>{min}</span>
        <span>{max}</span>
      </span>
    </label>
  );
}

function TextField({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={300}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-line bg-white px-4 py-3 focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none"
      />
    </div>
  );
}
