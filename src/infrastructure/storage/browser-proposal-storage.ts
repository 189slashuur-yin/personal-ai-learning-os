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

  removeBySourceIds(sourceIds: string[]) {
    const sourceIdSet = new Set(sourceIds);
    const proposals = this.getAll().filter(
      (proposal) => !sourceIdSet.has(proposal.sourceId),
    );
    window.localStorage.setItem(PROPOSALS_KEY, JSON.stringify(proposals));

    const currentProposal = this.getCurrent();
    if (currentProposal && sourceIdSet.has(currentProposal.sourceId)) {
      window.localStorage.removeItem(CURRENT_PROPOSAL_KEY);
    }
  }
}
