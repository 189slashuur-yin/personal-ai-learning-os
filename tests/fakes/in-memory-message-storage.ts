import type { MessageStorage } from "@/core/contracts/message-storage";
import type { Message } from "@/core/entities/message";

export class InMemoryMessageStorage implements MessageStorage {
  private store = new Map<string, Message>();

  save(message: Message): void {
    this.store.set(message.id, { ...message });
  }

  saveMany(messages: Message[]): void {
    for (const message of messages) {
      this.store.set(message.id, { ...message });
    }
  }

  getAll(): Message[] {
    return [...this.store.values()];
  }

  getByConversationId(conversationId: string): Message[] {
    return [...this.store.values()]
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.order - b.order);
  }

  removeByConversationId(conversationId: string): void {
    for (const [id, message] of this.store) {
      if (message.conversationId === conversationId) {
        this.store.delete(id);
      }
    }
  }

  replaceByConversationId(conversationId: string, messages: Message[]): void {
    this.removeByConversationId(conversationId);
    this.saveMany(messages);
  }

  clear(): void {
    this.store.clear();
  }
}
