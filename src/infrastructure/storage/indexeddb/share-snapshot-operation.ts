import type { Conversation } from "@/core/entities/conversation";
import { DEFAULT_WORKSPACE_ID } from "@/core/entities/workspace";
import {
  isChatGPTShareSnapshotMetadata,
  type ImportedSource,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { resolveChatGPTShareSnapshotHistory } from "@/core/services/chatgpt-share-snapshot-history";
import type { ChatGPTShareSnapshotCanonicalPlan } from "@/core/services/chatgpt-share-snapshot-service";
import { deriveRoundDrafts } from "@/core/services/import-parser-pipeline";
import {
  drainPendingWritesOrThrow,
  getPendingWriteCount,
  openPalosDB,
  putStores,
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
  messageOwnershipVerified: true;
  referencesVerified: true;
  immutableRecordsPreserved: true;
  roundExtensionPreserved: true;
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

type RoundExtensionExpectation = {
  before: Readonly<Round>;
  after: Readonly<Round>;
};

type PlanValidation = {
  conversationWrite: Readonly<Conversation>;
  expected: CanonicalState;
  sourceMessageCount: number;
  referencedMessageCount: number;
  preservedSources: readonly Readonly<ImportedSource>[];
  roundExtensions: readonly RoundExtensionExpectation[];
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

function normalizeComparable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeComparable);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeComparable(entry)]),
  );
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeComparable(left)) ===
    JSON.stringify(normalizeComparable(right))
  );
}

