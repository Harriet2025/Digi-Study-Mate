import MembersOnly from "@/components/auth/MembersOnly";
import ProjectsHome from "@/components/projects/ProjectsHome";
import { Page } from "@/components/ui";

export const metadata = { title: "Projects · Study Mate" };

export default function ProjectsPage() {
  return (
    <MembersOnly>
      <Page>
        <ProjectsHome />
      </Page>
    </MembersOnly>
  );
}
