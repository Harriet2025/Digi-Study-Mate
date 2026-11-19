import MembersOnly from "@/components/auth/MembersOnly";
import ProgressView from "@/components/progress/ProgressView";
import { Page } from "@/components/ui";

export const metadata = { title: "Progress · Study Mate" };

export default function ProgressPage() {
  return (
    <MembersOnly>
      <Page>
        <ProgressView />
      </Page>
    </MembersOnly>
  );
}
