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
        description="PDF or PowerPoint. We'll take you through it step by step."
      />
      <div className="mt-8">
        <UploadFlow initialDocumentId={typeof documentId === "string" ? documentId : undefined} />
      </div>
    </Page>
  );
}
