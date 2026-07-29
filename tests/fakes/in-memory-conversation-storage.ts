import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { Conversation } from "@/core/entities/conversation";

export class InMemoryConversationStorage implements ConversationStorage {
  private store = new Map<string, Conversation>();

  save(conversation: Conversation): void {
    this.store.set(conversation.id, { ...conversation });
  }

  getAll(): Conversation[] {
    return [...this.store.values()];
  }

  getById(id: string): Conversation | null {
    return this.store.get(id) ?? null;
  }

  remove(id: string): void {
    this.store.delete(id);
  }

  removeMany(ids: string[]): void {
    for (const id of ids) {
      this.store.delete(id);
    }
  }

  clear(): void {
    this.store.clear();
  }
}
