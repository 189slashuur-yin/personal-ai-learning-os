import type { Proposal } from "@/core/entities/proposal";

export interface ProposalStorage {
  save(proposal: Proposal): void;
  saveCurrent(proposal: Proposal): void;
  getCurrent(): Proposal | null;
  getAll(): Proposal[];
  getById(id: string): Proposal | null;
  getBySourceId(sourceId: string): Proposal | null;
  removeBySourceIds(sourceIds: string[]): void;
}
