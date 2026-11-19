import MembersOnly from "@/components/auth/MembersOnly";
import ReviewSession from "@/components/flashcards/ReviewSession";
import { Page } from "@/components/ui";

export const metadata = { title: "Flashcards · Study Mate" };

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<{ episodeId?: string }> }) {
  const { episodeId } = await searchParams;
  return (
    <MembersOnly>
      <Page narrow>
        <ReviewSession episodeId={typeof episodeId === "string" ? episodeId : undefined} />
      </Page>
    </MembersOnly>
  );
}
