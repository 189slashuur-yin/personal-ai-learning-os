import type { Proposal } from "@/core/entities/proposal";

export interface ProposalStorage {
  save(proposal: Proposal): void;
  saveFromMessages(proposal: Proposal): void;
  saveCurrent(proposal: Proposal): void;
  getCurrent(): Proposal | null;
  getAll(): Proposal[];
  getById(id: string): Proposal | null;
  getBySourceId(sourceId: string): Proposal | null;
  getByConversationId(conversationId: string): Proposal[];
  removeBySourceIds(sourceIds: string[]): void;
  removeByConversationId(conversationId: string): void;
}
