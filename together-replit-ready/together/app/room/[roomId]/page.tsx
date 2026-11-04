import TogetherApp from "@/components/TogetherApp";

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <TogetherApp initialRoomId={roomId} />;
}
