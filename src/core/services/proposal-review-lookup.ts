import type { Proposal } from "@/core/entities/proposal";

export type ProposalReviewLookup =
  | { status: "ready"; proposal: Proposal }
  | { status: "missing-proposal" };

export function resolveProposalReviewLookup(
  proposal: Proposal | null,
): ProposalReviewLookup {
  return proposal
    ? { status: "ready", proposal }
    : { status: "missing-proposal" };
}
