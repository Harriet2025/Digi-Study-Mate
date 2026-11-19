import MembersOnly from "@/components/auth/MembersOnly";
import BattleView from "@/components/social/BattleView";
import { Page } from "@/components/ui";

export const metadata = { title: "Quiz battle · Study Mate" };

export default async function BattlePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <MembersOnly>
      <Page>
        <BattleView code={code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)} />
      </Page>
    </MembersOnly>
  );
}