function recordsMatchExcept(
  current: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
  mutableFields: readonly string[],
): boolean {
  const mutable = new Set(mutableFields);
  const project = (record: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(
      Object.entries(record).filter(([key]) => !mutable.has(key)),
    );
  return valuesEqual(project(current), project(incoming));
}

function assertConversationWrite(
  conversation: Readonly<Conversation>,
  current: CanonicalState,
  source: Readonly<ImportedSource>,
): Readonly<Conversation> {
  const metadata = source.shareSnapshot;
  if (!isChatGPTShareSnapshotMetadata(metadata)) {
    throw new Error(
      `Share Snapshot source ${source.id} is not an immutable Snapshot Source.`,
    );
  }
  const existing = current.conversations.find(
    ({ id }) => id === conversation.id,
  );
  const isAppend = Boolean(metadata.previousSnapshotSourceId);
  if (isAppend && !existing) {
    throw new Error(
      `Share Snapshot append Conversation ${conversation.id} does not exist.`,
    );
  }
  if (!isAppend && existing) {
    throw new Error(
      `Initial Share Snapshot cannot overwrite Conversation ${conversation.id}.`,
    );
  }
  if (
    existing &&
    !(
      existing.workspaceId === undefined &&
      conversation.workspaceId === DEFAULT_WORKSPACE_ID
    ) &&
    !recordsMatchExcept(
      existing as unknown as Record<string, unknown>,
      conversation as unknown as Record<string, unknown>,
      ["updatedAt"],
    )
  ) {
    throw new Error(
      `Share Snapshot append may only update Conversation ${conversation.id} updatedAt.`,
    );
  }
  if (
    existing &&
    existing.workspaceId === undefined &&
    conversation.workspaceId === DEFAULT_WORKSPACE_ID
  ) {
    const normalizedPlan = { ...conversation, workspaceId: undefined };
    if (
      !recordsMatchExcept(
        existing as unknown as Record<string, unknown>,
        normalizedPlan as unknown as Record<string, unknown>,
        ["updatedAt"],
      )
    ) {
      throw new Error(
        `Share Snapshot append may only update Conversation ${conversation.id} updatedAt.`,
      );
    }
  }
  if (conversation.updatedAt !== metadata.capturedAt) {
    throw new Error(
      `Share Snapshot Conversation ${conversation.id} updatedAt must match capturedAt.`,
    );
  }
  return existing
    ? { ...existing, updatedAt: conversation.updatedAt }
    : { ...conversation };
}

function assertSnapshotSequence(
  sources: readonly Readonly<ImportedSource>[],
): void {
  sources.forEach((source, index) => {
    if (
      !isChatGPTShareSnapshotMetadata(source.shareSnapshot) ||
      source.shareSnapshot.snapshotSequence !== index + 1
    ) {
      throw new Error(
        `Share Snapshot source ${source.id} has an invalid snapshotSequence.`,
      );
    }
  });
}

function validateIncomingHistory(
  conversationId: string,
  source: Readonly<ImportedSource>,
  currentSources: readonly ImportedSource[],
  expectedSources: readonly ImportedSource[],
): {
  previousSource: Readonly<ImportedSource> | null;
  preservedSources: readonly Readonly<ImportedSource>[];
} {
  const metadata = source.shareSnapshot;
  if (!isChatGPTShareSnapshotMetadata(metadata)) {
    throw new Error(
      `Share Snapshot source ${source.id} is not an immutable Snapshot Source.`,
    );
  }
  if (!metadata.resourceHash.trim()) {
    throw new Error(`Share Snapshot source ${source.id} has no resourceHash.`);
  }
  if (
    !metadata.snapshotHash.trim() ||
    !metadata.parserVersion.trim() ||
    metadata.hashAlgorithm !== "sha256-json-role-content-v1" ||
    !metadata.capturedAt.trim() ||
    Number.isNaN(Date.parse(metadata.capturedAt))
  ) {
    throw new Error(
      `Share Snapshot source ${source.id} has invalid snapshot metadata.`,
    );
  }
  if (
    !Number.isSafeInteger(metadata.snapshotMessageCount) ||
    metadata.snapshotMessageCount < 1
  ) {
    throw new Error(
      `Share Snapshot source ${source.id} has an invalid snapshotMessageCount.`,
    );
  }
  if (
    !Number.isSafeInteger(metadata.snapshotSequence) ||
    metadata.snapshotSequence < 1
  ) {
    throw new Error(
      `Share Snapshot source ${source.id} has an invalid snapshotSequence.`,
    );
  }
  if (
    source.importedAt !== metadata.capturedAt ||
    source.updatedAt !== metadata.capturedAt
  ) {
    throw new Error(
      `Share Snapshot source ${source.id} timestamps must match capturedAt.`,
    );
  }

  const currentHistory = resolveChatGPTShareSnapshotHistory({
    conversationId,
    resourceHash: metadata.resourceHash,
    sources: currentSources,
  });
  if (currentHistory.status === "blocked") {
    throw new Error(
      `Share Snapshot current history is invalid: ${currentHistory.reason}.`,
    );
  }
  assertSnapshotSequence(currentHistory.chain);

  const previousId = metadata.previousSnapshotSourceId;
  const previousSource = previousId
    ? currentSources.find(({ id }) => id === previousId) ?? null
    : null;
  if (previousId && !previousSource) {
    throw new Error(
      `Share Snapshot previous source ${previousId} does not exist.`,
    );
  }
  if (previousId && currentHistory.head?.id !== previousId) {
    throw new Error(
      `Share Snapshot previous source ${previousId} is not the current history head.`,
    );
  }
  if (!previousId && currentHistory.head) {
    throw new Error(
      `Share Snapshot resource ${metadata.resourceHash} would create a duplicate head.`,
    );
  }
  const previousMetadata = previousSource?.shareSnapshot;
  const expectedSequence =
    previousMetadata && isChatGPTShareSnapshotMetadata(previousMetadata)
      ? previousMetadata.snapshotSequence + 1
      : 1;
  if (metadata.snapshotSequence !== expectedSequence) {
    throw new Error(
      `Share Snapshot source ${source.id} has sequence ${metadata.snapshotSequence}; expected ${expectedSequence}.`,
    );
  }

  const expectedHistory = resolveChatGPTShareSnapshotHistory({
    conversationId,
    resourceHash: metadata.resourceHash,
    sources: expectedSources,
  });
  if (expectedHistory.status === "blocked") {
    throw new Error(
      `Share Snapshot history is invalid: ${expectedHistory.reason}.`,
    );
  }
  if (expectedHistory.head?.id !== source.id) {
    throw new Error(
      `Share Snapshot source ${source.id} is not the history head.`,
    );
  }
  assertSnapshotSequence(expectedHistory.chain);

  return {
    previousSource,
    preservedSources: currentHistory.chain,
  };
}

function orderedConversationMessages(
  messages: readonly Readonly<Message>[],
  conversationId: string,
): readonly Readonly<Message>[] {
  return messages
    .filter((message) => message.conversationId === conversationId)
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
}

function validateAppendOnlyMessages(input: {
  conversationId: string;
  source: Readonly<ImportedSource>;
  previousSource: Readonly<ImportedSource> | null;
  currentMessages: readonly Message[];
  planMessages: readonly Readonly<Message>[];
}): void {
  const metadata = input.source.shareSnapshot;
  if (!isChatGPTShareSnapshotMetadata(metadata)) return;
  if (input.planMessages.length === 0) {
    throw new Error("Share Snapshot canonical plan has no Messages to append.");
  }
  const existingIds = new Set(input.currentMessages.map(({ id }) => id));
  for (const message of input.planMessages) {
    if (existingIds.has(message.id)) {
      throw new Error(
        `Share Snapshot cannot rewrite existing Message ${message.id}.`,
      );
    }
  }

  const currentConversationMessages = orderedConversationMessages(
    input.currentMessages,
    input.conversationId,
  );
  const previousMetadata = input.previousSource?.shareSnapshot;
  const previousMessageCount =
    previousMetadata && isChatGPTShareSnapshotMetadata(previousMetadata)
      ? previousMetadata.snapshotMessageCount
      : 0;
  if (currentConversationMessages.length !== previousMessageCount) {
    throw new Error(
      `Share Snapshot canonical Message baseline has ${currentConversationMessages.length} Messages; expected ${previousMessageCount}.`,
    );
  }
  const orderedPlanMessages = [...input.planMessages].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
  const firstOrder = (currentConversationMessages.at(-1)?.order ?? -1) + 1;
  orderedPlanMessages.forEach((message, index) => {
    if (
      message.conversationId !== input.conversationId ||
      message.sourceId !== input.source.id
    ) {
      throw new Error(
        `Share Snapshot Message ${message.id} ownership or sourceId is invalid.`,
      );
    }
    if (
      message.order !== firstOrder + index ||
      message.sourceOrdinal !== previousMessageCount + index
    ) {
      throw new Error(
        `Share Snapshot Message ${message.id} does not continue canonical order and sourceOrdinal.`,
      );
    }
  });
  if (
    metadata.snapshotMessageCount !==
    previousMessageCount + orderedPlanMessages.length
  ) {
    throw new Error(
      `Share Snapshot source ${input.source.id} message count does not match its append suffix.`,
    );
  }
}

function messageIdsMatch(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((messageId, index) => messageId === expected[index])
  );
}

