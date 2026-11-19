"use client";

import { ArrowRight, BarChart3, ClipboardCheck, FileStack, FileUp, Plus, Sparkles, Target, Timer, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AppHero from "@/components/app/AppHero";
import { RevealGroup } from "@/components/motion/Gsap";
import { api, ApiError, timeAgo, type BankSummary, type GuideSummary, type MockSummary } from "@/lib/api";
import { Button, ErrorNote, LoadingBlock, ProgressBar, Spinner } from "@/components/ui";

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FileUp, title: "Upload past papers", body: "As many years as you have." },
  { icon: BarChart3, title: "See the patterns", body: "Topics that keep coming up, and what's likely next." },
  { icon: Timer, title: "Sit a mock", body: "Timed, no hints, then a breakdown by topic." },
];

export default function ExamsHome() {
  const [banks, setBanks] = useState<BankSummary[] | null>(null);
  const [mocks, setMocks] = useState<MockSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([api.banks(), api.mocks()])
      .then(([b, m]) => {
        setBanks(b);
        setMocks(m);
        if (b.length === 0) setFormOpen(true);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your exams."));
  }, []);

  const openForm = () => {
    setFormOpen(true);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="space-y-12">
      <AppHero
        icon={ClipboardCheck}
        eyebrow="Exam focus"
        title="Walk in knowing what's coming"
        description="Upload past papers to find the topics that keep coming up, see likely questions, and sit timed mock exams."
        actions={
          <Button onClick={openForm}>
            <Plus className="size-4" aria-hidden="true" /> Add past papers
          </Button>
        }
        aside={
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex items-center gap-4 rounded-2xl border border-line bg-canvas/90 p-4 backdrop-blur">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white" aria-hidden="true">
                  <s.icon className="size-5" />
                </span>
                <span>
                  <span className="block font-semibold">
                    {i + 1}. {s.title}
                  </span>
                  <span className="block text-sm text-subtle">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}
      {!banks && !error && <LoadingBlock label="Loading your exams…" />}

      {banks && (
        <section>
          <Heading icon={FileStack} title="Past-paper banks" count={banks.length} />
          <RevealGroup className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {banks.map((b) => (
              <div data-reveal key={b.bankId}>
                <BankCard bank={b} />
              </div>
            ))}
            {!formOpen && (
              <div data-reveal>
                <button
                  type="button"
                  onClick={openForm}
                  className="group flex h-full min-h-48 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line text-subtle transition hover:border-brand/40 hover:bg-canvas hover:text-ink"
                >
                  <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand transition group-hover:scale-110">
                    <Plus className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-semibold">Add a course&apos;s past papers</span>
                </button>
              </div>
            )}
          </RevealGroup>
        </section>
      )}

      {formOpen && (
        <div ref={formRef} className="scroll-mt-24">
          <NewBankForm onClose={banks && banks.length > 0 ? () => setFormOpen(false) : undefined} />
        </div>
      )}

      {mocks && mocks.length > 0 && (
        <section>
          <Heading icon={Timer} title="Recent mock exams" count={mocks.length} />
          <RevealGroup className="mt-6 space-y-3">
            {mocks.slice(0, 8).map((m) => (
              <Link
                data-reveal
                key={m.mockId}
                href={`/exams/mock/${m.mockId}`}
                className="group flex items-center gap-4 rounded-2xl border border-line bg-canvas p-4 transition hover:border-brand/30 hover:shadow-md"
              >
                <ScoreBadge mock={m} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.title}</span>
                  <span className="text-xs text-subtle">
                    {m.mode === "exam" ? "Timed mock" : "Practice test"} · {m.questionCount} questions · {timeAgo(m.submittedAt ?? m.createdAt)}
                  </span>
                </span>
                <ArrowRight className="size-4 text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden="true" />
              </Link>
            ))}
          </RevealGroup>
        </section>
      )}
    </div>
  );
}

function Heading({ icon: Icon, title, count }: { icon: LucideIcon; title: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight">
      <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
        <Icon className="size-4.5" />
      </span>
      {title}
      {count !== undefined && count > 0 && <span className="rounded-full bg-muted px-2.5 py-0.5 font-sans text-sm font-medium text-subtle">{count}</span>}
    </h2>
  );
}

