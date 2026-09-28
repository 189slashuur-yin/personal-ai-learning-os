import type { Conversation } from "@/core/entities/conversation";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { KnowledgeReuseAuditItem } from "@/core/entities/knowledge-context-ref";
import { makeKnowledgeReuseAudit, selection, sourceStatus, validateKnowledgeRefs } from "@/core/services/knowledge-context-service";
import { readAll, drainPendingWritesOrThrow } from "./indexeddb/database";
import { createConversationStorage, createKnowledgeCardStorage, getStorageMode } from "./storage-factory";

/** Reads canonical records immediately before each run, including retries. */
export async function resolveAnalyzerKnowledgeContext(
  conversationId: string | undefined,
  excludedKnowledgeCardIds: string[] = [],
): Promise<KnowledgeReuseAuditItem[]> {
  if (!conversationId) return [];
  let conversation: Conversation | null;
  let cards: KnowledgeCard[];
  if (getStorageMode() === "indexedDB") {
    await drainPendingWritesOrThrow();
    conversation = (await readAll<Conversation>("conversations")).find((item) => item.id === conversationId) ?? null;
    cards = await readAll<KnowledgeCard>("knowledge-cards");
  } else {
    conversation = createConversationStorage().getById(conversationId);
    cards = createKnowledgeCardStorage().getAll();
  }
  if (!conversation) throw new Error("Conversation is unavailable; Analyzer input was not started.");
  const refs = selection(conversation.knowledgeContextRefs);
  if (!validateKnowledgeRefs(refs)) throw new Error("Referenced Knowledge is invalid; review the selection before analyzing.");
  const excluded = new Set(excludedKnowledgeCardIds);
  const effective = refs.filter((ref) => !excluded.has(ref.knowledgeCardId))
    .map((ref, order) => ({ ...ref, order }));
  const byId = new Map(cards.map((card) => [card.id, card]));
  const statuses = new Map(effective.map((ref) => [
    ref.knowledgeCardId, sourceStatus(ref, byId.get(ref.knowledgeCardId) ?? null),
  ] as const));
  return makeKnowledgeReuseAudit(effective, statuses);
}
