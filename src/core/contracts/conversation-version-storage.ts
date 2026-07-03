import type { ConversationVersion } from "@/core/entities/conversation-version";

export interface ConversationVersionStorage {
  save(version: ConversationVersion): void;
  getAll(): ConversationVersion[];
  getByConversationId(conversationId: string): ConversationVersion[];
  removeByConversationId(conversationId: string): void;
}
