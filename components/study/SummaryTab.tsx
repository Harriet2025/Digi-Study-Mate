"use client";

import DownloadButton from "@/components/DownloadButton";
import { AlertTriangle, FileText, Lightbulb, ListChecks, Printer, Timer, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type GuideDetail, type SummarySheet } from "@/lib/api";
import { Button, ErrorNote, Spinner } from "@/components/ui";

/** The one-page revision sheet: read it here, print it, or download it as a PDF. */
export default function SummaryTab({ guide }: { guide: GuideDetail }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SummarySheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // The first visit starts writing the sheet on the server; check back every few seconds.
  const load = useCallback(() => {
    setError(null);
    let stop = false;
    let timer = 0;
    const check = async () => {
      try {
        const res = await api.summary(guide.guideId);
        if (stop) return;
        if (res.status === "ready") setSheet(res);
        else timer = window.setTimeout(check, 3000);
      } catch (err) {
        if (!stop) setError(err instanceof ApiError ? err.message : "Couldn't make your summary sheet.");
      }
    };
    check();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [guide.guideId]);
  useEffect(load, [load]);

  const startMock = async () => {
    setStarting(true);
    try {
      const mock = await api.createMock({ guideId: guide.guideId, mode: "exam", questionCount: 10, durationMinutes: 20 });
      router.push(`/exams/mock/${mock.mockId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start a mock exam.");
      setStarting(false);
    }
  };

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!sheet) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center text-subtle" role="status">
        <Spinner className="size-6 text-brand" />
        <p>Writing your one-page revision sheet…</p>
        <p className="text-sm">This takes about 20 seconds the first time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-subtle">Everything that matters from this lesson, on one page.</p>
        <div className="flex flex-wrap gap-2">
          <DownloadButton
            url={api.summaryPdfUrl(guide.guideId)}
            filename={`${guide.title} - revision sheet.pdf`}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-deep disabled:opacity-70"
          >
            Download PDF
          </DownloadButton>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" /> Print
          </Button>
          <Button variant="dark" onClick={startMock} disabled={starting}>
            {starting ? <Spinner className="size-4" /> : <Timer className="size-4" aria-hidden="true" />} Timed mock exam
          </Button>
        </div>
      </div>

      {/* The sheet itself (also what prints) */}
      <article className="summary-sheet mx-auto max-w-4xl overflow-hidden rounded-2xl border border-line bg-white shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <header className="border-t-[6px] border-brand px-6 pt-5 pb-4 sm:px-8">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-brand uppercase">Revision sheet</p>
          <h2 className="mt-1 font-display text-2xl font-bold">{sheet.title}</h2>
          {sheet.pages && <p className="text-sm text-subtle">{sheet.pages}</p>}
        </header>
        <div className="grid grid-cols-1 gap-x-8 px-6 pb-7 sm:px-8 md:grid-cols-2 print:grid-cols-2">
          <div>
            <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm">
              <span className="font-semibold">Big idea.</span> {sheet.bigIdea}
            </p>
            {sheet.sections.map((s) => (
              <section key={s.heading} className="mt-4 break-inside-avoid">
                <h3 className="text-sm font-bold">{s.heading}</h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink/90">
                  {s.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div>
            {sheet.keyTerms.length > 0 && (
              <Block icon={FileText} title="Key terms">
                <dl className="space-y-1 text-sm">
                  {sheet.keyTerms.map((t) => (
                    <div key={t.term}>
                      <dt className="inline font-semibold">{t.term}: </dt>
                      <dd className="inline text-ink/90">{t.definition}</dd>
                    </div>
                  ))}
                </dl>
              </Block>
            )}
            {sheet.rules.length > 0 && (
              <Block icon={Lightbulb} title="Remember">
                <List items={sheet.rules} />
              </Block>
            )}
            {sheet.mistakes.length > 0 && (
              <Block icon={AlertTriangle} title="Common mistakes">
                <List items={sheet.mistakes} />
              </Block>
            )}
            {sheet.quickCheck.length > 0 && (
              <Block icon={ListChecks} title="Quick check">
                <ol className="space-y-1.5 text-sm">
                  {sheet.quickCheck.map((q) => (
                    <li key={q.question}>
                      <p className="font-medium">{q.question}</p>
                      <p className="text-subtle">{q.answer}</p>
                    </li>
                  ))}
                </ol>
              </Block>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}

function Block({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 break-inside-avoid first:mt-0 md:first:mt-0">
      <h3 className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-brand uppercase">
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
      </h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink/90">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}
