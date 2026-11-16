import StudySpace from "@/components/study/StudySpace";
import { Page } from "@/components/ui";

export const metadata = { title: "Study space · Study Mate" };

export default async function StudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ guideId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { guideId } = await params;
  const { tab } = await searchParams;
  return (
    <Page>
      <StudySpace guideId={guideId} initialTab={typeof tab === "string" ? tab : undefined} />
    </Page>
  );
}
