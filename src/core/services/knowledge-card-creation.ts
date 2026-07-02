import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";

export function createKnowledgeCard(
  proposal: Proposal,
): KnowledgeCard | null {
  if (proposal.status !== "Accepted") {
    return null;
  }

  const timestamp = new Date().toISOString();

  return {
    id: `knowledge-card-${proposal.id}`,
    proposalId: proposal.id,
    title: proposal.title,
    content: proposal.summary,
    summary: proposal.summary,
    sourceFile: proposal.sourceEvidence.sourceName,
    sourceId: proposal.sourceId,
    sourceConversationId: proposal.conversationId,
    sourceMessageIds: proposal.sourceMessageIds,
    sourceMessageCount: proposal.sourceMessageIds?.length,
    sourceEvidenceExcerpt: proposal.sourceEvidence.excerpt,
    providerName: proposal.providerName,
    providerCapabilitySnapshot: proposal.providerCapabilities
      ? [...proposal.providerCapabilities]
      : undefined,
    generatedAt: proposal.generatedAt,
    analysisMode: proposal.analysisMode,
    tagIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "Active",
  };
}
