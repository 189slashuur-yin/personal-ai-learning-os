import type { BatchDeleteResult } from "@/core/services/conversation-workspace";
import type { Conversation } from "@/core/entities/conversation";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Message } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";
import type { Round } from "@/core/entities/round";
import {
  collectConversationDependencyIds,
  toConversationDependencySets,
  type ConversationDependencyIds,
} from "@/core/services/conversation-referential-integrity";
import { SearchIndexService } from "@/core/services/search-index-service";
import {
  clearDeletedFlowPointers,
  readCurrentProposalPointer,
  readCurrentSourcePointer,
  type FlowPointerCleanupResult,
} from "@/infrastructure/storage/flow-pointers";
import {
  countStore,
  drainPendingWrites,
  getPendingWriteCount,
  replaceStores,
  type StoreBatch,
} from "./database";
import {
  buildCacheBatch,
  clearCaches,
  getCachedCounts,
  isIndexedDBLoaded,
  preloadAll,
  type PreloadCounts,
} from "./preload";

export type CanonicalOperationPhase =
  | "after-write-barrier"
  | "after-in-memory-snapshot"
  | "before-replace"
  | "after-replace"
  | "after-flow-pointer-cleanup"
  | "after-clear-caches"
  | "after-preload";

export type CanonicalOperationObserver = (
  phase: CanonicalOperationPhase,
  data: Record<string, unknown>,
) => void;

export type CanonicalVerification = {
  cacheCounts: PreloadCounts;
  indexedDBCounts: PreloadCounts;
  cacheMatchesIndexedDB: boolean;
  pendingWriteCount: number;
  remainingRequestedIds: string[];
  remainingDependentIds: Omit<ConversationDependencyIds, "conversationIds">;
  orphanDependentCounts: {
    messages: number;
    rounds: number;
    sources: number;
    proposals: number;
    conversationVersions: number;
  };
  searchResidualDocumentIds: string[];
  searchInvalidReferenceDocumentIds: string[];
  reviewResidualProposalIds: string[];
  staleFlowPointerIds: {
    currentSourceId?: string;
    currentProposalId?: string;
  };
  flowPointerCleanupFailures: string[];
};

export type CanonicalBatchDeleteResult = {
  deletion: BatchDeleteResult;
  deletedDependencyIds: ConversationDependencyIds;
  flowPointerCleanup: FlowPointerCleanupResult;
  verification: CanonicalVerification;
};

function emit(
  observer: CanonicalOperationObserver | undefined,
  phase: CanonicalOperationPhase,
  data: Record<string, unknown>,
): void {
  try {
    observer?.(phase, data);
  } catch {
    // Observability must never become part of the persistence boundary.
  }
}

function normalizeBatchCounts(batch: StoreBatch): PreloadCounts {
  return {
    conversations: batch.conversations?.length ?? 0,
    messages: batch.messages?.length ?? 0,
    rounds: batch.rounds?.length ?? 0,
    sources: batch.sources?.length ?? 0,
    proposals: batch.proposals?.length ?? 0,
    knowledgeCards: batch["knowledge-cards"]?.length ?? 0,
    conversationVersions: batch["conversation-versions"]?.length ?? 0,
  };
}

async function readCanonicalCounts(): Promise<PreloadCounts> {
  const [
    conversations,
    messages,
    rounds,
    sources,
    proposals,
    knowledgeCards,
    conversationVersions,
  ] = await Promise.all([
    countStore("conversations"),
    countStore("messages"),
    countStore("rounds"),
    countStore("sources"),
    countStore("proposals"),
    countStore("knowledge-cards"),
    countStore("conversation-versions"),
  ]);
  return {
    conversations,
    messages,
    rounds,
    sources,
    proposals,
    knowledgeCards,
    conversationVersions,
  };
}

function countsMatch(left: PreloadCounts, right: PreloadCounts): boolean {
  return (Object.keys(left) as Array<keyof PreloadCounts>).every(
    (key) => left[key] === right[key],
  );
}

