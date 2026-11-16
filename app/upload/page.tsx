import UploadFlow from "@/components/upload/UploadFlow";
import { Page, PageHeader } from "@/components/ui";

export const metadata = { title: "New lesson · Study Mate" };

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ documentId?: string }> }) {
  const { documentId } = await searchParams;
  return (
    <Page narrow>
      <PageHeader
        eyebrow="New lesson"
        title="Turn your notes into a study space"
        description="Upload your slides or notes and we'll take you through them step by step, with diagrams, a tutor to answer your questions, flashcards, a rated quiz and extra resources."
      />
      <div className="mt-10">
        <UploadFlow initialDocumentId={typeof documentId === "string" ? documentId : undefined} />
      </div>
    </Page>
  );
}
