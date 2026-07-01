import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { Proposal } from "@/core/entities/proposal";

const CURRENT_PROPOSAL_KEY = "ai-learning-os.current-proposal";

export class BrowserProposalStorage implements ProposalStorage {
  saveCurrent(proposal: Proposal) {
    window.localStorage.setItem(CURRENT_PROPOSAL_KEY, JSON.stringify(proposal));
  }

  getCurrent() {
    const storedProposal = window.localStorage.getItem(CURRENT_PROPOSAL_KEY);

    if (!storedProposal) {
      return null;
    }

    return JSON.parse(storedProposal) as Proposal;
  }
}
