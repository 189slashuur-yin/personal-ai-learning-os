import type { Conversation } from "@/core/entities/conversation";
import {
  isChatGPTShareSnapshotMetadata,
  type ImportedSource,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { resolveChatGPTShareSnapshotHistory } from "@/core/services/chatgpt-share-snapshot-history";
import type { ChatGPTShareSnapshotCanonicalPlan } from "@/core/services/chatgpt-share-snapshot-service";
import {
  drainPendingWritesOrThrow,
  getPendingWriteCount,
  putStores,
  readAll,
  type StoreBatch,
} from "./database";
import {
  clearCaches,
  getConversationCache,
  getMessageCache,
  getRoundCache,
  getSourceCache,
  preloadAll,
  type PreloadCounts,
} from "./preload";

export type ShareSnapshotCanonicalPlan = ChatGPTShareSnapshotCanonicalPlan;

export type ShareSnapshotCanonicalVerification = {
  conversationId: string;
  sourceId: string;
  messageCount: number;
  roundCount: number;
  sourceMessageCount: number;
  referencedMessageCount: number;
  sourceMetadataVerified: true;
  sourceLineageVerified: true;
  referencesVerified: true;
  pendingWriteCount: 0;
};

export type ShareSnapshotCanonicalOperationResult = {
  written: {
    conversations: number;
    sources: number;
    messages: number;
    rounds: number;
  };
  preloadCounts: PreloadCounts;
  verification: ShareSnapshotCanonicalVerification;
};

type CanonicalState = {
  conversations: Conversation[];
  sources: ImportedSource[];
  messages: Message[];
  rounds: Round[];
};

function requireId(value: string, label: string): string {
  const id = value.trim();
  if (!id) {
    throw new Error(`Share Snapshot plan ${label} is required.`);
  }
  return id;
}

function assertUniqueIds(
  records: readonly Readonly<{ id: string }>[],
  label: string,
): void {
  const ids = new Set<string>();
  for (const record of records) {
    const id = requireId(record.id, `${label} id`);
    if (ids.has(id)) {
      throw new Error(`Share Snapshot plan contains duplicate ${label} id ${id}.`);
    }
    ids.add(id);
  }
}

function mergeRecords<T extends { id: string }>(
  existing: readonly T[],
  writes: readonly Readonly<T>[],
): T[] {
  const byId = new Map(existing.map((record) => [record.id, record]));
  for (const record of writes) {
    byId.set(record.id, record as T);
  }
  return [...byId.values()];
}

function assertNoCrossOwnerCollision<T extends { id: string; conversationId: string }>(
  existing: readonly T[],
  writes: readonly Readonly<T>[],
  conversationId: string,
  label: string,
): void {
  const existingById = new Map(existing.map((record) => [record.id, record]));
  for (const record of writes) {
    if (record.conversationId !== conversationId) {
      throw new Error(
        `Share Snapshot ${label} ${record.id} does not belong to conversation ${conversationId}.`,
      );
    }
    const current = existingById.get(record.id);
    if (current && current.conversationId !== conversationId) {
      throw new Error(
        `Share Snapshot ${label} ${record.id} is already owned by another conversation.`,
      );
    }
  }
}

function assertSourceOwnership(
  source: Readonly<ImportedSource>,
  existingSources: readonly ImportedSource[],
  conversationId: string,
): void {
  if (source.conversationId !== conversationId) {
    throw new Error(
      `Share Snapshot source ${source.id} does not belong to conversation ${conversationId}.`,
    );
  }
  const existing = existingSources.find((candidate) => candidate.id === source.id);
  if (existing) {
    throw new Error(
      `Share Snapshot source ${source.id} already exists and is immutable.`,
    );
  }
  if (!isChatGPTShareSnapshotMetadata(source.shareSnapshot)) {
    throw new Error(
      `Share Snapshot source ${source.id} is not an immutable Snapshot Source.`,
    );
  }
}

function validateSourceLineage(
  conversationId: string,
  source: Readonly<ImportedSource>,
  sources: readonly ImportedSource[],
  messages: readonly Message[],
  planMessages: readonly Readonly<Message>[],
): number {
  if (!isChatGPTShareSnapshotMetadata(source.shareSnapshot)) {
    throw new Error(
      `Share Snapshot source ${source.id} is not an immutable Snapshot Source.`,
    );
  }
  for (const message of planMessages) {
    if (message.sourceId !== source.id) {
      throw new Error(
        `Share Snapshot message ${message.id} must reference source ${source.id}.`,
      );
    }
  }

  const history = resolveChatGPTShareSnapshotHistory({
    conversationId,
    resourceHash: source.shareSnapshot.resourceHash,
    sources,
  });
  if (history.status === "blocked") {
    throw new Error(
      `Share Snapshot history is invalid: ${history.reason}.`,
    );
  }
  if (history.head?.id !== source.id) {
    throw new Error(
      `Share Snapshot source ${source.id} is not the history head.`,
    );
  }
  history.chain.forEach((snapshot, index) => {
    if (
      !isChatGPTShareSnapshotMetadata(snapshot.shareSnapshot) ||
      snapshot.shareSnapshot.snapshotSequence !== index + 1
    ) {
      throw new Error(
        `Share Snapshot source ${snapshot.id} has an invalid snapshotSequence.`,
      );
    }
  });

  const historySourceIds = new Set(history.chain.map(({ id }) => id));
  const lineage = messages.filter(
    (message) => message.sourceId && historySourceIds.has(message.sourceId),
  );
  const ordinals = new Set<number>();
  for (const message of lineage) {
    if (message.conversationId !== conversationId) {
      throw new Error(
        `Share Snapshot history for ${source.id} is referenced across conversations.`,
      );
    }
    if (
      !Number.isSafeInteger(message.sourceOrdinal) ||
      (message.sourceOrdinal ?? -1) < 0
    ) {
      throw new Error(
        `Share Snapshot message ${message.id} has an invalid sourceOrdinal.`,
      );
    }
    const ordinal = message.sourceOrdinal as number;
    if (ordinals.has(ordinal)) {
      throw new Error(
        `Share Snapshot history for ${source.id} contains duplicate sourceOrdinal ${ordinal}.`,
      );
    }
    ordinals.add(ordinal);
  }

  const ordered = [...lineage].sort(
    (left, right) =>
      (left.sourceOrdinal as number) - (right.sourceOrdinal as number),
  );
  ordered.forEach((message, index) => {
    if (message.sourceOrdinal !== index) {
      throw new Error(
        `Share Snapshot history for ${source.id} is missing sourceOrdinal ${index}.`,
      );
    }
  });

  if (source.shareSnapshot?.snapshotMessageCount !== ordered.length) {
    throw new Error(
      `Share Snapshot source ${source.id} metadata expects ${source.shareSnapshot?.snapshotMessageCount ?? "no"} messages, but the canonical lineage contains ${ordered.length}.`,
    );
  }
  return ordered.length;
}

function validateRoundReferences(
  conversationId: string,
  messages: readonly Message[],
  rounds: readonly Round[],
): number {
  const messageById = new Map(messages.map((message) => [message.id, message]));
  let referenceCount = 0;

  for (const round of rounds.filter(
    (candidate) => candidate.conversationId === conversationId,
  )) {
    const seen = new Set<string>();
    for (const messageId of round.messageIds) {
      if (seen.has(messageId)) {
        throw new Error(
          `Share Snapshot round ${round.id} contains duplicate message reference ${messageId}.`,
        );
      }
      seen.add(messageId);
      const message = messageById.get(messageId);
      if (!message || message.conversationId !== conversationId) {
        throw new Error(
          `Share Snapshot round ${round.id} references missing message ${messageId}.`,
        );
      }
      referenceCount += 1;
    }
  }
  return referenceCount;
}

function validatePlan(plan: ShareSnapshotCanonicalPlan, current: CanonicalState): {
  expected: CanonicalState;
  sourceMessageCount: number;
  referencedMessageCount: number;
} {
  const conversationId = requireId(plan.conversation.id, "conversation id");
  const sourceId = requireId(plan.source.id, "source id");
  assertUniqueIds(plan.messages, "message");
  assertUniqueIds(plan.rounds, "round");
  assertSourceOwnership(plan.source, current.sources, conversationId);
  assertNoCrossOwnerCollision(
    current.messages,
    plan.messages,
    conversationId,
    "message",
  );
  assertNoCrossOwnerCollision(
    current.rounds,
    plan.rounds,
    conversationId,
    "round",
  );

  const expected: CanonicalState = {
    conversations: mergeRecords(current.conversations, [plan.conversation]),
    sources: mergeRecords(current.sources, [plan.source]),
    messages: mergeRecords(current.messages, plan.messages),
    rounds: mergeRecords(current.rounds, plan.rounds),
  };
  const sourceMessageCount = validateSourceLineage(
    conversationId,
    plan.source,
    expected.sources,
    expected.messages,
    plan.messages,
  );
  const referencedMessageCount = validateRoundReferences(
    conversationId,
    expected.messages,
    expected.rounds,
  );

  const expectedSource = expected.sources.find(
    (candidate) => candidate.id === sourceId,
  );
  if (!expectedSource || expectedSource.conversationId !== conversationId) {
    throw new Error(`Share Snapshot source ${sourceId} ownership is invalid.`);
  }

  return { expected, sourceMessageCount, referencedMessageCount };
}

function recordsMatch<T extends { id: string }>(
  actual: readonly T[],
  expected: readonly T[],
): boolean {
  if (actual.length !== expected.length) return false;
  const actualById = new Map(actual.map((record) => [record.id, record]));
  return expected.every((record) => {
    const candidate = actualById.get(record.id);
    return candidate && JSON.stringify(candidate) === JSON.stringify(record);
  });
}

function verifyReloadedState(
  plan: ShareSnapshotCanonicalPlan,
  expected: CanonicalState,
  sourceMessageCount: number,
  referencedMessageCount: number,
): ShareSnapshotCanonicalVerification {
  const actual: CanonicalState = {
    conversations: getConversationCache(),
    sources: getSourceCache(),
    messages: getMessageCache(),
    rounds: getRoundCache(),
  };
  if (
    !recordsMatch(actual.conversations, expected.conversations) ||
    !recordsMatch(actual.sources, expected.sources) ||
    !recordsMatch(actual.messages, expected.messages) ||
    !recordsMatch(actual.rounds, expected.rounds)
  ) {
    throw new Error(
      "Share Snapshot reload verification found a canonical store mismatch.",
    );
  }

  const conversationId = plan.conversation.id;
  const sourceId = plan.source.id;
  const source = actual.sources.find((candidate) => candidate.id === sourceId);
  if (
    !source?.shareSnapshot ||
    JSON.stringify(source.shareSnapshot) !==
      JSON.stringify(plan.source.shareSnapshot)
  ) {
    throw new Error(
      `Share Snapshot source ${sourceId} metadata verification failed.`,
    );
  }

  const verifiedSourceMessageCount = validateSourceLineage(
    conversationId,
    source,
    actual.sources,
    actual.messages,
    plan.messages,
  );
  const verifiedReferenceCount = validateRoundReferences(
    conversationId,
    actual.messages,
    actual.rounds,
  );
  const pendingWriteCount = getPendingWriteCount();
  if (pendingWriteCount !== 0) {
    throw new Error(
      `Share Snapshot verification found ${pendingWriteCount} pending write(s).`,
    );
  }
  if (
    verifiedSourceMessageCount !== sourceMessageCount ||
    verifiedReferenceCount !== referencedMessageCount
  ) {
    throw new Error("Share Snapshot lineage or reference counts changed on reload.");
  }

  return {
    conversationId,
    sourceId,
    messageCount: actual.messages.filter(
      (message) => message.conversationId === conversationId,
    ).length,
    roundCount: actual.rounds.filter(
      (round) => round.conversationId === conversationId,
    ).length,
    sourceMessageCount,
    referencedMessageCount,
    sourceMetadataVerified: true,
    sourceLineageVerified: true,
    referencesVerified: true,
    pendingWriteCount: 0,
  };
}

async function readCanonicalState(): Promise<CanonicalState> {
  const [conversations, sources, messages, rounds] = await Promise.all([
    readAll<Conversation>("conversations"),
    readAll<ImportedSource>("sources"),
    readAll<Message>("messages"),
    readAll<Round>("rounds"),
  ]);
  return { conversations, sources, messages, rounds };
}

export async function executeShareSnapshotCanonicalOperation(
  plan: ShareSnapshotCanonicalPlan,
): Promise<ShareSnapshotCanonicalOperationResult> {
  await drainPendingWritesOrThrow();
  if (getPendingWriteCount() !== 0) {
    throw new Error("Share Snapshot write barrier did not drain pending writes.");
  }

  const current = await readCanonicalState();
  const { expected, sourceMessageCount, referencedMessageCount } = validatePlan(
    plan,
    current,
  );
  const batch: StoreBatch = {
    conversations: [plan.conversation],
    sources: [plan.source],
    messages: [...plan.messages],
    rounds: [...plan.rounds],
  };

  await putStores(batch);
  clearCaches();
  const preloadCounts = await preloadAll();
  const verification = verifyReloadedState(
    plan,
    expected,
    sourceMessageCount,
    referencedMessageCount,
  );

  return {
    written: {
      conversations: 1,
      sources: 1,
      messages: plan.messages.length,
      rounds: plan.rounds.length,
    },
    preloadCounts,
    verification,
  };
}
