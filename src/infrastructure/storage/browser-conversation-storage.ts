import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { Conversation } from "@/core/entities/conversation";
import { DEFAULT_WORKSPACE_ID } from "@/core/entities/workspace";

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

  getAll(): Conversation[] {
    const storedConversations = window.localStorage.getItem(CONVERSATIONS_KEY);

    if (!storedConversations) {
      return [];
    }

    return (JSON.parse(storedConversations) as Conversation[])
      .map((conversation) => ({
        ...conversation,
        workspaceId: conversation.workspaceId ?? DEFAULT_WORKSPACE_ID,
        lastOpenedAt: conversation.lastOpenedAt ?? conversation.updatedAt,
      }))
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      );
  }

  getById(id: string): Conversation | null {
    return this.getAll().find((conversation) => conversation.id === id) ?? null;
  }

  remove(id: string) {
    const conversations = this.getAll().filter(
      (conversation) => conversation.id !== id,
    );
    window.localStorage.setItem(
      CONVERSATIONS_KEY,
      JSON.stringify(conversations),
    );
  }
}
