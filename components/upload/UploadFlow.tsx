"use client";

import { BookOpenText, Gift, Layers, type LucideIcon, MessageCircleQuestion, Network, PlayCircle, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  LANGUAGE_OPTIONS,
  LEVEL_OPTIONS,
  STYLE_OPTIONS,
  uploadDocument,
  type LessonLanguage,
  type LessonLevel,
  type LessonStyle,
  type UploadedDocument,
} from "@/lib/api";
import { Button, Card, ChoiceGroup, ErrorNote, Icons, LoadingBlock, ProgressBar, Spinner } from "@/components/ui";
import { ensureSession } from "@/lib/auth";

const MAX_BYTES = 25 * 1024 * 1024;
/** Groq's free tier handles roughly 10 pages per request. */
const SUGGESTED_PAGES = 10;
const LENGTHS = [
  { value: 3, label: "3 min", hint: "Quick listen" },
  { value: 5, label: "5 min", hint: "One topic" },
  { value: 10, label: "10 min", hint: "A section" },
  { value: 15, label: "15 min", hint: "Go deeper" },
];

type Step = "pick" | "uploading" | "configure";

export default function UploadFlow({ initialDocumentId }: { initialDocumentId?: string }) {
  const [step, setStep] = useState<Step>(initialDocumentId ? "configure" : "pick");
  const [doc, setDoc] = useState<UploadedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadFraction, setUploadFraction] = useState(0);
  const [fileName, setFileName] = useState("");
  const [isGuest, setIsGuest] = useState(false);

  // Coming from the library with an existing document.
  useEffect(() => {
    if (!initialDocumentId) return;
    api
      .document(initialDocumentId)
      .then(setDoc)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "That document couldn't be loaded.");
        setStep("pick");
      });
  }, [initialDocumentId]);

  const startUpload = async (file: File) => {
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "pptx") {
      setError(ext === "ppt" ? "Old .ppt files aren't supported. Save the deck as .pptx and try again." : "Choose a PDF or PowerPoint (.pptx) file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That file is larger than 25 MB. Try splitting it or exporting fewer slides.");
      return;
    }
    setFileName(file.name);
    setUploadFraction(0);
    setStep("uploading");
    try {
      // No account yet? Start a free trial so they can see their lesson before signing up.
      const me = await ensureSession();
      setIsGuest(me.isGuest);
      const uploaded = await uploadDocument(file, setUploadFraction);
      setDoc(uploaded);
      setStep("configure");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed. Please try again.");
      setStep("pick");
    }
  };

  return (
    <div className="space-y-6">
      <Stepper current={step === "configure" ? 2 : 1} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {step === "pick" && <DropZone onFile={startUpload} />}
      {step === "uploading" && <UploadingCard fileName={fileName} fraction={uploadFraction} />}
      {step === "configure" &&
        (doc ? (
          <LessonForm
            doc={doc}
            isGuest={isGuest}
            onChangeFile={() => {
              setDoc(null);
              setStep("pick");
            }}
          />
        ) : (
          <LoadingBlock label="Loading your document…" />
        ))}
    </div>
  );
}

