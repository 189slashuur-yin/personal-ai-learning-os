import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { SourceStorage } from "@/core/contracts/source-storage";
import type { Conversation } from "@/core/entities/conversation";

export type ConversationWorkspaceStorages = {
  conversations: ConversationStorage;
  sources: SourceStorage;
  proposals: ProposalStorage;
  knowledgeCards: KnowledgeCardStorage;
};

export function deleteConversationWorkspace(
  conversationId: string,
  storages: ConversationWorkspaceStorages,
) {
  const sourceIds = storages.sources
    .getAll()
    .filter((source) => source.conversationId === conversationId)
    .map((source) => source.id);
  const proposalIds = storages.proposals
    .getAll()
    .filter((proposal) => sourceIds.includes(proposal.sourceId))
    .map((proposal) => proposal.id);

  storages.knowledgeCards.removeByProposalIds(proposalIds);
  storages.proposals.removeBySourceIds(sourceIds);
  storages.sources.removeByConversationId(conversationId);
  storages.conversations.remove(conversationId);
}

export function duplicateConversationWorkspace(
  conversationId: string,
  storages: ConversationWorkspaceStorages,
): Conversation | null {
  const originalConversation = storages.conversations.getById(conversationId);

  if (!originalConversation) {
    return null;
  }

  const timestamp = new Date().toISOString();
  const duplicatedConversation: Conversation = {
    ...originalConversation,
    id: crypto.randomUUID(),
    title: `${originalConversation.title} Copy`,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  };

  storages.conversations.save(duplicatedConversation);

  const originalSources = storages.sources
    .getAll()
    .filter((source) => source.conversationId === conversationId);

  if (originalSources.length === 0) {
    return duplicatedConversation;
  }

  const sourceIdMap = new Map<string, string>();
  originalSources.forEach((source) => {
    const duplicatedSourceId = crypto.randomUUID();
    sourceIdMap.set(source.id, duplicatedSourceId);
    storages.sources.save({
      ...source,
      id: duplicatedSourceId,
      conversationId: duplicatedConversation.id,
      importedAt: timestamp,
      updatedAt: timestamp,
    });
  });

  const proposalIdMap = new Map<string, string>();
  const originalProposals = storages.proposals
    .getAll()
    .filter((proposal) => sourceIdMap.has(proposal.sourceId));

  originalProposals.forEach((proposal) => {
    const duplicatedProposalId = crypto.randomUUID();
    const duplicatedSourceId = sourceIdMap.get(proposal.sourceId);

    if (!duplicatedSourceId) {
      return;
    }

    proposalIdMap.set(proposal.id, duplicatedProposalId);
    storages.proposals.save({
      ...proposal,
      id: duplicatedProposalId,
      sourceId: duplicatedSourceId,
      createdAt: timestamp,
    });
  });

  storages.knowledgeCards.getAll().forEach((card) => {
    const duplicatedProposalId = proposalIdMap.get(card.proposalId);

    if (!duplicatedProposalId) {
      return;
    }

    storages.knowledgeCards.save({
      ...card,
      id: crypto.randomUUID(),
      proposalId: duplicatedProposalId,
      createdAt: timestamp,
    });
  });

  return duplicatedConversation;
}
