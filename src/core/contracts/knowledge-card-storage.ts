import type { KnowledgeCard } from "@/core/entities/knowledge-card";

export interface KnowledgeCardStorage {
  save(card: KnowledgeCard): void;
  getAll(): KnowledgeCard[];
  getFirst(): KnowledgeCard | null;
  getByProposalId(proposalId: string): KnowledgeCard | null;
}