async function enterCanonicalWriteBarrier(
  observer?: CanonicalOperationObserver,
  ensureLoaded = false,
): Promise<void> {
  await drainPendingWrites();
  const pendingWriteCount = getPendingWriteCount();
  if (pendingWriteCount !== 0) {
    throw new Error(
      `Canonical write barrier failed: ${pendingWriteCount} tracked write(s) remain.`,
    );
  }
  if (ensureLoaded && !isIndexedDBLoaded()) {
    await preloadAll();
  }
  emit(observer, "after-write-barrier", { pendingWriteCount });
}

function buildBatchDeleteSnapshot(conversationIds: string[]): {
  batch: StoreBatch;
  deletion: BatchDeleteResult;
  deletedDependencyIds: ConversationDependencyIds;
} {
  const current = buildCacheBatch();
  const conversations = (current.conversations ?? []) as Conversation[];
  const messages = (current.messages ?? []) as Message[];
  const rounds = (current.rounds ?? []) as Round[];
  const sources = (current.sources ?? []) as ImportedSource[];
  const proposals = (current.proposals ?? []) as Proposal[];
  const knowledgeCards = (current["knowledge-cards"] ?? []) as KnowledgeCard[];
  const versions = (current["conversation-versions"] ?? []) as ConversationVersion[];
  const deletedDependencyIds = collectConversationDependencyIds(
    conversationIds,
    {
      conversations,
      messages,
      rounds,
      sources,
      proposals,
      conversationVersions: versions,
    },
  );
  const deleted = toConversationDependencySets(deletedDependencyIds);
  const orphanedKnowledgeIds = knowledgeCards
    .filter((card) => deleted.proposalIds.has(card.proposalId))
    .map((card) => card.id);

  const nextBatch: StoreBatch = {
    conversations: conversations.filter(
      (conversation) => !deleted.conversationIds.has(conversation.id),
    ),
    messages: messages.filter((message) => !deleted.messageIds.has(message.id)),
    rounds: rounds.filter((round) => !deleted.roundIds.has(round.id)),
    sources: sources.filter((source) => !deleted.sourceIds.has(source.id)),
    proposals: proposals.filter(
      (proposal) => !deleted.proposalIds.has(proposal.id),
    ),
    // Accepted/manual Knowledge is an independent aggregate. Historical
    // provenance IDs remain as snapshots; live links are resolved separately.
    "knowledge-cards": [...knowledgeCards],
    "conversation-versions": versions.filter(
      (version) => !deleted.conversationVersionIds.has(version.id),
    ),
  };

  return {
    batch: nextBatch,
    deletion: {
      deletedConversations:
        conversations.length - (nextBatch.conversations?.length ?? 0),
      deletedMessages: messages.length - (nextBatch.messages?.length ?? 0),
      deletedRounds: rounds.length - (nextBatch.rounds?.length ?? 0),
      deletedSources: sources.length - (nextBatch.sources?.length ?? 0),
      deletedProposals: proposals.length - (nextBatch.proposals?.length ?? 0),
      orphanedKnowledgeCount: orphanedKnowledgeIds.length,
      orphanedKnowledgeIds,
      sidecarCleanupFailures: [],
    },
    deletedDependencyIds,
  };
}

