import ProjectsHome from "@/components/projects/ProjectsHome";
import { Page, PageHeader } from "@/components/ui";

export const metadata = { title: "Projects · Study Mate" };

export default function ProjectsPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Projects & presentations"
        title="Prepare to present with confidence"
        description="Upload your presentation brief to get a draft slide structure to build on, speaking notes to adapt, and practice with the questions your lecturer is likely to ask. The work and the ideas stay yours."
      />
      <div className="mt-10">
        <ProjectsHome />
      </div>
    </Page>
  );
}
