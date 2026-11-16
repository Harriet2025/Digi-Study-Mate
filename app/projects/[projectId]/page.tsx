import ProjectView from "@/components/projects/ProjectView";
import { Page } from "@/components/ui";

export const metadata = { title: "Project · Study Mate" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <Page>
      <ProjectView projectId={projectId} />
    </Page>
  );
}
