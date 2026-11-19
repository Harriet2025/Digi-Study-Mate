import { Suspense } from "react";
import MembersOnly from "@/components/auth/MembersOnly";
import RoomsHome from "@/components/social/RoomsHome";
import { LoadingBlock, Page } from "@/components/ui";

export const metadata = { title: "Study rooms · Study Mate" };

export default function RoomsPage() {
  return (
    <MembersOnly>
      <Page>
        <Suspense fallback={<LoadingBlock />}>
          <RoomsHome />
        </Suspense>
      </Page>
    </MembersOnly>
  );
}
