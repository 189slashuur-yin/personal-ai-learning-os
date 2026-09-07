import { ConversationDetail } from "./conversation-detail";

type ConversationDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imported?: string; message?: string | string[] }>;
};

export default async function ConversationDetailPage({
  params,
  searchParams,
}: ConversationDetailPageProps) {
  const { id } = await params;
  const { imported, message } = await searchParams;

  return (
    <ConversationDetail
      key={id}
      conversationId={id}
      requestedMessageId={typeof message === "string" ? message : message ? "" : null}
      importedFromClipboard={imported === "clipboard"}
    />
  );
}
