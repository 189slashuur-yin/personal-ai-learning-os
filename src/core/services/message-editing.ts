import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { Conversation } from "@/core/entities/conversation";
import type { Message } from "@/core/entities/message";

export type MessageEditingStorages = {
  conversations: ConversationStorage;
  messages: MessageStorage;
};

export type MessageEditingResult = {
  conversation: Conversation;
  message: Message;
};

export function editMessage(
  messageId: string,
  content: string,
  storages: MessageEditingStorages,
): MessageEditingResult | null {
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

  storages.messages.save(nextMessage);
  storages.conversations.save(nextConversation);

  return {
    conversation: nextConversation,
    message: nextMessage,
  };
}
