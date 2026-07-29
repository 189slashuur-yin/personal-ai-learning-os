import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import { getKnowledgeCardCache, setKnowledgeCardCache } from "./preload";
import { deleteOne, deleteWhere, persistInBackground, writeOne } from "./database";

function normalize(card: KnowledgeCard): KnowledgeCard {
  return {
    ...card,
    summary: card.summary ?? card.content ?? "",
    tagIds: card.tagIds ?? [],
    updatedAt: card.updatedAt ?? card.createdAt,
    status: card.status === "Archived" ? "Archived" : "Active",
    previousContentSnapshots: Array.isArray(card.previousContentSnapshots)
      ? card.previousContentSnapshots
      : [],
  };
}

export class IndexedDBKnowledgeCardStorage implements KnowledgeCardStorage {
  save(card: KnowledgeCard): void {
    const cache = getKnowledgeCardCache();
    if (cache.some((c) => c.proposalId === card.proposalId)) return;
    cache.push(card);
    persistInBackground("save knowledge card", writeOne("knowledge-cards", card));
  }

  update(card: KnowledgeCard): void {
    const cache = getKnowledgeCardCache();
    const idx = cache.findIndex((c) => c.id === card.id);
    if (idx === -1) return;
    cache[idx] = card;
    persistInBackground("update knowledge card", writeOne("knowledge-cards", card));
  }

  getAll(): KnowledgeCard[] {
    return getKnowledgeCardCache().map(normalize);
  }

  getFirst(): KnowledgeCard | null {
    return this.getAll()[0] ?? null;
  }

  getById(id: string): KnowledgeCard | null {
    return this.getAll().find((c) => c.id === id) ?? null;
  }

  getByProposalId(proposalId: string): KnowledgeCard | null {
    return this.getAll().find((c) => c.proposalId === proposalId) ?? null;
  }

  remove(id: string): void {
    setKnowledgeCardCache(getKnowledgeCardCache().filter((c) => c.id !== id));
    persistInBackground("remove knowledge card", deleteOne("knowledge-cards", id));
  }

  removeByProposalIds(proposalIds: string[]): void {
    const idSet = new Set(proposalIds);
    setKnowledgeCardCache(
      getKnowledgeCardCache().filter((c) => !idSet.has(c.proposalId)),
    );
    persistInBackground(
      "remove knowledge cards by proposal ids",
      deleteWhere<KnowledgeCard>(
        "knowledge-cards",
        (card) => idSet.has(card.proposalId),
      ),
    );
  }
}