function assertRoundTailBaseline(
  tailRound: Readonly<Round>,
  currentMessages: readonly Readonly<Message>[],
): void {
  const expectedTail = deriveRoundDrafts(
    currentMessages.map(({ role, content }) => ({ role, content })),
  ).at(-1);
  if (!expectedTail) {
    throw new Error(
      `Share Snapshot Round extension ${tailRound.id} has no canonical tail baseline.`,
    );
  }
  const expectedMessageIds = expectedTail.messageIndexes.map(
    (index) => currentMessages[index]?.id ?? "",
  );
  if (
    expectedMessageIds.some((id) => !id) ||
    !messageIdsMatch(tailRound.messageIds, expectedMessageIds) ||
    tailRound.question !== expectedTail.question ||
    tailRound.answer !== expectedTail.answer
  ) {
    throw new Error(
      `Share Snapshot Round extension ${tailRound.id} baseline does not match the canonical tail.`,
    );
  }
}

function validateRoundWrites(input: {
  conversationId: string;
  isAppend: boolean;
  currentMessages: readonly Message[];
  currentRounds: readonly Round[];
  planMessages: readonly Readonly<Message>[];
  planRounds: readonly Readonly<Round>[];
}): readonly RoundExtensionExpectation[] {
  const currentRoundById = new Map(
    input.currentRounds.map((round) => [round.id, round]),
  );
  const existingRoundWrites = input.planRounds.filter((round) =>
    currentRoundById.has(round.id),
  );
  if (existingRoundWrites.length > 1) {
    throw new Error(
      "Share Snapshot canonical plan may extend at most one existing Round.",
    );
  }

  const currentConversationMessages = orderedConversationMessages(
    input.currentMessages,
    input.conversationId,
  );
  const currentConversationRounds = input.currentRounds
    .filter((round) => round.conversationId === input.conversationId)
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
  const orderedPlanMessages = [...input.planMessages].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
  const planMessageIds = new Set(
    orderedPlanMessages.map((message) => message.id),
  );
  const referenceCounts = new Map(
    orderedPlanMessages.map((message) => [message.id, 0]),
  );
  const roundExtensions: RoundExtensionExpectation[] = [];
  let extensionMessageIds: readonly string[] = [];

  const extensionWrite = existingRoundWrites[0];
  if (extensionWrite) {
    const currentExtension = currentRoundById.get(extensionWrite.id);
    const tailRound = currentConversationRounds.at(-1);
    const previousRound = currentConversationRounds.at(-2);
    if (
      !currentExtension ||
      !tailRound ||
      tailRound.id !== currentExtension.id ||
      (previousRound && previousRound.order === tailRound.order)
    ) {
      throw new Error(
        `Share Snapshot Round extension ${extensionWrite.id} is not the canonical tail.`,
      );
    }
    assertRoundTailBaseline(tailRound, currentConversationMessages);
    if (
      !recordsMatchExcept(
        currentExtension as unknown as Record<string, unknown>,
        extensionWrite as unknown as Record<string, unknown>,
        ["answer", "messageIds", "updatedAt"],
      )
    ) {
      throw new Error(
        `Share Snapshot Round extension ${extensionWrite.id} changed preserved fields.`,
      );
    }
    if (currentExtension.answer.trim()) {
      throw new Error(
        `Share Snapshot Round extension ${extensionWrite.id} is already answered.`,
      );
    }
    if (
      extensionWrite.messageIds.length <= currentExtension.messageIds.length ||
      !messageIdsMatch(
        extensionWrite.messageIds.slice(
          0,
          currentExtension.messageIds.length,
        ),
        currentExtension.messageIds,
      )
    ) {
      throw new Error(
        `Share Snapshot Round extension ${extensionWrite.id} changed its baseline membership.`,
      );
    }

    let assistantPrefixLength = 0;
    while (
      orderedPlanMessages[assistantPrefixLength]?.role === "assistant"
    ) {
      assistantPrefixLength += 1;
    }
    const assistantPrefix = orderedPlanMessages.slice(
      0,
      assistantPrefixLength,
    );
    extensionMessageIds = extensionWrite.messageIds.slice(
      currentExtension.messageIds.length,
    );
    if (
      assistantPrefix.length === 0 ||
      !messageIdsMatch(
        extensionMessageIds,
        assistantPrefix.map(({ id }) => id),
      ) ||
      extensionWrite.answer !==
        assistantPrefix.map(({ content }) => content).join("\n\n") ||
      extensionWrite.updatedAt !== assistantPrefix.at(-1)?.updatedAt
    ) {
      throw new Error(
        `Share Snapshot Round extension ${extensionWrite.id} does not match the Assistant suffix.`,
      );
    }
    roundExtensions.push({
      before: currentExtension,
      after: extensionWrite,
    });
  } else if (
    input.isAppend &&
    orderedPlanMessages[0]?.role === "assistant"
  ) {
    throw new Error(
      "Share Snapshot Assistant suffix has no validated Round extension.",
    );
  }

  const newRounds = input.planRounds
    .filter((round) => !currentRoundById.has(round.id))
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
  const firstNewRoundOrder =
    (currentConversationRounds.at(-1)?.order ?? 0) + 1;
  newRounds.forEach((round, index) => {
    if (round.order !== firstNewRoundOrder + index) {
      throw new Error(
        `Share Snapshot new Round ${round.id} does not continue canonical order.`,
      );
    }
    if (
      round.messageIds.length === 0 ||
      round.messageIds.some((messageId) => !planMessageIds.has(messageId))
    ) {
      throw new Error(
        `Share Snapshot new Round ${round.id} must reference only appended Messages.`,
      );
    }
  });

  for (const round of input.planRounds) {
    for (const messageId of round.messageIds) {
      if (!planMessageIds.has(messageId)) continue;
      referenceCounts.set(messageId, (referenceCounts.get(messageId) ?? 0) + 1);
    }
  }
  for (const [messageId, count] of referenceCounts) {
    if (count !== 1) {
      throw new Error(
        `Share Snapshot appended Message ${messageId} must belong to exactly one Round.`,
      );
    }
  }
  if (
    extensionMessageIds.some(
      (messageId) => (referenceCounts.get(messageId) ?? 0) !== 1,
    )
  ) {
    throw new Error(
      "Share Snapshot Round extension membership is not canonical.",
    );
  }

  return roundExtensions;
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
  const referencedByRound = new Map<string, string>();
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
      const previousRoundId = referencedByRound.get(messageId);
      if (previousRoundId) {
        throw new Error(
          `Share Snapshot message ${messageId} is referenced by Rounds ${previousRoundId} and ${round.id}.`,
        );
      }
      referencedByRound.set(messageId, round.id);
      referenceCount += 1;
    }
  }
  for (const message of messages.filter(
    (candidate) => candidate.conversationId === conversationId,
  )) {
    if (!referencedByRound.has(message.id)) {
      throw new Error(
        `Share Snapshot message ${message.id} is not referenced by a Round.`,
      );
    }
  }
  return referenceCount;
}

