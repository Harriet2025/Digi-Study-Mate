import ProjectsHome from "@/components/projects/ProjectsHome";
import { Page, PageHeader } from "@/components/ui";

export const metadata = { title: "Projects · Study Mate" };

export default function ProjectsPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Projects & presentations"
        title="From assignment brief to confident defense"
        description="Upload your presentation requirements. We'll design the PowerPoint, write what to say on every slide, and coach you on the questions your lecturer is likely to ask."
      />
      <div className="mt-10">
        <ProjectsHome />
      </div>
    </Page>
  );
}
