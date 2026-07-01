import type { Proposal } from "@/core/entities/proposal";

export interface ProposalStorage {
  saveCurrent(proposal: Proposal): void;
  getCurrent(): Proposal | null;
}