function validatePlan(
  plan: ShareSnapshotCanonicalPlan,
  current: CanonicalState,
): PlanValidation {
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

  const expectedSources = mergeRecords(current.sources, [plan.source]);
  const { previousSource, preservedSources } = validateIncomingHistory(
    conversationId,
    plan.source,
    current.sources,
    expectedSources,
  );
  const conversationWrite = assertConversationWrite(
    plan.conversation,
    current,
    plan.source,
  );
  const expected: CanonicalState = {
    conversations: mergeRecords(current.conversations, [conversationWrite]),
    sources: expectedSources,
    messages: mergeRecords(current.messages, plan.messages),
    rounds: mergeRecords(current.rounds, plan.rounds),
  };
  if (previousSource) {
    validateSourceLineage(
      conversationId,
      previousSource,
      current.sources,
      current.messages,
      [],
    );
  }
  validateAppendOnlyMessages({
    conversationId,
    source: plan.source,
    previousSource,
    currentMessages: current.messages,
    planMessages: plan.messages,
  });
  validateRoundReferences(
    conversationId,
    current.messages,
    current.rounds,
  );
  const roundExtensions = validateRoundWrites({
    conversationId,
    isAppend: Boolean(previousSource),
    currentMessages: current.messages,
    currentRounds: current.rounds,
    planMessages: plan.messages,
    planRounds: plan.rounds,
  });
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

  return {
    conversationWrite,
    expected,
    sourceMessageCount,
    referencedMessageCount,
    preservedSources,
    roundExtensions,
  };
}