async function verifyCanonicalState(
  requestedIds: string[],
  deletedDependencyIds: ConversationDependencyIds,
  flowPointerCleanupFailures: string[] = [],
): Promise<CanonicalVerification> {
  const batch = buildCacheBatch();
  const conversations = (batch.conversations ?? []) as Conversation[];
  const messages = (batch.messages ?? []) as Message[];
  const rounds = (batch.rounds ?? []) as Round[];
  const sources = (batch.sources ?? []) as ImportedSource[];
  const proposals = (batch.proposals ?? []) as Proposal[];
  const knowledgeCards = (batch["knowledge-cards"] ?? []) as KnowledgeCard[];
  const versions = (batch["conversation-versions"] ?? []) as ConversationVersion[];
  const conversationIds = new Set(
    conversations.map((conversation) => conversation.id),
  );
  const messageIds = new Set(messages.map((message) => message.id));
  const roundIds = new Set(rounds.map((round) => round.id));
  const sourceIds = new Set(sources.map((source) => source.id));
  const deleted = toConversationDependencySets(deletedDependencyIds);
  const requestedIdSet = new Set(requestedIds);
  const cacheCounts = getCachedCounts();
  const indexedDBCounts = await readCanonicalCounts();
  const searchDocuments = new SearchIndexService({
    workspaces: [],
    conversations,
    sources,
    messages,
    rounds,
    proposals,
    knowledgeCards,
    tasks: [],
    tags: [],
    assets: [],
  }).buildDocuments();
  const deletedSearchDocuments = new Set([
    ...deletedDependencyIds.conversationIds.map((id) => `conversation:${id}`),
    ...deletedDependencyIds.messageIds.map((id) => `message:${id}`),
    ...deletedDependencyIds.roundIds.map((id) => `round:${id}`),
    ...deletedDependencyIds.sourceIds.map((id) => `source:${id}`),
    ...deletedDependencyIds.proposalIds.map((id) => `proposal:${id}`),
  ]);
  const currentSource = readCurrentSourcePointer();
  const currentProposal = readCurrentProposalPointer();
  const verification: CanonicalVerification = {
    cacheCounts,
    indexedDBCounts,
    cacheMatchesIndexedDB: countsMatch(cacheCounts, indexedDBCounts),
    pendingWriteCount: getPendingWriteCount(),
    remainingRequestedIds: [...conversationIds].filter((id) =>
      requestedIdSet.has(id),
    ),
    remainingDependentIds: {
      messageIds: messages
        .filter((message) => deleted.messageIds.has(message.id))
        .map((message) => message.id),
      roundIds: rounds
        .filter((round) => deleted.roundIds.has(round.id))
        .map((round) => round.id),
      sourceIds: sources
        .filter((source) => deleted.sourceIds.has(source.id))
        .map((source) => source.id),
      proposalIds: proposals
        .filter((proposal) => deleted.proposalIds.has(proposal.id))
        .map((proposal) => proposal.id),
      conversationVersionIds: versions
        .filter((version) =>
          deleted.conversationVersionIds.has(version.id),
        )
        .map((version) => version.id),
    },
    orphanDependentCounts: {
      messages: messages.filter(
        (message) =>
          !conversationIds.has(message.conversationId),
      ).length,
      rounds: rounds.filter(
        (round) =>
          !conversationIds.has(round.conversationId),
      ).length,
      sources: sources.filter((source) => {
        const conversationId = source.conversationId;
        return Boolean(conversationId && !conversationIds.has(conversationId));
      }).length,
      proposals: proposals.filter((proposal) => {
        return Boolean(
          (proposal.conversationId &&
            !conversationIds.has(proposal.conversationId)) ||
            (proposal.sourceId && !sourceIds.has(proposal.sourceId)) ||
            (proposal.sourceRoundId &&
              !roundIds.has(proposal.sourceRoundId)) ||
            proposal.sourceMessageIds?.some(
              (messageId) => !messageIds.has(messageId),
            ),
        );
      }).length,
      conversationVersions: versions.filter(
        (version) => !conversationIds.has(version.conversationId),
      ).length,
    },
    searchResidualDocumentIds: searchDocuments
      .filter((document) =>
        deletedSearchDocuments.has(`${document.entityType}:${document.entityId}`),
      )
      .map((document) => document.id),
    searchInvalidReferenceDocumentIds: searchDocuments
      .filter((document) => {
        const conversationId = document.metadata?.conversationId;
        const sourceRoundId = document.metadata?.sourceRoundId;
        return Boolean(
          (typeof conversationId === "string" &&
            deleted.conversationIds.has(conversationId)) ||
            (typeof sourceRoundId === "string" &&
              deleted.roundIds.has(sourceRoundId)),
        );
      })
      .map((document) => document.id),
    reviewResidualProposalIds: proposals
      .filter((proposal) => deleted.proposalIds.has(proposal.id))
      .map((proposal) => proposal.id),
    staleFlowPointerIds: {
      currentSourceId:
        currentSource &&
        (deleted.sourceIds.has(currentSource.id) ||
          Boolean(
            currentSource.conversationId &&
              deleted.conversationIds.has(currentSource.conversationId),
          ))
          ? currentSource.id
          : undefined,
      currentProposalId:
        currentProposal && deleted.proposalIds.has(currentProposal.id)
          ? currentProposal.id
          : undefined,
    },
    flowPointerCleanupFailures,
  };

  if (
    verification.pendingWriteCount !== 0 ||
    verification.remainingRequestedIds.length > 0 ||
    Object.values(verification.remainingDependentIds).some(
      (ids) => ids.length > 0,
    ) ||
    !verification.cacheMatchesIndexedDB ||
    Object.values(verification.orphanDependentCounts).some(
      (count) => count > 0,
    ) ||
    verification.searchResidualDocumentIds.length > 0 ||
    verification.searchInvalidReferenceDocumentIds.length > 0 ||
    verification.reviewResidualProposalIds.length > 0 ||
    Boolean(verification.staleFlowPointerIds.currentSourceId) ||
    Boolean(verification.staleFlowPointerIds.currentProposalId) ||
    verification.flowPointerCleanupFailures.length > 0
  ) {
    throw new Error(
      `Canonical batch verification failed: ${JSON.stringify(verification)}`,
    );
  }
  return verification;
}

