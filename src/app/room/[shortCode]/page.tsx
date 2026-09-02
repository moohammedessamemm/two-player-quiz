import RoomClient from "./RoomClient";

export default async function RoomPage({ params }: { params: Promise<{ shortCode: string }> }) {
  const resolvedParams = await params;
  return <RoomClient shortCode={resolvedParams.shortCode} />;
}
