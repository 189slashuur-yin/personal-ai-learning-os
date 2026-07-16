import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { Proposal } from "@/core/entities/proposal";
import {
  clearCurrentProposalPointer,
  readCurrentProposalPointer,
  writeCurrentProposalPointer,
} from "@/infrastructure/storage/flow-pointers";

const PROPOSALS_KEY = "ai-learning-os.proposals";

export class BrowserProposalStorage implements ProposalStorage {
  save(proposal: Proposal) {
    const proposals = this.getAll();
    const existingIndex = proposals.findIndex(
      (storedProposal) => storedProposal.id === proposal.id,
    );

    if (existingIndex >= 0) {
      proposals[existingIndex] = proposal;
    } else {
      proposals.push(proposal);
    }

    window.localStorage.setItem(PROPOSALS_KEY, JSON.stringify(proposals));
  }

  saveFromMessages(proposal: Proposal) {
    if (!proposal.conversationId || !proposal.sourceMessageIds?.length) {
      return;
    }

    this.save(proposal);
  }

  saveCurrent(proposal: Proposal) {
    this.save(proposal);
    writeCurrentProposalPointer(proposal);
  }

  getCurrent() {
    const currentProposal = readCurrentProposalPointer();
    if (!currentProposal) return null;
    const canonicalProposal = this.readStoredProposals().find(
      (proposal) => proposal.id === currentProposal.id,
    );
    if (canonicalProposal) return canonicalProposal;
    clearCurrentProposalPointer();
    return null;
  }

  getAll() {
    return this.readStoredProposals();
  }

  private readStoredProposals() {
    const storedProposals = window.localStorage.getItem(PROPOSALS_KEY);
    return storedProposals
      ? (JSON.parse(storedProposals) as Proposal[])
      : [];
  }

  getById(id: string) {
    return this.getAll().find((proposal) => proposal.id === id) ?? null;
  }

  getBySourceId(sourceId: string) {
    return this.getAll().find((proposal) => proposal.sourceId === sourceId) ?? null;
  }

  getByConversationId(conversationId: string) {
    return this.getAll()
      .filter((proposal) => proposal.conversationId === conversationId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  remove(id: string) {
    this.write(this.getAll().filter((proposal) => proposal.id !== id));

    if (this.getCurrent()?.id === id) {
      clearCurrentProposalPointer();
    }
  }

  removeBySourceIds(sourceIds: string[]) {
    const sourceIdSet = new Set(sourceIds);
    const proposals = this.getAll().filter(
      (proposal) =>
        !proposal.sourceId || !sourceIdSet.has(proposal.sourceId),
    );
    this.write(proposals);

    const currentProposal = this.getCurrent();
    if (
      currentProposal?.sourceId &&
      sourceIdSet.has(currentProposal.sourceId)
    ) {
      clearCurrentProposalPointer();
    }
  }

  removeByConversationId(conversationId: string) {
    const proposals = this.getAll().filter(
      (proposal) => proposal.conversationId !== conversationId,
    );
    this.write(proposals);

    const currentProposal = this.getCurrent();
    if (currentProposal?.conversationId === conversationId) {
      clearCurrentProposalPointer();
    }
  }

  private write(proposals: Proposal[]) {
    window.localStorage.setItem(PROPOSALS_KEY, JSON.stringify(proposals));
  }
}
