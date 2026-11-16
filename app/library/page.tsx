import LibraryView from "@/components/library/LibraryView";
import { Icons, LinkButton, Page, PageHeader } from "@/components/ui";

export const metadata = { title: "My library · Study Mate" };

export default function LibraryPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="My library"
        title="Everything you're studying"
        description="Your uploaded notes, the lessons made from them, and your practice sets."
        actions={
          <LinkButton href="/upload">
            {Icons.upload}
            Upload notes
          </LinkButton>
        }
      />
      <div className="mt-10">
        <LibraryView />
      </div>
    </Page>
  );
}
