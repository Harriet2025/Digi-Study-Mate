import { LoadingBlock, Page } from "@/components/ui";

/** Shown instantly while moving between pages, so taps always respond straight away. */
export default function Loading() {
  return (
    <Page>
      <LoadingBlock />
    </Page>
  );
}
