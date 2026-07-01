import type { Conversation } from "@/core/entities/conversation";

export interface ConversationStorage {
  save(conversation: Conversation): void;
  getAll(): Conversation[];
  getById(id: string): Conversation | null;
  remove(id: string): void;
}
