import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import { getConversationVersionCache, setConversationVersionCache } from "./preload";
import { deleteWhere, persistInBackground, writeOne } from "./database";

function isConversationVersion(value: unknown): value is ConversationVersion {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ConversationVersion>;
  return (
    typeof v.id === "string" &&
    typeof v.conversationId === "string" &&
    typeof v.name === "string" &&
    typeof v.description === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.sourceVersion === "number" &&
    typeof v.messageCount === "number" &&
    Boolean(v.snapshotData?.conversation) &&
    Array.isArray(v.snapshotData?.messages)
  );
}

export class IndexedDBConversationVersionStorage
  implements ConversationVersionStorage
{
  save(version: ConversationVersion): void {
    const cache = getConversationVersionCache();
    if (cache.some((v) => v.id === version.id)) return;
    cache.push(version);
    persistInBackground(
      "save conversation version",
      writeOne("conversation-versions", version),
    );
  }

  getAll(): ConversationVersion[] {
    const cache = getConversationVersionCache();
    return cache
      .filter(isConversationVersion)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getByConversationId(conversationId: string): ConversationVersion[] {
    return this.getAll().filter((v) => v.conversationId === conversationId);
  }

  removeByConversationId(conversationId: string): void {
    setConversationVersionCache(
      getConversationVersionCache().filter(
        (v) => v.conversationId !== conversationId,
      ),
    );
    persistInBackground(
      "remove conversation versions by conversation",
      deleteWhere<ConversationVersion>(
        "conversation-versions",
        (version) => version.conversationId === conversationId,
      ),
    );
  }
}
