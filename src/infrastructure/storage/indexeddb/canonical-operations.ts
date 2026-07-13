import type { BatchDeleteResult } from "@/core/services/conversation-workspace";
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
  orphanDependentCounts: {
    messages: number;
    rounds: number;
    sources: number;
    proposals: number;
    conversationVersions: number;
  };
};

export type CanonicalBatchDeleteResult = {
  deletion: BatchDeleteResult;
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
} {
  const idSet = new Set(conversationIds);
  const current = buildCacheBatch();
  const conversations = current.conversations ?? [];
  const messages = current.messages ?? [];
  const rounds = current.rounds ?? [];
  const sources = current.sources ?? [];
  const proposals = current.proposals ?? [];
  const knowledgeCards = current["knowledge-cards"] ?? [];
  const versions = current["conversation-versions"] ?? [];

  const sourceIds = new Set(
    sources
      .filter(
        (source) =>
          typeof source === "object" &&
          source !== null &&
          "conversationId" in source &&
          typeof source.conversationId === "string" &&
          idSet.has(source.conversationId),
      )
      .map((source) => (source as { id: string }).id),
  );
  const proposalIds = new Set(
    proposals
      .filter((proposal) => {
        if (typeof proposal !== "object" || proposal === null) return false;
        const candidate = proposal as {
          conversationId?: string;
          sourceId?: string;
        };
        return Boolean(
          (candidate.conversationId && idSet.has(candidate.conversationId)) ||
            (candidate.sourceId && sourceIds.has(candidate.sourceId)),
        );
      })
      .map((proposal) => (proposal as { id: string }).id),
  );
  const orphanedKnowledgeIds = knowledgeCards
    .filter(
      (card) =>
        typeof card === "object" &&
        card !== null &&
        "proposalId" in card &&
        typeof card.proposalId === "string" &&
        proposalIds.has(card.proposalId),
    )
    .map((card) => (card as { id: string }).id);

  const belongsToDeletedConversation = (value: unknown): boolean =>
    typeof value === "object" &&
    value !== null &&
    "conversationId" in value &&
    typeof value.conversationId === "string" &&
    idSet.has(value.conversationId);

  const nextBatch: StoreBatch = {
    conversations: conversations.filter(
      (conversation) =>
        typeof conversation !== "object" ||
        conversation === null ||
        !("id" in conversation) ||
        typeof conversation.id !== "string" ||
        !idSet.has(conversation.id),
    ),
    messages: messages.filter((message) => !belongsToDeletedConversation(message)),
    rounds: rounds.filter((round) => !belongsToDeletedConversation(round)),
    sources: sources.filter((source) => !belongsToDeletedConversation(source)),
    proposals: proposals.filter((proposal) => !proposalIds.has((proposal as { id: string }).id)),
    // Batch delete intentionally preserves Knowledge Cards, matching the
    // existing documented UI behavior.
    "knowledge-cards": [...knowledgeCards],
    "conversation-versions": versions.filter(
      (version) => !belongsToDeletedConversation(version),
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
    },
  };
}

async function verifyCanonicalState(
  requestedIds: string[],
): Promise<CanonicalVerification> {
  const batch = buildCacheBatch();
  const conversations = batch.conversations ?? [];
  const messages = batch.messages ?? [];
  const rounds = batch.rounds ?? [];
  const sources = batch.sources ?? [];
  const proposals = batch.proposals ?? [];
  const versions = batch["conversation-versions"] ?? [];
  const conversationIds = new Set(
    conversations.map((conversation) => (conversation as { id: string }).id),
  );
  const sourceIds = new Set(
    sources.map((source) => (source as { id: string }).id),
  );
  const requestedIdSet = new Set(requestedIds);
  const cacheCounts = getCachedCounts();
  const indexedDBCounts = await readCanonicalCounts();
  const verification: CanonicalVerification = {
    cacheCounts,
    indexedDBCounts,
    cacheMatchesIndexedDB: countsMatch(cacheCounts, indexedDBCounts),
    pendingWriteCount: getPendingWriteCount(),
    remainingRequestedIds: [...conversationIds].filter((id) =>
      requestedIdSet.has(id),
    ),
    orphanDependentCounts: {
      messages: messages.filter(
        (message) =>
          !conversationIds.has((message as { conversationId: string }).conversationId),
      ).length,
      rounds: rounds.filter(
        (round) =>
          !conversationIds.has((round as { conversationId: string }).conversationId),
      ).length,
      sources: sources.filter((source) => {
        const conversationId = (source as { conversationId?: string })
          .conversationId;
        return Boolean(conversationId && !conversationIds.has(conversationId));
      }).length,
      proposals: proposals.filter((proposal) => {
        const candidate = proposal as {
          conversationId?: string;
          sourceId?: string;
        };
        return Boolean(
          (candidate.conversationId &&
            !conversationIds.has(candidate.conversationId)) ||
            (candidate.sourceId && !sourceIds.has(candidate.sourceId)),
        );
      }).length,
      conversationVersions: versions.filter(
        (version) =>
          !conversationIds.has(
            (version as { conversationId: string }).conversationId,
          ),
      ).length,
    },
  };

  if (
    verification.pendingWriteCount !== 0 ||
    verification.remainingRequestedIds.length > 0 ||
    !verification.cacheMatchesIndexedDB ||
    Object.values(verification.orphanDependentCounts).some(
      (count) => count > 0,
    )
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
  const { batch, deletion } = buildBatchDeleteSnapshot(conversationIds);
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
  clearCaches();
  emit(observer, "after-clear-caches", { cacheCounts: getCachedCounts() });
  const cacheCounts = await preloadAll();
  emit(observer, "after-preload", { cacheCounts });
  const verification = await verifyCanonicalState(conversationIds);
  return { deletion, verification };
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
  const verification = await verifyCanonicalState([]);
  if (Object.values(verification.indexedDBCounts).some((count) => count > 0)) {
    throw new Error(
      `Canonical clear verification failed: ${JSON.stringify(verification)}`,
    );
  }
  return verification;
}