function Stepper({ current }: { current: 1 | 2 }) {
  const steps = ["Upload", "Set up your lesson", "Study"];
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${
                state === "done" ? "bg-success text-white" : state === "current" ? "bg-brand text-white" : "bg-muted text-subtle"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={state === "todo" ? "text-subtle" : "font-medium"}>{label}</span>
            {n < steps.length && <span className="mx-1 h-px w-6 bg-line sm:w-10" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={`relative flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition ${
        dragging ? "border-brand bg-brand-soft/40" : "border-line bg-muted/40 hover:border-brand/50"
      }`}
    >
      <div className="grid size-16 place-items-center rounded-2xl bg-brand text-white shadow-md shadow-brand/25">{Icons.upload}</div>
      <h2 className="mt-5 font-display text-2xl font-semibold">Drop your slides or notes here</h2>
      <p className="mt-2 text-subtle">PDF or PowerPoint (.pptx), up to 25 MB</p>
      <Button className="mt-6" onClick={() => inputRef.current?.click()}>
        Choose a file
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-subtle">
        <li>✓ Headers, footers and page numbers removed</li>
        <li>✓ Tables and speaker notes kept</li>
        <li>✓ Scanned PDFs need OCR first</li>
      </ul>
    </div>
  );
}

function UploadingCard({ fileName, fraction }: { fileName: string; fraction: number }) {
  const sent = fraction >= 1;
  return (
    <Card className="py-10 text-center">
      <Spinner className="mx-auto size-8 text-brand" />
      <p className="mt-4 font-display text-xl font-semibold">{sent ? "Reading your document…" : "Uploading…"}</p>
      <p className="mt-1 text-sm text-subtle">{fileName}</p>
      <ProgressBar value={sent ? 100 : fraction * 100} className="mx-auto mt-6 max-w-sm" />
      {sent && <p className="mt-3 text-xs text-subtle">Pulling out the text and cleaning it up. This takes a few seconds.</p>}
    </Card>
  );
}

function LessonForm({ doc, isGuest, onChangeFile }: { doc: UploadedDocument; isGuest: boolean; onChangeFile: () => void }) {
  const router = useRouter();
  const unit = doc.sourceType === "pptx" ? "slide" : "page";
  const [title, setTitle] = useState(doc.filename.replace(/\.(pdf|pptx)$/i, ""));
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(Math.min(doc.pageCount, SUGGESTED_PAGES));
  const [minutes, setMinutes] = useState(5);
  const [style, setStyle] = useState<LessonStyle>("standard");
  const [level, setLevel] = useState<LessonLevel>("intermediate");
  const [language, setLanguage] = useState<LessonLanguage>("en");
  const [withAudio, setWithAudio] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageCount = Math.max(0, pageEnd - pageStart + 1);
  const rangeValid = pageStart >= 1 && pageEnd >= pageStart && pageEnd <= doc.pageCount;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangeValid) return;
    setSubmitting(true);
    setError(null);
    try {
      const guide = await api.createGuide({
        documentId: doc.documentId,
        pageStart,
        pageEnd,
        title: title.trim() || undefined,
        level,
        language,
      });
      if (withAudio) {
        // The audio version is made alongside and appears in the study space's Listen tab.
        await api
          .createEpisode({
            documentId: doc.documentId,
            pageStart,
            pageEnd,
            targetMinutes: minutes,
            title: title.trim() || undefined,
            style,
            level,
            language,
            guideId: guide.guideId,
          })
          .catch(() => undefined); // the study space still works without it
      }
      router.push(`/study/${guide.guideId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the lesson. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-sm font-bold text-brand-deep uppercase">
          {doc.sourceType}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{doc.filename}</p>
          <p className="text-sm text-subtle">
            {doc.pageCount} {unit}s ready
          </p>
        </div>
        <Button variant="ghost" onClick={onChangeFile}>
          Change file
        </Button>
      </Card>

      <Card className="space-y-7">
        <div>
          <label htmlFor="title" className="mb-2 block text-sm font-semibold">
            Lesson title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Which {unit}s should this lesson cover?</legend>
          <div className="flex flex-wrap items-center gap-3">
            <NumberField label={`From ${unit}`} value={pageStart} min={1} max={doc.pageCount} onChange={setPageStart} />
            <span className="text-subtle" aria-hidden="true">to</span>
            <NumberField label={`To ${unit}`} value={pageEnd} min={pageStart} max={doc.pageCount} onChange={setPageEnd} />
            <span className="text-sm text-subtle">
              of {doc.pageCount} · <span className="font-medium text-ink">{pageCount} {unit}{pageCount === 1 ? "" : "s"}</span>
            </span>
          </div>
          {!rangeValid && <p className="mt-2 text-sm text-brand-deep">Choose a range between 1 and {doc.pageCount}.</p>}
          {rangeValid && pageCount > SUGGESTED_PAGES && (
            <p className="mt-2 text-sm text-subtle">
              Tip: about {SUGGESTED_PAGES} {unit}s per lesson works best on the free AI plan. Longer ranges may be too much in one go.
            </p>
          )}
        </fieldset>

        <ChoiceGroup label="Your level" value={level} onChange={setLevel} options={LEVEL_OPTIONS} columns={3} />

        <div>
          <label htmlFor="language" className="mb-2 block text-sm font-semibold">
            Language
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as LessonLanguage)}
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 sm:w-64"
          >
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-subtle">Your lesson can be in another language, even if your notes are in English.</p>
        </div>
      </Card>

      <Card className="space-y-5 bg-muted/50">
        <p className="text-sm font-semibold">You&apos;ll get</p>
        <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {[
            [BookOpenText, "A step-by-step lesson in simple language"],
            [Network, "Diagrams, analogies and worked examples"],
            [MessageCircleQuestion, "A tutor to answer your questions"],
            [Layers, "Flashcards with spaced repetition"],
            [Trophy, "A final quiz that rates you"],
            [PlayCircle, "Videos and reading to go further"],
          ].map(([Icon, text]) => {
            const I = Icon as LucideIcon;
            return (
              <li key={text as string} className="flex items-center gap-2">
                <I className="size-4 shrink-0 text-brand" aria-hidden="true" />
                {text as string}
              </li>
            );
          })}
        </ul>
        {isGuest ? (
          <p className="flex items-start gap-3 rounded-2xl border border-line bg-canvas px-4 py-3 text-sm text-subtle">
            <Gift className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            <span>
              <span className="font-semibold text-ink">Free trial:</span> your first lesson covers up to 15 {unit}s. Create a free
              account afterwards to keep it and unlock audio lessons, projects and defence practice.
            </span>
          </p>
        ) : (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-canvas px-4 py-3">
          <input type="checkbox" checked={withAudio} onChange={(e) => setWithAudio(e.target.checked)} className="mt-1 size-4 accent-brand" />
          <span>
            <span className="block font-semibold">Also make an audio version with Alex &amp; Sam</span>
            <span className="block text-sm text-subtle">A podcast-style lesson for listening on the go. Uses ElevenLabs voice credit.</span>
          </span>
        </label>
        )}
        {withAudio && (
          <div className="space-y-5">
            <ChoiceGroup label="Audio length" value={minutes} onChange={setMinutes} options={LENGTHS} />
            <ChoiceGroup label="Audio style" value={style} onChange={setStyle} options={STYLE_OPTIONS} />
          </div>
        )}
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          hidden={isGuest}
          href={`/practice?documentId=${doc.documentId}&pageStart=${pageStart}&pageEnd=${pageEnd}`}
          className="text-center text-sm font-medium text-brand-deep underline-offset-4 hover:underline"
        >
          Practise defence questions on these {unit}s instead
        </Link>
        <Button type="submit" disabled={submitting || !rangeValid} className="px-7 py-3 text-base">
          {submitting ? <Spinner className="size-4" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {submitting ? "Starting…" : "Create my study space"}
        </Button>
      </div>
    </form>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-24 rounded-2xl border border-line bg-white px-4 py-3 text-center tabular-nums focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none"
      />
    </label>
  );
}
