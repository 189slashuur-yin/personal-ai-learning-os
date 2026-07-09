import type { Conversation } from "@/core/entities/conversation";

export interface ConversationStorage {
  save(conversation: Conversation): void;
  getAll(): Conversation[];
  getById(id: string): Conversation | null;
  remove(id: string): void;
  /** Remove multiple conversations in a single operation. */
  removeMany(ids: string[]): void;
}
