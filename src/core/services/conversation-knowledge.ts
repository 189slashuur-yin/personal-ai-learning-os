import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";

export function listConversationKnowledge(
  conversationId: string,
  cards: readonly KnowledgeCard[],
  proposals: readonly Proposal[],
): KnowledgeCard[] {
  const proposalOwners = new Map<string, string | undefined>();
  for (const proposal of proposals) {
    if (proposalOwners.has(proposal.id)) proposalOwners.set(proposal.id, undefined);
    else proposalOwners.set(proposal.id, proposal.conversationId);
  }

  return cards
    .filter((card) =>
      card.sourceConversationId === conversationId ||
      (!card.sourceConversationId && proposalOwners.get(card.proposalId) === conversationId),
    )
    .filter((card, index, all) => all.findIndex((candidate) => candidate.id === card.id) === index)
    .sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
    );
}
