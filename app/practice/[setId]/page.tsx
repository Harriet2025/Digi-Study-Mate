import MembersOnly from "@/components/auth/MembersOnly";
import PracticeSession from "@/components/practice/PracticeSession";
import { Page } from "@/components/ui";

export const metadata = { title: "Practice session · Study Mate" };

export default async function PracticeSetPage({
  params,
  searchParams,
}: {
  params: Promise<{ setId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { setId } = await params;
  const { q } = await searchParams;
  return (
    <MembersOnly>
      <Page>
        <PracticeSession setId={setId} initialQuestionId={typeof q === "string" ? q : undefined} />
      </Page>
    </MembersOnly>
  );
}
