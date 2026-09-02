import {
  isChatGPTShareSnapshotMetadata,
  isLegacyChatGPTShareSnapshotMetadata,
  type ImportedSource,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import {
  compareChatGPTShareSnapshot,
  type ChatGPTShareSnapshotComparisonStatus,
} from "@/core/services/chatgpt-share-snapshot-comparator";
import {
  resolveChatGPTShareSnapshotHistory,
  type ShareSnapshotHistoryBlockedReason,
} from "@/core/services/chatgpt-share-snapshot-history";
import {
  parseChatGPTShareSnapshot,
  type ChatGPTShareSnapshotMessageDraft,
} from "@/core/services/chatgpt-share-snapshot-parser";

export type ChatGPTShareSnapshotHistoryView =
  | Readonly<{
      status: "empty";
      legacySnapshotCount: number;
    }>
  | Readonly<{
      status: "valid";
      resourceHash: string;
      chain: readonly Readonly<ImportedSource>[];
      head: Readonly<ImportedSource>;
    }>
  | Readonly<{
      status: "blocked";
      reason:
        | ShareSnapshotHistoryBlockedReason
        | "multiple-resource-histories"
        | "invalid-sequence";
      sourceIds: readonly string[];
    }>;

export type ChatGPTShareSnapshotHistoryDiffStatus =
  | "initial"
  | "same"
  | "append"
  | "blocked"
  | "invalid";

export type ChatGPTShareSnapshotHistoryDiff = Readonly<{
  status: ChatGPTShareSnapshotHistoryDiffStatus;
  beforeSourceId: string | null;
  afterSourceId: string;
  existingMessageCount: number;
  snapshotMessageCount: number;
  commonPrefixCount: number;
  addedMessages: readonly Readonly<ChatGPTShareSnapshotMessageDraft>[];
  addedAssistantMessages: readonly Readonly<ChatGPTShareSnapshotMessageDraft>[];
  addedUserMessages: readonly Readonly<ChatGPTShareSnapshotMessageDraft>[];
  comparisonStatus?: ChatGPTShareSnapshotComparisonStatus;
  error?: string;
}>;

function invalidDiff(input: {
  beforeSourceId: string | null;
  afterSourceId: string;
  error: string;
}): ChatGPTShareSnapshotHistoryDiff {
  return {
    status: "invalid",
    beforeSourceId: input.beforeSourceId,
    afterSourceId: input.afterSourceId,
    existingMessageCount: 0,
    snapshotMessageCount: 0,
    commonPrefixCount: 0,
    addedMessages: [],
    addedAssistantMessages: [],
    addedUserMessages: [],
    error: input.error,
  };
}

function parseStoredSnapshot(source: Readonly<ImportedSource>) {
  const metadata = source.shareSnapshot;
  if (!isChatGPTShareSnapshotMetadata(metadata)) {
    return {
      status: "invalid" as const,
      error: `Source ${source.id} is not an immutable Conversation Snapshot.`,
    };
  }

  const parsed = parseChatGPTShareSnapshot({
    kind: "pasted-text",
    content: source.content,
  });
  if (parsed.errors.length > 0 || parsed.messages.length === 0) {
    return {
      status: "invalid" as const,
      error:
        parsed.errors.join(" ") ||
        `Snapshot Source ${source.id} has no readable transcript.`,
    };
  }
  if (parsed.messages.length !== metadata.snapshotMessageCount) {
    return {
      status: "invalid" as const,
      error: `Snapshot Source ${source.id} contains ${parsed.messages.length} Messages; metadata expects ${metadata.snapshotMessageCount}.`,
    };
  }

  return { status: "valid" as const, messages: parsed.messages };
}

function completedDiff(input: {
  status: "initial" | "same" | "append";
  beforeSourceId: string | null;
  afterSourceId: string;
  existingMessageCount: number;
  snapshotMessageCount: number;
  commonPrefixCount: number;
  addedMessages: readonly Readonly<ChatGPTShareSnapshotMessageDraft>[];
  comparisonStatus?: ChatGPTShareSnapshotComparisonStatus;
}): ChatGPTShareSnapshotHistoryDiff {
  return {
    ...input,
    addedAssistantMessages: input.addedMessages.filter(
      ({ role }) => role === "assistant",
    ),
    addedUserMessages: input.addedMessages.filter(
      ({ role }) => role === "user",
    ),
  };
}

export function inspectChatGPTShareSnapshotHistory(input: Readonly<{
  conversationId: string;
  sources: readonly Readonly<ImportedSource>[];
}>): ChatGPTShareSnapshotHistoryView {
  const conversationSnapshots = input.sources.filter(
    (source) =>
      source.conversationId === input.conversationId &&
      isChatGPTShareSnapshotMetadata(source.shareSnapshot),
  );
  const legacySnapshotCount = input.sources.filter(
    (source) =>
      source.conversationId === input.conversationId &&
      isLegacyChatGPTShareSnapshotMetadata(source.shareSnapshot),
  ).length;

  if (conversationSnapshots.length === 0) {
    return { status: "empty", legacySnapshotCount };
  }

  const resourceHashes = new Set(
    conversationSnapshots.flatMap((source) =>
      isChatGPTShareSnapshotMetadata(source.shareSnapshot)
        ? [source.shareSnapshot.resourceHash]
        : [],
    ),
  );
  if (resourceHashes.size !== 1) {
    return {
      status: "blocked",
      reason: "multiple-resource-histories",
      sourceIds: conversationSnapshots.map(({ id }) => id),
    };
  }

  const resourceHash = [...resourceHashes][0];
  if (typeof resourceHash !== "string") {
    return {
      status: "blocked",
      reason: "multiple-resource-histories",
      sourceIds: conversationSnapshots.map(({ id }) => id),
    };
  }
  const resolved = resolveChatGPTShareSnapshotHistory({
    conversationId: input.conversationId,
    resourceHash,
    sources: input.sources,
  });
  if (resolved.status === "blocked") return resolved;
  if (!resolved.head) {
    return { status: "empty", legacySnapshotCount };
  }

  const invalidSequences = resolved.chain.filter((source, index) => {
    const metadata = source.shareSnapshot;
    return (
      !isChatGPTShareSnapshotMetadata(metadata) ||
      metadata.snapshotSequence !== index + 1
    );
  });
  if (invalidSequences.length > 0) {
    return {
      status: "blocked",
      reason: "invalid-sequence",
      sourceIds: invalidSequences.map(({ id }) => id),
    };
  }

  return {
    status: "valid",
    resourceHash,
    chain: resolved.chain,
    head: resolved.head,
  };
}

export function compareChatGPTShareSnapshotHistoryEntries(input: Readonly<{
  history: ChatGPTShareSnapshotHistoryView;
  canonicalMessages: readonly Readonly<Message>[];
  beforeSourceId: string | null;
  afterSourceId: string;
}>): ChatGPTShareSnapshotHistoryDiff {
  if (input.history.status !== "valid") {
    return invalidDiff({
      beforeSourceId: input.beforeSourceId,
      afterSourceId: input.afterSourceId,
      error: "Conversation Snapshot history is not available for comparison.",
    });
  }

  const afterIndex = input.history.chain.findIndex(
    ({ id }) => id === input.afterSourceId,
  );
  const beforeIndex = input.beforeSourceId
    ? input.history.chain.findIndex(({ id }) => id === input.beforeSourceId)
    : -1;
  if (
    afterIndex < 0 ||
    (input.beforeSourceId !== null && beforeIndex < 0) ||
    beforeIndex > afterIndex
  ) {
    return invalidDiff({
      beforeSourceId: input.beforeSourceId,
      afterSourceId: input.afterSourceId,
      error: "Choose a comparison baseline at or before the selected Snapshot.",
    });
  }

  const afterSource = input.history.chain[afterIndex];
  const parsedAfter = parseStoredSnapshot(afterSource);
  if (parsedAfter.status === "invalid") {
    return invalidDiff({
      beforeSourceId: input.beforeSourceId,
      afterSourceId: input.afterSourceId,
      error: parsedAfter.error,
    });
  }

  if (!input.beforeSourceId) {
    return completedDiff({
      status: "initial",
      beforeSourceId: null,
      afterSourceId: input.afterSourceId,
      existingMessageCount: 0,
      snapshotMessageCount: parsedAfter.messages.length,
      commonPrefixCount: 0,
      addedMessages: parsedAfter.messages,
    });
  }
  if (input.beforeSourceId === input.afterSourceId) {
    return completedDiff({
      status: "same",
      beforeSourceId: input.beforeSourceId,
      afterSourceId: input.afterSourceId,
      existingMessageCount: parsedAfter.messages.length,
      snapshotMessageCount: parsedAfter.messages.length,
      commonPrefixCount: parsedAfter.messages.length,
      addedMessages: [],
      comparisonStatus: "same",
    });
  }

  const beforeSource = input.history.chain[beforeIndex];
  const beforeMetadata = beforeSource.shareSnapshot;
  if (!isChatGPTShareSnapshotMetadata(beforeMetadata)) {
    return invalidDiff({
      beforeSourceId: input.beforeSourceId,
      afterSourceId: input.afterSourceId,
      error: `Source ${beforeSource.id} has invalid Snapshot metadata.`,
    });
  }
  const baselineMessages = input.canonicalMessages.filter(
    (message) =>
      message.conversationId === beforeSource.conversationId &&
      typeof message.sourceOrdinal === "number" &&
      message.sourceOrdinal < beforeMetadata.snapshotMessageCount,
  );
  const comparison = compareChatGPTShareSnapshot({
    headSource: beforeSource,
    canonicalMessages: baselineMessages,
    snapshotMessages: parsedAfter.messages,
    incomingSnapshotHash:
      isChatGPTShareSnapshotMetadata(afterSource.shareSnapshot)
        ? afterSource.shareSnapshot.snapshotHash
        : "",
  });

  if (comparison.status === "same" || comparison.status === "append") {
    return completedDiff({
      status: comparison.status,
      beforeSourceId: input.beforeSourceId,
      afterSourceId: input.afterSourceId,
      existingMessageCount: comparison.existingMessageCount,
      snapshotMessageCount: comparison.snapshotMessageCount,
      commonPrefixCount: comparison.commonPrefixCount,
      addedMessages: comparison.suffixMessages,
      comparisonStatus: comparison.status,
    });
  }

  return {
    status: comparison.status === "invalid" ? "invalid" : "blocked",
    beforeSourceId: input.beforeSourceId,
    afterSourceId: input.afterSourceId,
    existingMessageCount: comparison.existingMessageCount,
    snapshotMessageCount: comparison.snapshotMessageCount,
    commonPrefixCount: comparison.commonPrefixCount,
    addedMessages: [],
    addedAssistantMessages: [],
    addedUserMessages: [],
    comparisonStatus: comparison.status,
    error:
      comparison.invalidReason ??
      `Stored Snapshot comparison stopped at Message ${comparison.estimatedDivergenceOrdinal ?? comparison.commonPrefixCount}.`,
  };
}

export function defaultChatGPTShareSnapshotHistorySelection(
  history: ChatGPTShareSnapshotHistoryView,
): Readonly<{ beforeSourceId: string | null; afterSourceId: string | null }> {
  if (history.status !== "valid") {
    return { beforeSourceId: null, afterSourceId: null };
  }
  const after = history.chain.at(-1) ?? null;
  const before = history.chain.at(-2) ?? null;
  return {
    beforeSourceId: before?.id ?? null,
    afterSourceId: after?.id ?? null,
  };
}
