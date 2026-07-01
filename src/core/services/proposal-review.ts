import type { Proposal } from "@/core/entities/proposal";

export function acceptProposal(proposal: Proposal): Proposal {
  return {
    ...proposal,
    status: "Accepted",
  };
}
