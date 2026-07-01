import { ConversationDetail } from "./conversation-detail";

type ConversationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ConversationDetailPage({
  params,
}: ConversationDetailPageProps) {
  const { id } = await params;

  return <ConversationDetail conversationId={id} />;
}
