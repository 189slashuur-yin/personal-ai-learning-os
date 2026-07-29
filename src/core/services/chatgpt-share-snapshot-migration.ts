import {
  isChatGPTShareSnapshotMetadata,
  isLegacyChatGPTShareSnapshotMetadata,
  type AnyChatGPTShareSnapshotMetadata,
  type ImportedSource,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import {
  CHATGPT_SHARE_SNAPSHOT_HASH_ALGORITHM,
  hashChatGPTShareSnapshot,
} from "@/core/services/chatgpt-share-snapshot-comparator";
import { parseChatGPTShareSnapshot } from "@/core/services/chatgpt-share-snapshot-parser";
import {
  identifyChatGPTShareUrl,
  normalizeChatGPTShareUrl,
} from "@/core/services/chatgpt-share-snapshot-url";

export const legacyShareSnapshotMigrationBlockedReasons = [
  "invalid-legacy-metadata",
  "invalid-url-normalization",
  "unsupported-hash-algorithm",
  "missing-source-ownership",
  "broken-source-ordinal",
  "message-provenance-mismatch",
  "canonical-transcript-mismatch",
  "resource-hash-collision",
  "resource-history-conflict",
] as const;

export type LegacyShareSnapshotMigrationBlockedReason =
  (typeof legacyShareSnapshotMigrationBlockedReasons)[number];

export type LegacyShareSnapshotMigrationInput = Readonly<{
  source: Readonly<ImportedSource>;
  messages: readonly Readonly<Message>[];
  sources: readonly Readonly<ImportedSource>[];
}>;

export type LegacyShareSnapshotMigrationResult =
  | Readonly<{
      status: "migrated";
      source: Readonly<ImportedSource>;
    }>
  | Readonly<{
      status: "noop";
      source: Readonly<ImportedSource>;
    }>
  | Readonly<{
      status: "blocked";
      reason: LegacyShareSnapshotMigrationBlockedReason;
      error: string;
    }>;

function blocked(
  reason: LegacyShareSnapshotMigrationBlockedReason,
  error: string,
): LegacyShareSnapshotMigrationResult {
  return { status: "blocked", reason, error };
}

function validateCommonMetadata(
  source: Readonly<ImportedSource>,
  metadata: AnyChatGPTShareSnapshotMetadata,
): LegacyShareSnapshotMigrationResult | null {
  if (!source.id.trim()) {
    return blocked(
      "invalid-legacy-metadata",
      "Legacy Share Snapshot Source ID is required.",
    );
  }
  if (!source.conversationId?.trim()) {
    return blocked(
      "missing-source-ownership",
      `Source ${source.id} has no owning Conversation.`,
    );
  }
  if (metadata.hashAlgorithm !== CHATGPT_SHARE_SNAPSHOT_HASH_ALGORITHM) {
    return blocked(
      "unsupported-hash-algorithm",
      `Source ${source.id} uses unsupported hash algorithm ${String(metadata.hashAlgorithm)}.`,
    );
  }
  if (
    !metadata.snapshotHash?.trim() ||
    !Number.isSafeInteger(metadata.snapshotMessageCount) ||
    metadata.snapshotMessageCount < 1 ||
    !metadata.capturedAt?.trim() ||
    Number.isNaN(Date.parse(metadata.capturedAt)) ||
    !metadata.parserVersion?.trim() ||
    (metadata.inputKind !== "saved-html" &&
      metadata.inputKind !== "pasted-text")
  ) {
    return blocked(
      "invalid-legacy-metadata",
      `Source ${source.id} contains invalid Share Snapshot metadata.`,
    );
  }
  return null;
}

async function resourceHashOf(
  source: Readonly<ImportedSource>,
): Promise<string | null> {
  if (isChatGPTShareSnapshotMetadata(source.shareSnapshot)) {
    return source.shareSnapshot.resourceHash.trim() || null;
  }
  if (!isLegacyChatGPTShareSnapshotMetadata(source.shareSnapshot)) {
    return null;
  }
  try {
    return (
      await identifyChatGPTShareUrl(source.shareSnapshot.normalizedShareUrl)
    ).resourceHash;
  } catch {
    return null;
  }
}

async function validateResourceUniqueness(input: {
  source: Readonly<ImportedSource>;
  sources: readonly Readonly<ImportedSource>[];
  resourceHash: string;
  allowSameConversationHistory?: boolean;
}): Promise<LegacyShareSnapshotMigrationResult | null> {
  const ownerId = input.source.conversationId as string;
  for (const candidate of input.sources) {
    if (
      candidate.id === input.source.id &&
      candidate.conversationId === ownerId
    ) {
      continue;
    }
    const candidateHash = await resourceHashOf(candidate);
    if (candidateHash !== input.resourceHash) continue;
    if (candidate.conversationId !== ownerId) {
      return blocked(
        "resource-hash-collision",
        `Share resource is already owned by Conversation ${candidate.conversationId ?? "unknown"}.`,
      );
    }
    if (input.allowSameConversationHistory) continue;
    return blocked(
      "resource-history-conflict",
      `Source ${input.source.id} cannot fabricate history beside Source ${candidate.id}.`,
    );
  }
  return null;
}

async function validateLegacyCanonicalProjection(input: {
  source: Readonly<ImportedSource>;
  messages: readonly Readonly<Message>[];
  metadata: NonNullable<ImportedSource["shareSnapshot"]>;
}): Promise<LegacyShareSnapshotMigrationResult | null> {
  const conversationId = input.source.conversationId as string;
  const crossOwned = input.messages.find(
    (message) =>
      message.sourceId === input.source.id &&
      message.conversationId !== conversationId,
  );
  if (crossOwned) {
    return blocked(
      "missing-source-ownership",
      `Message ${crossOwned.id} references Source ${input.source.id} across Conversations.`,
    );
  }

  const canonicalMessages = input.messages
    .filter((message) => message.conversationId === conversationId)
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
  const ids = new Set<string>();
  for (const [index, message] of canonicalMessages.entries()) {
    if (
      ids.has(message.id) ||
      message.sourceOrdinal !== index ||
      (index > 0 &&
        message.order !== canonicalMessages[index - 1].order + 1)
    ) {
      return blocked(
        "broken-source-ordinal",
        `Source ${input.source.id} has a broken canonical sourceOrdinal at Message ${message.id}.`,
      );
    }
    ids.add(message.id);
    if (message.sourceId !== input.source.id) {
      return blocked(
        "message-provenance-mismatch",
        `Message ${message.id} is not attributed to legacy Source ${input.source.id}.`,
      );
    }
  }

  const parsed = parseChatGPTShareSnapshot({
    kind: "pasted-text",
    content: input.source.content,
  });
  if (
    parsed.errors.length > 0 ||
    parsed.messages.length === 0 ||
    parsed.messages.length !== input.metadata.snapshotMessageCount ||
    canonicalMessages.length !== parsed.messages.length
  ) {
    return blocked(
      "canonical-transcript-mismatch",
      `Source ${input.source.id} transcript count does not match canonical Messages.`,
    );
  }
  for (const [index, parsedMessage] of parsed.messages.entries()) {
    const canonicalMessage = canonicalMessages[index];
    if (
      canonicalMessage.role !== parsedMessage.role ||
      canonicalMessage.content !== parsedMessage.content
    ) {
      return blocked(
        "canonical-transcript-mismatch",
        `Source ${input.source.id} transcript diverges at ordinal ${index}.`,
      );
    }
  }
  const snapshotHash = await hashChatGPTShareSnapshot(parsed.messages);
  if (snapshotHash !== input.metadata.snapshotHash) {
    return blocked(
      "canonical-transcript-mismatch",
      `Source ${input.source.id} snapshot hash does not match its canonical transcript.`,
    );
  }
  return null;
}

export async function migrateLegacyMutableShareSnapshotSource(
  input: LegacyShareSnapshotMigrationInput,
): Promise<LegacyShareSnapshotMigrationResult> {
  const { source, messages, sources } = input;
  const metadata = source.shareSnapshot;
  if (isChatGPTShareSnapshotMetadata(metadata)) {
    const invalidMetadata = validateCommonMetadata(source, metadata);
    if (invalidMetadata) return invalidMetadata;
    if (
      !metadata.resourceHash.trim() ||
      !Number.isSafeInteger(metadata.snapshotSequence) ||
      metadata.snapshotSequence < 1 ||
      (metadata.snapshotSequence === 1 &&
        metadata.previousSnapshotSourceId !== undefined) ||
      (metadata.snapshotSequence > 1 &&
        !metadata.previousSnapshotSourceId?.trim())
    ) {
      return blocked(
        "invalid-legacy-metadata",
        `Source ${source.id} contains invalid immutable Snapshot metadata.`,
      );
    }
    const collision = await validateResourceUniqueness({
      source,
      sources,
      resourceHash: metadata.resourceHash,
      allowSameConversationHistory: true,
    });
    return collision ?? { status: "noop", source };
  }
  if (!isLegacyChatGPTShareSnapshotMetadata(metadata)) {
    return blocked(
      "invalid-legacy-metadata",
      `Source ${source.id} is not a supported legacy Share Snapshot.`,
    );
  }

  const invalidMetadata = validateCommonMetadata(source, metadata);
  if (invalidMetadata) return invalidMetadata;

  let normalizedUrl: string;
  let resourceHash: string;
  try {
    normalizedUrl = normalizeChatGPTShareUrl(metadata.normalizedShareUrl);
    resourceHash = (
      await identifyChatGPTShareUrl(metadata.normalizedShareUrl)
    ).resourceHash;
  } catch {
    return blocked(
      "invalid-url-normalization",
      `Source ${source.id} contains an invalid legacy Share URL.`,
    );
  }
  const shareId = normalizedUrl.split("/").at(-1);
  if (
    normalizedUrl !== metadata.normalizedShareUrl.trim() ||
    shareId !== metadata.shareId
  ) {
    return blocked(
      "invalid-url-normalization",
      `Source ${source.id} legacy URL and shareId are not canonically normalized.`,
    );
  }

  const collision = await validateResourceUniqueness({
    source,
    sources,
    resourceHash,
  });
  if (collision) return collision;
  const invalidProjection = await validateLegacyCanonicalProjection({
    source,
    messages,
    metadata,
  });
  if (invalidProjection) return invalidProjection;

  return {
    status: "migrated",
    source: {
      ...source,
      shareSnapshot: {
        schemaVersion: 2,
        resourceHash,
        snapshotHash: metadata.snapshotHash,
        snapshotMessageCount: metadata.snapshotMessageCount,
        capturedAt: metadata.capturedAt,
        parserVersion: metadata.parserVersion,
        inputKind: metadata.inputKind,
        hashAlgorithm: CHATGPT_SHARE_SNAPSHOT_HASH_ALGORITHM,
        snapshotSequence: 1,
      },
    },
  };
}
