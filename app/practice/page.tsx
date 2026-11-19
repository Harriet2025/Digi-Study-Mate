import MembersOnly from "@/components/auth/MembersOnly";
import PracticeHome from "@/components/practice/PracticeHome";
import { BadgeCheck, Mic, Target } from "lucide-react";
import AppHero from "@/components/app/AppHero";
import { Page } from "@/components/ui";

export const metadata = { title: "Defence practice · Study Mate" };

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string; pageStart?: string; pageEnd?: string }>;
}) {
  const { documentId, pageStart, pageEnd } = await searchParams;
  return (
    <MembersOnly>
      <Page>
        <AppHero
          icon={Mic}
          eyebrow="Defence practice"
          title="Face the toughest questions before the panel does"
          description="Five hard questions from your own material."
          aside={
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { icon: Target, label: "Finds your weak spots" },
                { icon: Mic, label: "Answer aloud or typed" },
                { icon: BadgeCheck, label: "Graded on a rubric" },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 rounded-2xl border border-line bg-canvas/90 p-4 font-medium backdrop-blur">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white" aria-hidden="true">
                    <Icon className="size-5" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          }
        />
        <div className="mt-10">
          <PracticeHome
            initialDocumentId={typeof documentId === "string" ? documentId : undefined}
            initialPageStart={pageStart ? Number(pageStart) : undefined}
            initialPageEnd={pageEnd ? Number(pageEnd) : undefined}
          />
        </div>
      </Page>
    </MembersOnly>
  );
}
