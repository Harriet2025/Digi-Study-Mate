import PracticeHome from "@/components/practice/PracticeHome";
import { Page, PageHeader } from "@/components/ui";

export const metadata = { title: "Defence practice · Study Mate" };

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string; pageStart?: string; pageEnd?: string }>;
}) {
  const { documentId, pageStart, pageEnd } = await searchParams;
  return (
    <Page>
      <PageHeader
        eyebrow="Exam & defence practice"
        title="Face the toughest questions before the panel does"
        description="Study Mate reads your material like a strict examiner, finds the weak spots, and asks you five hard questions. Answer by typing or speaking and get graded against a marking rubric."
      />
      <div className="mt-10">
        <PracticeHome
          initialDocumentId={typeof documentId === "string" ? documentId : undefined}
          initialPageStart={pageStart ? Number(pageStart) : undefined}
          initialPageEnd={pageEnd ? Number(pageEnd) : undefined}
        />
      </div>
    </Page>
  );
}
