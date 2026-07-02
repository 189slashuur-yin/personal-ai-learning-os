import type { Proposal } from "@/core/entities/proposal";

export function acceptProposal(proposal: Proposal): Proposal {
  return {
    ...proposal,
    status: "Accepted",
  };
}

export function rejectProposal(proposal: Proposal): Proposal {
  return {
    ...proposal,
    status: "Rejected",
  };
}

export function applyProposal(proposal: Proposal): Proposal {
  return {
    ...proposal,
    status: "Applied",
  };
}
