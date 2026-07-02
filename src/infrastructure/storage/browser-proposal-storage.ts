import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { Proposal } from "@/core/entities/proposal";

const CURRENT_PROPOSAL_KEY = "ai-learning-os.current-proposal";
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
    window.localStorage.setItem(CURRENT_PROPOSAL_KEY, JSON.stringify(proposal));
  }

  getCurrent() {
    const storedProposal = window.localStorage.getItem(CURRENT_PROPOSAL_KEY);

    if (!storedProposal) {
      return null;
    }

    return JSON.parse(storedProposal) as Proposal;
  }

  getAll() {
    const storedProposals = window.localStorage.getItem(PROPOSALS_KEY);
    const proposals = storedProposals
      ? (JSON.parse(storedProposals) as Proposal[])
      : [];
    const currentProposal = this.getCurrent();

    if (
      currentProposal &&
      !proposals.some((proposal) => proposal.id === currentProposal.id)
    ) {
      return [...proposals, currentProposal];
    }

    return proposals;
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
      window.localStorage.removeItem(CURRENT_PROPOSAL_KEY);
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
      window.localStorage.removeItem(CURRENT_PROPOSAL_KEY);
    }
  }

  removeByConversationId(conversationId: string) {
    const proposals = this.getAll().filter(
      (proposal) => proposal.conversationId !== conversationId,
    );
    this.write(proposals);

    const currentProposal = this.getCurrent();
    if (currentProposal?.conversationId === conversationId) {
      window.localStorage.removeItem(CURRENT_PROPOSAL_KEY);
    }
  }

  private write(proposals: Proposal[]) {
    window.localStorage.setItem(PROPOSALS_KEY, JSON.stringify(proposals));
  }
}
