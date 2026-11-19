import MembersOnly from "@/components/auth/MembersOnly";
import MockExamView from "@/components/exams/MockExamView";
import { Page } from "@/components/ui";

export const metadata = { title: "Mock exam · Study Mate" };

export default async function MockPage({ params }: { params: Promise<{ mockId: string }> }) {
  const { mockId } = await params;
  return (
    <MembersOnly>
      <Page>
        <MockExamView mockId={mockId} />
      </Page>
    </MembersOnly>
  );
}
