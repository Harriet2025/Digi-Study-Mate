import ProgressView from "@/components/progress/ProgressView";
import { Page, PageHeader } from "@/components/ui";

export const metadata = { title: "Progress · Study Mate" };

export default function ProgressPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Progress"
        title="Your study rhythm"
        description="A little every day beats a lot the night before. Listen for a minute, review a few cards or answer a practice question to keep your streak going."
      />
      <div className="mt-10">
        <ProgressView />
      </div>
    </Page>
  );
}