export function ScoreBadge({ mock }: { mock: MockSummary }) {
  if (mock.status === "submitted" && mock.percent !== null) {
    return (
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-xl text-sm font-bold ${
          mock.percent >= 70 ? "bg-success-soft text-success" : mock.percent >= 50 ? "bg-brand-soft text-brand-deep" : "bg-muted text-ink"
        }`}
      >
        {mock.percent}%
      </span>
    );
  }
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-subtle">
      {mock.status === "queued" || mock.status === "processing" ? <Spinner className="size-4" /> : <Timer className="size-5" aria-hidden="true" />}
    </span>
  );
}

function BankCard({ bank: b }: { bank: BankSummary }) {
  const building = b.status === "queued" || b.status === "processing";
  return (
    <Link
      href={`/exams/bank/${b.bankId}`}
      className="group flex h-full flex-col rounded-2xl border border-line bg-canvas p-5 transition hover:-translate-y-1 hover:border-brand/30 hover:shadow-xl hover:shadow-ink/5"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-ink text-canvas" aria-hidden="true">
          <FileStack className="size-5" />
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-subtle">
          {b.paperCount} paper{b.paperCount === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-4 font-display text-xl font-bold">{b.course}</p>
      {building ? (
        <div className="mt-3">
          <p className="flex items-center gap-2 text-sm text-brand">
            <Spinner className="size-3.5" /> {b.stageLabel}…
          </p>
          <ProgressBar value={b.progress} className="mt-2 h-1.5" />
        </div>
      ) : b.status === "failed" ? (
        <p className="mt-2 text-sm text-brand-deep">{b.error ?? "Couldn't be analysed."}</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {b.topTopics.map((t) => (
            <li key={t} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-deep">
              {t}
            </li>
          ))}
        </ul>
      )}
      <span className="mt-auto flex items-center gap-1 pt-5 text-sm font-medium text-brand">
        {building ? "Analysing" : `${b.topicCount} topics · predictions`}
        <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden="true" />
      </span>
    </Link>
  );
}

function NewBankForm({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [course, setCourse] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [guides, setGuides] = useState<GuideSummary[]>([]);
  const [linked, setLinked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .library()
      .then((lib) => setGuides(lib.documents.flatMap((d) => d.guides.filter((g) => g.status === "ready"))))
      .catch(() => setGuides([]));
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok = [...list].filter((f) => /\.(pdf|docx|pptx|txt|md)$/i.test(f.name) && f.size <= 25 * 1024 * 1024);
    if (ok.length < list.length) setError("Some files were skipped: use PDF, Word, PowerPoint or text files under 25 MB.");
    setFiles((prev) => [...prev, ...ok].slice(0, 8));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course.trim()) return setError("Name the course, e.g. BIO 201.");
    if (files.length === 0) return setError("Add at least one past paper.");
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("course", course.trim());
    form.append("guideIds", linked.join(","));
    files.forEach((f) => form.append("papers", f));
    try {
      const bank = await api.createBank(form);
      router.push(`/exams/bank/${bank.bankId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload those papers.");
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-canvas">
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5 sm:px-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">New past-paper bank</p>
          <h2 className="mt-1 font-display text-2xl font-bold">Which course are you preparing for?</h2>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full text-subtle hover:bg-muted hover:text-ink">
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>
      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5 p-6 sm:p-8">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Course</span>
            <input
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              maxLength={200}
              placeholder="e.g. BIO 201 Cell Biology"
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none"
            />
          </label>
          <div>
            <span className="mb-2 block text-sm font-semibold">Past papers</span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
              className="flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-line bg-page px-5 py-6 text-left transition hover:border-brand/50"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white" aria-hidden="true">
                <FileUp className="size-5" />
              </span>
              <span>
                <span className="block font-medium">Drop or choose up to 8 papers</span>
                <span className="text-sm text-subtle">PDF, Word, PowerPoint or text. Typed papers work best; scans aren&apos;t supported yet.</span>
              </span>
            </button>
            <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md" className="sr-only" onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {files.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-full bg-muted py-1 pr-1.5 pl-3 text-sm">
                    <span className="max-w-48 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      aria-label={`Remove ${f.name}`}
                      className="grid size-6 place-items-center rounded-full hover:bg-line"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5 border-t border-line bg-page/70 p-6 sm:p-8 lg:border-t-0 lg:border-l">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Target className="size-4 text-brand" aria-hidden="true" /> Sharpen the predictions
            </p>
            <p className="mt-1 text-sm text-subtle">Link this course&apos;s study spaces (optional). Topics in your slides that haven&apos;t been examined lately are flagged too.</p>
            {guides.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-subtle">No study spaces yet.</p>
            ) : (
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                {guides.map((g) => (
                  <li key={g.guideId}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm hover:border-brand/30">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-brand"
                        checked={linked.includes(g.guideId)}
                        onChange={(e) => setLinked(e.target.checked ? [...linked, g.guideId].slice(0, 5) : linked.filter((x) => x !== g.guideId))}
                      />
                      <span className="line-clamp-2">{g.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-auto space-y-3">
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={busy} className="w-full py-3.5 text-base">
              {busy ? <Spinner className="size-4" /> : <Sparkles className="size-4" aria-hidden="true" />}
              {busy ? "Uploading…" : "Find the patterns"}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
