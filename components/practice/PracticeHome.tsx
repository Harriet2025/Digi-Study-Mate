"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, timeAgo, type LibraryData, type QuestionSetSummary } from "@/lib/api";
import { Button, Card, EmptyState, ErrorNote, Icons, LinkButton, LoadingBlock, Pill, Spinner } from "@/components/ui";

const SUGGESTED_PAGES = 10;

export default function PracticeHome({
  initialDocumentId,
  initialPageStart,
  initialPageEnd,
}: {
  initialDocumentId?: string;
  initialPageStart?: number;
  initialPageEnd?: number;
}) {
  const [library, setLibrary] = useState<LibraryData | null>(null);
  const [sets, setSets] = useState<QuestionSetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.library(), api.practiceSets()])
      .then(([lib, s]) => {
        setLibrary(lib);
        setSets(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your practice sets."));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!library || !sets) return <LoadingBlock />;

  if (library.documents.length === 0) {
    return (
      <EmptyState icon={Icons.shield} title="Upload something to practise on" action={<LinkButton href="/upload">Upload notes</LinkButton>}>
        Practice questions are made from your own slides or notes, so start by uploading them.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <NewSetForm
        documents={library.documents}
        initialDocumentId={initialDocumentId}
        initialPageStart={initialPageStart}
        initialPageEnd={initialPageEnd}
      />

      <section>
        <h2 className="font-serif text-2xl font-semibold">Your practice sets</h2>
        {sets.length === 0 ? (
          <p className="mt-3 text-stone">None yet. Create your first set and you&apos;ll find it here.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sets.map((s) => (
              <li key={s.setId}>
                <Link
                  href={`/practice/${s.setId}`}
                  className="flex items-center gap-4 rounded-3xl border border-sand bg-cream p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <ScoreBadge score={s.averageBest} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-lg font-semibold">{s.title ?? "Practice set"}</span>
                    <span className="text-sm text-stone">
                      {s.answeredCount} of {s.questionCount} answered · {timeAgo(s.createdAt)}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-terracotta">
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

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-cream-deep text-xs font-semibold text-stone">New</span>;
  }
  const tone = score >= 85 ? "bg-sage text-white" : score >= 65 ? "bg-sage-soft text-sage" : score >= 40 ? "bg-terracotta-soft text-terracotta-deep" : "bg-terracotta text-white";
  return <span className={`grid size-14 shrink-0 place-items-center rounded-2xl font-serif text-xl font-semibold ${tone}`}>{score}</span>;
}

function NewSetForm({
  documents,
  initialDocumentId,
  initialPageStart,
  initialPageEnd,
}: {
  documents: LibraryData["documents"];
  initialDocumentId?: string;
  initialPageStart?: number;
  initialPageEnd?: number;
}) {
  const router = useRouter();
  const startDoc = documents.find((d) => d.documentId === initialDocumentId) ?? documents[0]!;
  const [documentId, setDocumentId] = useState(startDoc.documentId);
  const doc = documents.find((d) => d.documentId === documentId) ?? startDoc;
  const [pageStart, setPageStart] = useState(initialPageStart ?? 1);
  const [pageEnd, setPageEnd] = useState(initialPageEnd ?? Math.min(doc.pageCount, SUGGESTED_PAGES));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unit = doc.sourceType === "pptx" ? "slide" : "page";
  const valid = pageStart >= 1 && pageEnd >= pageStart && pageEnd <= doc.pageCount;

  const changeDoc = (id: string) => {
    const next = documents.find((d) => d.documentId === id)!;
    setDocumentId(id);
    setPageStart(1);
    setPageEnd(Math.min(next.pageCount, SUGGESTED_PAGES));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const set = await api.createPracticeSet({ documentId, pageStart, pageEnd });
      router.push(`/practice/${set.setId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the questions. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Card className="h-fit bg-charcoal p-7 text-cream sm:p-8">
      <form onSubmit={submit} className="space-y-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-terracotta-soft uppercase">New practice set</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold">Generate 5 panel questions</h2>
        </div>

        <div>
          <label htmlFor="doc" className="mb-2 block text-sm font-semibold">
            Material
          </label>
          <select
            id="doc"
            value={documentId}
            onChange={(e) => changeDoc(e.target.value)}
            className="w-full rounded-2xl border border-cream/20 bg-cream/10 px-4 py-3 text-cream [&>option]:text-charcoal"
          >
            {documents.map((d) => (
              <option key={d.documentId} value={d.documentId}>
                {d.filename}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">
            {unit[0]!.toUpperCase() + unit.slice(1)}s to examine (of {doc.pageCount})
          </legend>
          <div className="flex items-center gap-3">
            <input
              type="number"
              aria-label={`From ${unit}`}
              value={pageStart}
              min={1}
              max={doc.pageCount}
              onChange={(e) => setPageStart(Number(e.target.value) || 0)}
              className="w-24 rounded-2xl border border-cream/20 bg-cream/10 px-4 py-3 text-center tabular-nums"
            />
            <span className="text-cream/60">to</span>
            <input
              type="number"
              aria-label={`To ${unit}`}
              value={pageEnd}
              min={pageStart}
              max={doc.pageCount}
              onChange={(e) => setPageEnd(Number(e.target.value) || 0)}
              className="w-24 rounded-2xl border border-cream/20 bg-cream/10 px-4 py-3 text-center tabular-nums"
            />
          </div>
          {!valid && <p className="mt-2 text-sm text-terracotta-soft">Choose a range between 1 and {doc.pageCount}.</p>}
          {valid && pageEnd - pageStart + 1 > SUGGESTED_PAGES && (
            <p className="mt-2 text-sm text-cream/70">Tip: about {SUGGESTED_PAGES} {unit}s at a time works best on the free AI plan.</p>
          )}
        </fieldset>

        {error && <p className="rounded-2xl bg-terracotta/30 px-4 py-3 text-sm">{error}</p>}

        <Button type="submit" disabled={submitting || !valid} className="w-full py-3 text-base">
          {submitting ? <Spinner className="size-4" /> : Icons.shield}
          {submitting ? "The panel is reading your material…" : "Generate questions"}
        </Button>
        {submitting && <p className="text-center text-xs text-cream/60">This takes about 20–40 seconds.</p>}
        <ul className="space-y-1.5 border-t border-cream/10 pt-5 text-sm text-cream/70">
          <li>
            <Pill tone="glass">1</Pill> Questions target logical gaps, missing evidence and unexplained terms
          </li>
          <li>
            <Pill tone="glass">2</Pill> Answer by typing or recording yourself
          </li>
          <li>
            <Pill tone="glass">3</Pill> See what you covered, what you missed, and a model outline
          </li>
        </ul>
      </form>
    </Card>
  );
}
