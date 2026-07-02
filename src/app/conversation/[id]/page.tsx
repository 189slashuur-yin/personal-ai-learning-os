import { ConversationDetail } from "./conversation-detail";

type ConversationDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imported?: string }>;
};

export default async function ConversationDetailPage({
  params,
  searchParams,
}: ConversationDetailPageProps) {
  const { id } = await params;
  const { imported } = await searchParams;

  return (
    <ConversationDetail
      conversationId={id}
      importedFromClipboard={imported === "clipboard"}
    />
  );
}
