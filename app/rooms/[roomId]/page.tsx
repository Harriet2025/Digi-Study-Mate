import MembersOnly from "@/components/auth/MembersOnly";
import RoomView from "@/components/social/RoomView";
import { Page } from "@/components/ui";

export const metadata = { title: "Study room · Study Mate" };

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return (
    <MembersOnly>
      <Page>
        <RoomView roomId={roomId} />
      </Page>
    </MembersOnly>
  );
}
