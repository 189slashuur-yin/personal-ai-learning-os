import type { KnowledgeCard } from "@/core/entities/knowledge-card";

export interface KnowledgeCardStorage {
  save(card: KnowledgeCard): void;
  update(card: KnowledgeCard): void;
  getAll(): KnowledgeCard[];
  getFirst(): KnowledgeCard | null;
  getById(id: string): KnowledgeCard | null;
  getByProposalId(proposalId: string): KnowledgeCard | null;
  remove(id: string): void;
  removeByProposalIds(proposalIds: string[]): void;
}
