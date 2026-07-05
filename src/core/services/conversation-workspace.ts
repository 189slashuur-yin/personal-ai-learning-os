import type { AnalyzerRunStorage } from "@/core/contracts/analyzer-run-storage";
import type { AssetStorage } from "@/core/contracts/asset-storage";
import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { SourceStorage } from "@/core/contracts/source-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { Conversation } from "@/core/entities/conversation";
import { AssetService } from "@/core/services/asset-service";

export type ConversationWorkspaceStorages = {
  conversations: ConversationStorage;
  sources: SourceStorage;
  proposals: ProposalStorage;
  knowledgeCards: KnowledgeCardStorage;
  messages: MessageStorage;
  analyzerRuns?: AnalyzerRunStorage;
  versions?: ConversationVersionStorage;
  assets?: AssetStorage;
  rounds?: RoundStorage;
};

function runAssetLifecycle(
  storage: AssetStorage | undefined,
  operation: (service: AssetService) => void,
): void {
  if (!storage) return;

  try {
    operation(new AssetService(storage));
  } catch {
    // Asset metadata is best-effort for legacy/corrupt optional storage and
    // must not prevent the canonical Conversation operation from completing.
  }
}

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
  storages.rounds?.removeByConversationId(conversationId);
  storages.analyzerRuns?.removeByConversationId(conversationId);
  storages.versions?.removeByConversationId(conversationId);
  runAssetLifecycle(storages.assets, (service) => {
    service.removeForEntity("conversation", conversationId);
  });
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

  const roundIdMap = new Map<string, string>();
  const duplicatedRounds = storages.rounds
    ?.getByConversationId(conversationId)
    .map((round) => {
      const duplicatedRoundId = crypto.randomUUID();
      roundIdMap.set(round.id, duplicatedRoundId);
      return {
        ...round,
        id: duplicatedRoundId,
        conversationId: duplicatedConversation.id,
        messageIds: round.messageIds.flatMap((messageId) => {
          const duplicatedMessageId = messageIdMap.get(messageId);
          return duplicatedMessageId ? [duplicatedMessageId] : [];
        }),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
  if (duplicatedRounds) storages.rounds?.saveMany(duplicatedRounds);

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
      sourceRoundId: proposal.sourceRoundId
        ? roundIdMap.get(proposal.sourceRoundId)
        : undefined,
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
      sourceRoundId: card.sourceRoundId
        ? roundIdMap.get(card.sourceRoundId)
        : undefined,
      createdAt: timestamp,
    });
  });

  runAssetLifecycle(storages.assets, (service) => {
    service.duplicateForEntity(
      "conversation",
      conversationId,
      duplicatedConversation.id,
    );
  });

  return duplicatedConversation;
}