function recordsMatch<T extends { id: string }>(
  actual: readonly T[],
  expected: readonly T[],
): boolean {
  if (actual.length !== expected.length) return false;
  const actualById = new Map(actual.map((record) => [record.id, record]));
  return expected.every((record) => {
    const candidate = actualById.get(record.id);
    return Boolean(candidate && valuesEqual(candidate, record));
  });
}

function verifyReloadedState(
  plan: ShareSnapshotCanonicalPlan,
  expected: CanonicalState,
  sourceMessageCount: number,
  referencedMessageCount: number,
  preservedSources: readonly Readonly<ImportedSource>[],
  roundExtensions: readonly RoundExtensionExpectation[],
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
    !valuesEqual(source.shareSnapshot, plan.source.shareSnapshot)
  ) {
    throw new Error(
      `Share Snapshot source ${sourceId} metadata verification failed.`,
    );
  }
  for (const preservedSource of preservedSources) {
    const actualSource = actual.sources.find(
      ({ id }) => id === preservedSource.id,
    );
    if (!actualSource || !valuesEqual(actualSource, preservedSource)) {
      throw new Error(
        `Share Snapshot immutable source ${preservedSource.id} changed after write.`,
      );
    }
  }
  for (const extension of roundExtensions) {
    const actualRound = actual.rounds.find(
      ({ id }) => id === extension.after.id,
    );
    if (
      !actualRound ||
      !valuesEqual(actualRound, extension.after) ||
      !recordsMatchExcept(
        extension.before as unknown as Record<string, unknown>,
        actualRound as unknown as Record<string, unknown>,
        ["answer", "messageIds", "updatedAt"],
      )
    ) {
      throw new Error(
        `Share Snapshot Round extension ${extension.after.id} preservation verification failed.`,
      );
    }
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
    messageOwnershipVerified: true,
    referencesVerified: true,
    immutableRecordsPreserved: true,
    roundExtensionPreserved: true,
    pendingWriteCount: 0,
  };
}

