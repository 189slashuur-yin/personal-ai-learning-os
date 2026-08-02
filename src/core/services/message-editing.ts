import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { SourceStorage } from "@/core/contracts/source-storage";
import type { Conversation } from "@/core/entities/conversation";
import type { Message } from "@/core/entities/message";
import { executeShareSnapshotTranscriptMutation } from "@/core/services/share-snapshot-mutation-guard";

export type MessageEditingStorages = {
  conversations: ConversationStorage;
  messages: MessageStorage;
  sources: SourceStorage;
};

export type MessageEditingResult = {
  conversation: Conversation;
  message: Message;
};

export async function editMessage(
  messageId: string,
  content: string,
  storages: MessageEditingStorages,
): Promise<MessageEditingResult | null> {
  const nextContent = content.trim();

  if (!nextContent) {
    return null;
  }

  const message = storages.messages
    .getAll()
    .find((item) => item.id === messageId);

  if (!message) {
    return null;
  }

  const conversation = storages.conversations.getById(message.conversationId);

  if (!conversation) {
    return null;
  }

  const timestamp = new Date().toISOString();
  const nextMessage: Message = {
    ...message,
    content: nextContent,
    updatedAt: timestamp,
  };
  const nextConversation: Conversation = {
    ...conversation,
    updatedAt: timestamp,
  };
  const operation = "edit Message";
  await executeShareSnapshotTranscriptMutation(
    storages.sources,
    {
      conversationIds: [conversation.id],
      operation,
      put: {
        conversations: [nextConversation],
        messages: [nextMessage],
      },
    },
    () => {
      storages.messages.save(nextMessage);
      storages.conversations.save(nextConversation);
    },
  );

  return {
    conversation: nextConversation,
    message: nextMessage,
  };
}
