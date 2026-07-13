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

export type BatchDeleteResult = {
  deletedConversations: number;
  deletedMessages: number;
  deletedRounds: number;
  deletedSources: number;
  deletedProposals: number;
  orphanedKnowledgeCount: number;
  /** Knowledge cards that were linked to deleted proposals */
  orphanedKnowledgeIds: string[];
};

export function deleteConversationSidecarMetadata(
  conversationIds: string[],
  storages: Pick<ConversationWorkspaceStorages, "analyzerRuns" | "assets">,
): void {
  for (const conversationId of conversationIds) {
    storages.analyzerRuns?.removeByConversationId(conversationId);
    runAssetLifecycle(storages.assets, (service) => {
      service.removeForEntity("conversation", conversationId);
    });
  }
}

export function batchDeleteConversationWorkspace(
  conversationIds: string[],
  storages: ConversationWorkspaceStorages,
): BatchDeleteResult {
  const idSet = new Set(conversationIds);
  let deletedMessages = 0;
  let deletedRounds = 0;
  let deletedSources = 0;
  let deletedProposals = 0;

  // Collect all source IDs for these conversations
  const allSources = storages.sources.getAll();
  const sourceIds: string[] = [];
  for (const source of allSources) {
    if (source.conversationId && idSet.has(source.conversationId)) {
      sourceIds.push(source.id);
    }
  }
  const sourceIdSet = new Set(sourceIds);

  // Collect proposal IDs (by conversationId or sourceId)
  const allProposals = storages.proposals.getAll();
  const proposalIds: string[] = [];
  for (const proposal of allProposals) {
    if (
      (proposal.conversationId && idSet.has(proposal.conversationId)) ||
      (proposal.sourceId && sourceIdSet.has(proposal.sourceId))
    ) {
      proposalIds.push(proposal.id);
    }
  }
  const proposalIdSet = new Set(proposalIds);

  // Count knowledge cards that will become orphaned — DO NOT delete them
  let orphanedKnowledgeCount = 0;
  const orphanedKnowledgeIds: string[] = [];
  for (const card of storages.knowledgeCards.getAll()) {
    if (proposalIdSet.has(card.proposalId)) {
      orphanedKnowledgeCount += 1;
      orphanedKnowledgeIds.push(card.id);
    }
  }

  // Count conversations that actually exist BEFORE deletion (for accurate reporting)
  const beforeConversationCount = storages.conversations.getAll().filter(
    (c) => idSet.has(c.id),
  ).length;

  // Count messages/rounds before deletion
  for (const conversationId of conversationIds) {
    deletedMessages += storages.messages.getByConversationId(conversationId).length;
    deletedRounds += storages.rounds?.getByConversationId(conversationId).length ?? 0;
  }
  deletedSources = sourceIds.length;
  deletedProposals = proposalIds.length;

  // Delete proposals (linked by sourceIds and by conversationId)
  storages.proposals.removeBySourceIds(sourceIds);
  for (const conversationId of conversationIds) {
    storages.proposals.removeByConversationId(conversationId);
  }

  // Delete sources
  for (const conversationId of conversationIds) {
    storages.sources.removeByConversationId(conversationId);
  }

  // Delete messages and rounds
  for (const conversationId of conversationIds) {
    storages.messages.removeByConversationId(conversationId);
    storages.rounds?.removeByConversationId(conversationId);
  }

  // Delete canonical versions. Analyzer runs and Asset metadata remain
  // sidecar storage and are handled separately so IndexedDB bulk deletion can
  // commit the seven canonical stores atomically first.
  for (const conversationId of conversationIds) {
    storages.versions?.removeByConversationId(conversationId);
  }
  deleteConversationSidecarMetadata(conversationIds, storages);

  // Delete conversations — use removeMany for atomic batch operation
  storages.conversations.removeMany(conversationIds);

  // Verify deletion: count conversations that still exist AFTER deletion
  const afterConversationCount = storages.conversations.getAll().filter(
    (c) => idSet.has(c.id),
  ).length;

  // Log mismatch if any conversations were not removed from cache
  if (afterConversationCount > 0) {
    console.error(
      `[batchDeleteConversationWorkspace] ${afterConversationCount} conversation(s) still in cache after removeMany — IDs may not have been found.`,
    );
  }

  return {
    deletedConversations: beforeConversationCount - afterConversationCount,
    deletedMessages,
    deletedRounds,
    deletedSources,
    deletedProposals,
    orphanedKnowledgeCount,
    orphanedKnowledgeIds,
  };
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
