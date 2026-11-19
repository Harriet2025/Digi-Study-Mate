import MembersOnly from "@/components/auth/MembersOnly";
import ExamsHome from "@/components/exams/ExamsHome";
import { Page } from "@/components/ui";

export const metadata = { title: "Exams · Study Mate" };

export default function ExamsPage() {
  return (
    <MembersOnly>
      <Page>
        <ExamsHome />
      </Page>
    </MembersOnly>
  );
}
