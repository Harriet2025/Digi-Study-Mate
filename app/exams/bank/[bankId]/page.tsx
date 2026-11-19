import MembersOnly from "@/components/auth/MembersOnly";
import BankView from "@/components/exams/BankView";
import { Page } from "@/components/ui";

export const metadata = { title: "Past papers · Study Mate" };

export default async function BankPage({ params }: { params: Promise<{ bankId: string }> }) {
  const { bankId } = await params;
  return (
    <MembersOnly>
      <Page>
        <BankView bankId={bankId} />
      </Page>
    </MembersOnly>
  );
}
