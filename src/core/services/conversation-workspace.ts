import type { AnalyzerRunStorage } from "@/core/contracts/analyzer-run-storage";
import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { SourceStorage } from "@/core/contracts/source-storage";
import type { Conversation } from "@/core/entities/conversation";

export type ConversationWorkspaceStorages = {
  conversations: ConversationStorage;
  sources: SourceStorage;
  proposals: ProposalStorage;
  knowledgeCards: KnowledgeCardStorage;
  messages: MessageStorage;
  analyzerRuns?: AnalyzerRunStorage;
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
    .filter(
      (proposal) =>
        proposal.conversationId === conversationId ||
        (proposal.sourceId ? sourceIds.includes(proposal.sourceId) : false),
    )
    .map((proposal) => proposal.id);

  storages.knowledgeCards.removeByProposalIds(proposalIds);
  storages.proposals.removeBySourceIds(sourceIds);
  storages.proposals.removeByConversationId(conversationId);
  storages.sources.removeByConversationId(conversationId);
  storages.messages.removeByConversationId(conversationId);
  storages.analyzerRuns?.removeByConversationId(conversationId);
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

  const messageIdMap = new Map<string, string>();
  const duplicatedMessages = storages.messages
    .getByConversationId(conversationId)
    .map((message) => {
      const duplicatedMessageId = crypto.randomUUID();
      messageIdMap.set(message.id, duplicatedMessageId);

      return {
        ...message,
        id: duplicatedMessageId,
        conversationId: duplicatedConversation.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
  storages.messages.saveMany(duplicatedMessages);

  const originalSources = storages.sources
    .getAll()
    .filter((source) => source.conversationId === conversationId);

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
    .filter(
      (proposal) =>
        proposal.conversationId === conversationId ||
        (proposal.sourceId ? sourceIdMap.has(proposal.sourceId) : false),
    );

  originalProposals.forEach((proposal) => {
    const duplicatedProposalId = crypto.randomUUID();
    const duplicatedSourceId = proposal.sourceId
      ? sourceIdMap.get(proposal.sourceId)
      : undefined;
    const duplicatedMessageIds = proposal.sourceMessageIds?.flatMap(
      (messageId) => {
        const duplicatedMessageId = messageIdMap.get(messageId);
        return duplicatedMessageId ? [duplicatedMessageId] : [];
      },
    );

    proposalIdMap.set(proposal.id, duplicatedProposalId);
    storages.proposals.save({
      ...proposal,
      id: duplicatedProposalId,
      sourceId: duplicatedSourceId,
      conversationId: duplicatedConversation.id,
      sourceMessageIds: duplicatedMessageIds,
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