export async function bulkDeleteCanonicalConversations(
  conversationIds: string[],
  observer?: CanonicalOperationObserver,
): Promise<CanonicalBatchDeleteResult> {
  await enterCanonicalWriteBarrier(observer, true);
  const { batch, deletion, deletedDependencyIds } =
    buildBatchDeleteSnapshot(conversationIds);
  emit(observer, "after-in-memory-snapshot", {
    resultingCounts: normalizeBatchCounts(batch),
    deletion,
  });
  emit(observer, "before-replace", {
    resultingCounts: normalizeBatchCounts(batch),
    pendingWriteCount: getPendingWriteCount(),
  });
  await replaceStores(batch);
  emit(observer, "after-replace", {
    resultingCounts: normalizeBatchCounts(batch),
    pendingWriteCount: getPendingWriteCount(),
  });
  const flowPointerCleanup = clearDeletedFlowPointers(deletedDependencyIds);
  emit(observer, "after-flow-pointer-cleanup", { flowPointerCleanup });
  clearCaches();
  emit(observer, "after-clear-caches", { cacheCounts: getCachedCounts() });
  const cacheCounts = await preloadAll();
  emit(observer, "after-preload", { cacheCounts });
  const verification = await verifyCanonicalState(
    conversationIds,
    deletedDependencyIds,
    flowPointerCleanup.failures,
  );
  return {
    deletion,
    deletedDependencyIds,
    flowPointerCleanup,
    verification,
  };
}

const EMPTY_CANONICAL_BATCH: StoreBatch = {
  conversations: [],
  messages: [],
  rounds: [],
  sources: [],
  proposals: [],
  "knowledge-cards": [],
  "conversation-versions": [],
};

export async function clearCanonicalBusinessData(
  observer?: CanonicalOperationObserver,
): Promise<CanonicalVerification> {
  await enterCanonicalWriteBarrier(observer);
  emit(observer, "before-replace", {
    resultingCounts: normalizeBatchCounts(EMPTY_CANONICAL_BATCH),
    pendingWriteCount: getPendingWriteCount(),
  });
  await replaceStores(EMPTY_CANONICAL_BATCH);
  emit(observer, "after-replace", {
    resultingCounts: normalizeBatchCounts(EMPTY_CANONICAL_BATCH),
    pendingWriteCount: getPendingWriteCount(),
  });
  clearCaches();
  emit(observer, "after-clear-caches", { cacheCounts: getCachedCounts() });
  const cacheCounts = await preloadAll();
  emit(observer, "after-preload", { cacheCounts });
  const verification = await verifyCanonicalState([], {
    conversationIds: [],
    messageIds: [],
    roundIds: [],
    sourceIds: [],
    proposalIds: [],
    conversationVersionIds: [],
  });
  if (Object.values(verification.indexedDBCounts).some((count) => count > 0)) {
    throw new Error(
      `Canonical clear verification failed: ${JSON.stringify(verification)}`,
    );
  }
  return verification;
}
