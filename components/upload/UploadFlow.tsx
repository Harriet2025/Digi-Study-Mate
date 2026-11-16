"use client";

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
      const uploaded = await uploadDocument(file, setUploadFraction);
      setDoc(uploaded);
      setStep("configure");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The upload failed. Please try again.");
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
  const steps = ["Upload", "Choose your lesson", "Listen"];
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${
                state === "done" ? "bg-sage text-white" : state === "current" ? "bg-terracotta text-white" : "bg-cream-deep text-stone"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={state === "todo" ? "text-stone" : "font-medium"}>{label}</span>
            {n < steps.length && <span className="mx-1 h-px w-6 bg-sand sm:w-10" aria-hidden="true" />}
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
      className={`relative flex flex-col items-center rounded-[2rem] border-2 border-dashed px-6 py-16 text-center transition ${
        dragging ? "border-terracotta bg-terracotta-soft/40" : "border-sand bg-cream-deep/40 hover:border-terracotta/50"
      }`}
    >
      <div className="grid size-16 place-items-center rounded-2xl bg-terracotta text-white shadow-md shadow-terracotta/25">{Icons.upload}</div>
      <h2 className="mt-5 font-serif text-2xl font-semibold">Drop your slides or notes here</h2>
      <p className="mt-2 text-stone">PDF or PowerPoint (.pptx), up to 25 MB</p>
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
      <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-stone">
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
      <Spinner className="mx-auto size-8 text-terracotta" />
      <p className="mt-4 font-serif text-xl font-semibold">{sent ? "Reading your document…" : "Uploading…"}</p>
      <p className="mt-1 text-sm text-stone">{fileName}</p>
      <ProgressBar value={sent ? 100 : fraction * 100} className="mx-auto mt-6 max-w-sm" />
      {sent && <p className="mt-3 text-xs text-stone">Pulling out the text and cleaning it up. This takes a few seconds.</p>}
    </Card>
  );
}

function LessonForm({ doc, onChangeFile }: { doc: UploadedDocument; onChangeFile: () => void }) {
  const router = useRouter();
  const unit = doc.sourceType === "pptx" ? "slide" : "page";
  const [title, setTitle] = useState(doc.filename.replace(/\.(pdf|pptx)$/i, ""));
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(Math.min(doc.pageCount, SUGGESTED_PAGES));
  const [minutes, setMinutes] = useState(5);
  const [style, setStyle] = useState<LessonStyle>("standard");
  const [level, setLevel] = useState<LessonLevel>("intermediate");
  const [language, setLanguage] = useState<LessonLanguage>("en");
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
      const episode = await api.createEpisode({
        documentId: doc.documentId,
        pageStart,
        pageEnd,
        targetMinutes: minutes,
        title: title.trim() || undefined,
        style,
        level,
        language,
      });
      router.push(`/listen/${episode.scriptId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the lesson. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-terracotta-soft text-sm font-bold text-terracotta-deep uppercase">
          {doc.sourceType}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{doc.filename}</p>
          <p className="text-sm text-stone">
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
            className="w-full rounded-2xl border border-sand bg-white px-4 py-3 focus:border-terracotta focus:ring-2 focus:ring-terracotta/30 focus:outline-none"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Which {unit}s should this lesson cover?</legend>
          <div className="flex flex-wrap items-center gap-3">
            <NumberField label={`From ${unit}`} value={pageStart} min={1} max={doc.pageCount} onChange={setPageStart} />
            <span className="text-stone" aria-hidden="true">to</span>
            <NumberField label={`To ${unit}`} value={pageEnd} min={pageStart} max={doc.pageCount} onChange={setPageEnd} />
            <span className="text-sm text-stone">
              of {doc.pageCount} · <span className="font-medium text-charcoal">{pageCount} {unit}{pageCount === 1 ? "" : "s"}</span>
            </span>
          </div>
          {!rangeValid && <p className="mt-2 text-sm text-terracotta-deep">Choose a range between 1 and {doc.pageCount}.</p>}
          {rangeValid && pageCount > SUGGESTED_PAGES && (
            <p className="mt-2 text-sm text-stone">
              Tip: about {SUGGESTED_PAGES} {unit}s per lesson works best on the free AI plan. Longer ranges may be too much in one go.
            </p>
          )}
        </fieldset>

        <ChoiceGroup label="Length" value={minutes} onChange={setMinutes} options={LENGTHS} />
        <ChoiceGroup label="Lesson style" value={style} onChange={setStyle} options={STYLE_OPTIONS} />
        <ChoiceGroup label="Your level" value={level} onChange={setLevel} options={LEVEL_OPTIONS} columns={3} />

        <div>
          <label htmlFor="language" className="mb-2 block text-sm font-semibold">
            Language
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as LessonLanguage)}
            className="w-full rounded-2xl border border-sand bg-white px-4 py-3 sm:w-64"
          >
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-stone">Alex & Sam can teach in another language, even if your notes are in English.</p>
        </div>
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/practice?documentId=${doc.documentId}&pageStart=${pageStart}&pageEnd=${pageEnd}`}
          className="text-center text-sm font-medium text-terracotta-deep underline-offset-4 hover:underline"
        >
          Practise defense questions on these {unit}s instead
        </Link>
        <Button type="submit" disabled={submitting || !rangeValid} className="px-7 py-3 text-base">
          {submitting ? <Spinner className="size-4" /> : Icons.headphones}
          {submitting ? "Starting…" : "Create my lesson"}
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
        className="w-24 rounded-2xl border border-sand bg-white px-4 py-3 text-center tabular-nums focus:border-terracotta focus:ring-2 focus:ring-terracotta/30 focus:outline-none"
      />
    </label>
  );
}
