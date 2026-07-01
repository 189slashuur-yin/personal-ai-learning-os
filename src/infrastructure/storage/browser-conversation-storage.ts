import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { Conversation } from "@/core/entities/conversation";

const CONVERSATIONS_KEY = "ai-learning-os.conversations";

export class BrowserConversationStorage implements ConversationStorage {
  save(conversation: Conversation) {
    const conversations = this.getAll();
    const existingIndex = conversations.findIndex(
      (storedConversation) => storedConversation.id === conversation.id,
    );

    if (existingIndex >= 0) {
      conversations[existingIndex] = conversation;
    } else {
      conversations.push(conversation);
    }

    window.localStorage.setItem(
      CONVERSATIONS_KEY,
      JSON.stringify(conversations),
    );
  }

  getAll() {
    const storedConversations = window.localStorage.getItem(CONVERSATIONS_KEY);

    if (!storedConversations) {
      return [];
    }

    return (JSON.parse(storedConversations) as Conversation[]).sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  }

  getById(id: string) {
    return this.getAll().find((conversation) => conversation.id === id) ?? null;
  }
}
