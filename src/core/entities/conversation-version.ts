import type { Conversation } from "@/core/entities/conversation";
import type { Message } from "@/core/entities/message";

export type ConversationSnapshotData = {
  conversation: Conversation;
  messages: Message[];
};

export type ConversationVersion = {
  id: string;
  conversationId: string;
  name: string;
  description: string;
  createdAt: string;
  sourceVersion: number;
  messageCount: number;
  snapshotData: ConversationSnapshotData;
};
