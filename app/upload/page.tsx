import UploadFlow from "@/components/upload/UploadFlow";
import { Page, PageHeader } from "@/components/ui";

export const metadata = { title: "New lesson · Study Mate" };

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ documentId?: string }> }) {
  const { documentId } = await searchParams;
  return (
    <Page narrow>
      <PageHeader
        eyebrow="New lesson"
        title="Turn your notes into a lesson"
        description="Upload slides or notes, choose which pages to cover, and Alex & Sam will talk you through them."
      />
      <div className="mt-10">
        <UploadFlow initialDocumentId={typeof documentId === "string" ? documentId : undefined} />
      </div>
    </Page>
  );
}