async function readCanonicalState(): Promise<CanonicalState> {
  const database = await openPalosDB();
  return new Promise<CanonicalState>((resolve, reject) => {
    const transaction = database.transaction(
      ["conversations", "sources", "messages", "rounds"],
      "readonly",
    );
    const conversations = transaction
      .objectStore("conversations")
      .getAll() as IDBRequest<Conversation[]>;
    const sources = transaction
      .objectStore("sources")
      .getAll() as IDBRequest<ImportedSource[]>;
    const messages = transaction
      .objectStore("messages")
      .getAll() as IDBRequest<Message[]>;
    const rounds = transaction
      .objectStore("rounds")
      .getAll() as IDBRequest<Round[]>;
    transaction.oncomplete = () => {
      resolve({
        conversations: conversations.result,
        sources: sources.result,
        messages: messages.result,
        rounds: rounds.result,
      });
    };
    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Share Snapshot canonical validation read failed."),
      );
    };
    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Share Snapshot canonical validation read aborted."),
      );
    };
  });
}

export async function executeShareSnapshotCanonicalOperation(
  plan: ShareSnapshotCanonicalPlan,
): Promise<ShareSnapshotCanonicalOperationResult> {
  await drainPendingWritesOrThrow();
  if (getPendingWriteCount() !== 0) {
    throw new Error("Share Snapshot write barrier did not drain pending writes.");
  }

  const current = await readCanonicalState();
  const {
    expected,
    conversationWrite,
    sourceMessageCount,
    referencedMessageCount,
    preservedSources,
    roundExtensions,
  } = validatePlan(plan, current);
  const batch: StoreBatch = {
    conversations: [conversationWrite],
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
    preservedSources,
    roundExtensions,
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
