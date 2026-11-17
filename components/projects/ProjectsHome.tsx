"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, timeAgo, type ProjectSummary } from "@/lib/api";
import { Button, Card, ChoiceGroup, ErrorNote, LoadingBlock, Pill, Spinner } from "@/components/ui";

const SLIDE_COUNTS = [
  { value: 8, label: "8 slides", hint: "Short talk" },
  { value: 10, label: "10 slides", hint: "Standard" },
  { value: 12, label: "12 slides", hint: "Detailed" },
  { value: 15, label: "15 slides", hint: "In-depth" },
];
const DURATIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
];

export default function ProjectsHome() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your projects."));
  }, []);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.15fr_1fr]">
      <NewProjectForm />
      <section>
        <h2 className="font-display text-2xl font-semibold">Your projects</h2>
        {error && (
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        {!projects && !error && <LoadingBlock />}
        {projects && projects.length === 0 && (
          <p className="mt-3 text-subtle">No projects yet. Your presentations will appear here, ready to download and practise.</p>
        )}
        {projects && projects.length > 0 && (
          <ul className="mt-4 space-y-3">
            {projects.map((p) => (
              <li key={p.projectId}>
                <Link
                  href={`/projects/${p.projectId}`}
                  className="flex items-center gap-4 rounded-2xl border border-line bg-canvas p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <span className="">
                    PPTX
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg font-semibold">{p.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-subtle">
                      {p.course && <span className="truncate">{p.course}</span>}
                      {p.status === "ready" ? (
                        <span>
                          {p.slideCount} slides · {timeAgo(p.createdAt)}
                        </span>
                      ) : p.status === "failed" ? (
                        <Pill tone="warning">Failed</Pill>
                      ) : (
                        <Pill tone="brand">{p.stageLabel}…</Pill>
                      )}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-brand">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewProjectForm() {
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

  return (
    <Card className="h-fit p-7 sm:p-8">
      <form onSubmit={submit} className="space-y-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-deep uppercase">New project</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">What do you need to present?</h2>
        </div>

        <div>
          <span className="mb-2 block text-sm font-semibold">Assignment brief or requirements</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files[0]);
            }}
            className="flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-line bg-muted/40 px-5 py-5 text-left transition hover:border-brand/50"
          >
            <span className="" aria-hidden="true">
              ⬆
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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField id="title" label="Presentation title" value={title} onChange={setTitle} placeholder="e.g. Smart library system" />
          <TextField id="course" label="Course (optional)" value={course} onChange={setCourse} placeholder="e.g. BCP 202 Database Design" />
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
            placeholder="Your topic and angle, what you've built or found, the marking criteria, your group members' parts…"
            className="w-full resize-y rounded-2xl border border-line bg-white px-4 py-3 focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none"
          />
        </div>

        <ChoiceGroup label="Number of slides" value={slideCount} onChange={setSlideCount} options={SLIDE_COUNTS} />
        <ChoiceGroup label="Speaking time" value={duration} onChange={setDuration} options={DURATIONS} />

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" disabled={submitting} className="w-full py-3.5 text-base">
          {submitting ? <Spinner className="size-4" /> : <span aria-hidden="true">✨</span>}
          {submitting ? "Starting…" : "Create my presentation and defense pack"}
        </Button>
        <p className="text-center text-xs text-subtle">
          You&apos;ll get a designed .pptx with speaker notes, a presenter script, likely questions with model answers, and practice with an examiner.
        </p>
      </form>
    </Card>
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
