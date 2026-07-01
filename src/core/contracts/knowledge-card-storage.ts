import type { KnowledgeCard } from "@/core/entities/knowledge-card";

export interface KnowledgeCardStorage {
  save(card: KnowledgeCard): void;
  getFirst(): KnowledgeCard | null;
}
