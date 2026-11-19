import MembersOnly from "@/components/auth/MembersOnly";
import LibraryView from "@/components/library/LibraryView";
import { Page } from "@/components/ui";

export const metadata = { title: "My library · Study Mate" };

export default function LibraryPage() {
  return (
    <MembersOnly>
      <Page>
        <LibraryView />
      </Page>
    </MembersOnly>
  );
}
