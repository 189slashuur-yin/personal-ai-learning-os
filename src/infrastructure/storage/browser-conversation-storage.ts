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
        order: Number.isFinite(conversation.order) ? conversation.order : undefined,
        note: typeof conversation.note === "string" ? conversation.note : undefined,
        lastOpenedAt: conversation.lastOpenedAt ?? conversation.updatedAt,
        summary: conversation.summary?.trim() || undefined,
        conclusion: conversation.conclusion?.trim() || undefined,
        pendingQuestions: conversation.pendingQuestions?.trim() || undefined,
        externalSource:
          conversation.externalSource === "chatgpt"
            ? ("chatgpt" as const)
            : undefined,
        externalConversationId:
          conversation.externalConversationId?.trim() || undefined,
        importedAt: conversation.importedAt || undefined,
        lastExternalUpdateTime:
          conversation.lastExternalUpdateTime || undefined,
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

  removeMany(ids: string[]): void {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const conversations = this.getAll().filter(
      (conversation) => !idSet.has(conversation.id),
    );
    window.localStorage.setItem(
      CONVERSATIONS_KEY,
      JSON.stringify(conversations),
    );
  }
}
