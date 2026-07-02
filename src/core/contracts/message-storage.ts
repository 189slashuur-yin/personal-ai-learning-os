import type { Message } from "@/core/entities/message";

export interface MessageStorage {
  save(message: Message): void;
  saveMany(messages: Message[]): void;
  getAll(): Message[];
  getByConversationId(conversationId: string): Message[];
  removeByConversationId(conversationId: string): void;
  replaceByConversationId(conversationId: string, messages: Message[]): void;
}
