import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { Conversation } from "@/core/entities/conversation";
import { DEFAULT_WORKSPACE_ID } from "@/core/entities/workspace";
import { getConversationCache, setConversationCache } from "./preload";
import { deleteOne, persistInBackground, writeOne } from "./database";

function normalize(conversation: Conversation): Conversation {
  return {
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
  };
}

export class IndexedDBConversationStorage implements ConversationStorage {
  save(conversation: Conversation): void {
    const normalized = normalize(conversation);
    const cache = getConversationCache();
    const existingIndex = cache.findIndex((c) => c.id === normalized.id);
    if (existingIndex >= 0) {
      cache[existingIndex] = normalized;
    } else {
      cache.push(normalized);
    }
    persistInBackground(
      "save conversation",
      writeOne("conversations", normalized),
    );
  }

  getAll(): Conversation[] {
    return getConversationCache()
      .map(normalize)
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      );
  }

  getById(id: string): Conversation | null {
    return this.getAll().find((c) => c.id === id) ?? null;
  }

  remove(id: string): void {
    const cache = getConversationCache();
    setConversationCache(cache.filter((c) => c.id !== id));
    persistInBackground(
      "remove conversation",
      deleteOne("conversations", id),
    );
  }
}
