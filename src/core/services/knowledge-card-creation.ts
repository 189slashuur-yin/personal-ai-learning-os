import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";

export function createKnowledgeCard(
  proposal: Proposal,
): KnowledgeCard | null {
  if (proposal.status !== "Accepted") {
    return null;
  }

  return {
    id: `knowledge-card-${proposal.id}`,
    proposalId: proposal.id,
    title: proposal.title,
    content: proposal.summary,
    sourceFile: proposal.sourceEvidence.sourceName,
    sourceId: proposal.sourceId,
    sourceConversationId: proposal.conversationId,
    sourceMessageIds: proposal.sourceMessageIds,
    sourceMessageCount: proposal.sourceMessageIds?.length,
    sourceEvidenceExcerpt: proposal.sourceEvidence.excerpt,
    tagIds: [],
    createdAt: new Date().toISOString(),
    status: "Active",
  };
}
