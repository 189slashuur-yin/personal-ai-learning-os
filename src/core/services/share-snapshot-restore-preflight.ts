import type { Conversation } from "@/core/entities/conversation";
import {
  isChatGPTShareSnapshotMetadata,
  type ChatGPTShareSnapshotMetadata,
  type ImportedSource,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import {
  CHATGPT_SHARE_SNAPSHOT_HASH_ALGORITHM,
  hashChatGPTShareSnapshot,
} from "@/core/services/chatgpt-share-snapshot-comparator";
import { resolveChatGPTShareSnapshotHistory } from "@/core/services/chatgpt-share-snapshot-history";
import {
  renderChatGPTShareSnapshotTranscript,
} from "@/core/services/chatgpt-share-snapshot-import";
import {
  parseChatGPTShareSnapshot,
  type ChatGPTShareSnapshotMessageDraft,
} from "@/core/services/chatgpt-share-snapshot-parser";
import { requireShareSnapshotTimestampSemantics } from "@/core/services/share-snapshot-timestamp-semantics";

export type ShareSnapshotRestorePreflight =
  | Readonly<{
      status: "not-applicable";
      snapshotSourceCount: 0;
      resourceCount: 0;
    }>
  | Readonly<{
      status: "valid";
      snapshotSourceCount: number;
      resourceCount: number;
    }>
  | Readonly<{
      status: "blocked";
      snapshotSourceCount: number;
      resourceCount: number;
      reasons: readonly string[];
    }>;

export type ShareSnapshotRestorePreflightInput = Readonly<{
  conversations?: readonly Conversation[];
  sources?: readonly ImportedSource[];
  messages?: readonly Message[];
  rounds?: readonly Round[];
}>;

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

function hasSnapshotMetadata(source: Readonly<ImportedSource>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(source, "shareSnapshot") &&
    source.shareSnapshot !== undefined
  );
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireSnapshotMetadata(
  source: Readonly<ImportedSource>,
  validationTime: number,
): ChatGPTShareSnapshotMetadata {
  const metadata = source.shareSnapshot;
  if (!isChatGPTShareSnapshotMetadata(metadata)) {
    throw new Error(
      `Snapshot Source ${source.id} must use schemaVersion 2 metadata; automatic migration is not allowed.`,
    );
  }
  if (!SHA256_HEX_PATTERN.test(metadata.resourceHash)) {
    throw new Error(
      `Snapshot Source ${source.id} has an invalid resourceHash.`,
    );
  }
  if (!SHA256_HEX_PATTERN.test(metadata.snapshotHash)) {
    throw new Error(
      `Snapshot Source ${source.id} has an invalid snapshotHash.`,
    );
  }
  requireShareSnapshotTimestampSemantics(source, metadata, validationTime);
  requireNonEmptyString(
    metadata.parserVersion,
    `Snapshot Source ${source.id} parserVersion`,
  );
  if (
    metadata.inputKind !== "saved-html" &&
    metadata.inputKind !== "pasted-text"
  ) {
    throw new Error(
      `Snapshot Source ${source.id} has an invalid inputKind.`,
    );
  }
  if (metadata.hashAlgorithm !== CHATGPT_SHARE_SNAPSHOT_HASH_ALGORITHM) {
    throw new Error(
      `Snapshot Source ${source.id} has an unsupported hashAlgorithm.`,
    );
  }
  if (
    !Number.isSafeInteger(metadata.snapshotMessageCount) ||
    metadata.snapshotMessageCount < 1
  ) {
    throw new Error(
      `Snapshot Source ${source.id} has an invalid snapshotMessageCount.`,
    );
  }
  if (
    !Number.isSafeInteger(metadata.snapshotSequence) ||
    metadata.snapshotSequence < 1
  ) {
    throw new Error(
      `Snapshot Source ${source.id} has an invalid snapshotSequence.`,
    );
  }
  if (
    metadata.snapshotSequence === 1 &&
    metadata.previousSnapshotSourceId !== undefined
  ) {
    throw new Error(
      `Snapshot Source ${source.id} sequence 1 cannot have previousSnapshotSourceId.`,
    );
  }
  if (
    metadata.snapshotSequence > 1 &&
    (typeof metadata.previousSnapshotSourceId !== "string" ||
      !metadata.previousSnapshotSourceId.trim())
  ) {
    throw new Error(
      `Snapshot Source ${source.id} is missing previousSnapshotSourceId.`,
    );
  }
  return metadata;
}

function draftsMatch(
  left: readonly Pick<ChatGPTShareSnapshotMessageDraft, "role" | "content">[],
  right: readonly Pick<ChatGPTShareSnapshotMessageDraft, "role" | "content">[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (message, index) =>
        message.role === right[index]?.role &&
        message.content === right[index]?.content,
    )
  );
}

function expectedSourceIdForOrdinal(
  chain: readonly Readonly<ImportedSource>[],
  ordinal: number,
): string | null {
  let previousCount = 0;
  for (const source of chain) {
    const metadata = source.shareSnapshot as ChatGPTShareSnapshotMetadata;
    if (
      ordinal >= previousCount &&
      ordinal < metadata.snapshotMessageCount
    ) {
      return source.id;
    }
    previousCount = metadata.snapshotMessageCount;
  }
  return null;
}

async function validateResourceHistory(input: {
  resourceHash: string;
  sources: readonly ImportedSource[];
  conversations: readonly Conversation[];
  messages: readonly Message[];
  rounds: readonly Round[];
  validationTime: number;
}): Promise<void> {
  const resourceSources = input.sources.filter(
    (source) =>
      isChatGPTShareSnapshotMetadata(source.shareSnapshot) &&
      source.shareSnapshot.resourceHash === input.resourceHash,
  );
  const ownerIds = new Set(
    resourceSources.map((source) =>
      requireNonEmptyString(
        source.conversationId,
        `Snapshot Source ${source.id} conversationId`,
      ),
    ),
  );
  if (ownerIds.size !== 1) {
    throw new Error(
      `Snapshot resourceHash collision ${input.resourceHash}: Sources belong to multiple Conversations.`,
    );
  }
  const conversationId = [...ownerIds][0];
  if (!input.conversations.some(({ id }) => id === conversationId)) {
    throw new Error(
      `Snapshot resource ${input.resourceHash} references missing Conversation ${conversationId}.`,
    );
  }

  const history = resolveChatGPTShareSnapshotHistory({
    conversationId,
    resourceHash: input.resourceHash,
    sources: input.sources,
  });
  if (history.status === "blocked") {
    throw new Error(
      `Snapshot resource ${input.resourceHash} lineage is blocked: ${history.reason}.`,
    );
  }
  if (!history.head || history.chain.length !== resourceSources.length) {
    throw new Error(
      `Snapshot resource ${input.resourceHash} has no unique complete head.`,
    );
  }

  const parsedBySourceId = new Map<
    string,
    readonly ChatGPTShareSnapshotMessageDraft[]
  >();
  let previousMessages: readonly ChatGPTShareSnapshotMessageDraft[] = [];
  let previousMessageCount = 0;
  let previousCapturedAt: number | null = null;
  for (const [index, source] of history.chain.entries()) {
    const metadata = requireSnapshotMetadata(source, input.validationTime);
    const capturedAt = Date.parse(metadata.capturedAt);
    if (
      previousCapturedAt !== null &&
      capturedAt < previousCapturedAt
    ) {
      throw new Error(
        `Snapshot Source ${source.id} capturedAt precedes its lineage predecessor.`,
      );
    }
    if (metadata.snapshotSequence !== index + 1) {
      throw new Error(
        `Snapshot Source ${source.id} sequence ${metadata.snapshotSequence} is not continuous.`,
      );
    }
    const expectedPreviousId = history.chain[index - 1]?.id;
    if (metadata.previousSnapshotSourceId !== expectedPreviousId) {
      throw new Error(
        `Snapshot Source ${source.id} previousSnapshotSourceId is invalid.`,
      );
    }
    if (metadata.snapshotMessageCount <= previousMessageCount) {
      throw new Error(
        `Snapshot Source ${source.id} message count does not extend its predecessor.`,
      );
    }
    if (typeof source.content !== "string" || !source.content.trim()) {
      throw new Error(
        `Snapshot Source ${source.id} has no normalized transcript.`,
      );
    }
    const parsed = parseChatGPTShareSnapshot({
      kind: "pasted-text",
      content: source.content,
    });
    if (parsed.errors.length > 0 || parsed.messages.length === 0) {
      throw new Error(
        `Snapshot Source ${source.id} transcript cannot be parsed.`,
      );
    }
    if (
      renderChatGPTShareSnapshotTranscript(parsed.messages) !== source.content
    ) {
      throw new Error(
        `Snapshot Source ${source.id} transcript is not canonical.`,
      );
    }
    if (parsed.messages.length !== metadata.snapshotMessageCount) {
      throw new Error(
        `Snapshot Source ${source.id} transcript count does not match metadata.`,
      );
    }
    if (
      (await hashChatGPTShareSnapshot(parsed.messages)) !==
      metadata.snapshotHash
    ) {
      throw new Error(
        `Snapshot Source ${source.id} transcript does not match snapshotHash.`,
      );
    }
    if (
      !draftsMatch(
        parsed.messages.slice(0, previousMessages.length),
        previousMessages,
      )
    ) {
      throw new Error(
        `Snapshot Source ${source.id} transcript diverges from its predecessor.`,
      );
    }
    parsedBySourceId.set(source.id, parsed.messages);
    previousMessages = parsed.messages;
    previousMessageCount = metadata.snapshotMessageCount;
    previousCapturedAt = capturedAt;
  }

  const headMetadata =
    history.head.shareSnapshot as ChatGPTShareSnapshotMetadata;
  const headMessages = parsedBySourceId.get(history.head.id);
  if (!headMessages) {
    throw new Error(
      `Snapshot resource ${input.resourceHash} head transcript is unavailable.`,
    );
  }
  for (const source of history.chain) {
    const metadata = source.shareSnapshot as ChatGPTShareSnapshotMetadata;
    const parsed = parsedBySourceId.get(source.id);
    if (
      !parsed ||
      !draftsMatch(
        parsed,
        headMessages.slice(0, metadata.snapshotMessageCount),
      )
    ) {
      throw new Error(
        `Snapshot Source ${source.id} is not a prefix of the head transcript.`,
      );
    }
  }

  const historySourceIds = new Set(history.chain.map(({ id }) => id));
  const crossOwnedMessage = input.messages.find(
    (message) =>
      message.sourceId &&
      historySourceIds.has(message.sourceId) &&
      message.conversationId !== conversationId,
  );
  if (crossOwnedMessage) {
    throw new Error(
      `Snapshot Message ${crossOwnedMessage.id} does not belong to Conversation ${conversationId}.`,
    );
  }
  const conversationMessages = input.messages
    .filter((message) => message.conversationId === conversationId)
    .sort(
      (left, right) =>
        (left.sourceOrdinal ?? -1) - (right.sourceOrdinal ?? -1) ||
        left.id.localeCompare(right.id),
    );
  if (conversationMessages.length !== headMetadata.snapshotMessageCount) {
    throw new Error(
      `Snapshot Conversation ${conversationId} Message count does not match the head transcript.`,
    );
  }
  const ordinalSet = new Set<number>();
  for (const [index, message] of conversationMessages.entries()) {
    if (
      !Number.isSafeInteger(message.sourceOrdinal) ||
      message.sourceOrdinal !== index ||
      ordinalSet.has(message.sourceOrdinal)
    ) {
      throw new Error(
        `Snapshot Message ${message.id} has broken sourceOrdinal provenance.`,
      );
    }
    ordinalSet.add(message.sourceOrdinal);
    const expectedSourceId = expectedSourceIdForOrdinal(history.chain, index);
    if (
      !message.sourceId ||
      message.sourceId !== expectedSourceId ||
      !historySourceIds.has(message.sourceId)
    ) {
      throw new Error(
        `Snapshot Message ${message.id} has broken sourceId provenance.`,
      );
    }
    if (message.order !== index) {
      throw new Error(
        `Snapshot Message ${message.id} order is inconsistent with its transcript ordinal.`,
      );
    }
    const expectedMessage = headMessages[index];
    if (
      (message.role !== "user" && message.role !== "assistant") ||
      message.role !== expectedMessage?.role ||
      message.content !== expectedMessage.content
    ) {
      throw new Error(
        `Snapshot Message ${message.id} is inconsistent with the head transcript.`,
      );
    }
  }

  const messageById = new Map(input.messages.map((message) => [message.id, message]));
  const snapshotMessageIds = new Set(
    conversationMessages.map((message) => message.id),
  );
  const roundMembership = new Map(
    conversationMessages.map(({ id }) => [id, 0]),
  );
  for (const round of input.rounds) {
    if (!Array.isArray(round.messageIds)) {
      throw new Error(`Snapshot Round ${round.id} has invalid messageIds.`);
    }
    if (
      round.conversationId !== conversationId &&
      round.messageIds.some((messageId) => snapshotMessageIds.has(messageId))
    ) {
      throw new Error(
        `Snapshot Round ${round.id} does not belong to Conversation ${conversationId}.`,
      );
    }
    if (round.conversationId !== conversationId) continue;
    const seen = new Set<string>();
    for (const messageId of round.messageIds) {
      if (seen.has(messageId)) {
        throw new Error(
          `Snapshot Round ${round.id} contains duplicate Message ${messageId}.`,
        );
      }
      seen.add(messageId);
      const message = messageById.get(messageId);
      if (!message || message.conversationId !== conversationId) {
        throw new Error(
          `Snapshot Round ${round.id} has dangling Message reference ${messageId}.`,
        );
      }
      roundMembership.set(
        messageId,
        (roundMembership.get(messageId) ?? 0) + 1,
      );
    }
  }
  const invalidMembership = conversationMessages.find(
    ({ id }) => roundMembership.get(id) !== 1,
  );
  if (invalidMembership) {
    throw new Error(
      `Snapshot Message ${invalidMembership.id} must belong to exactly one Round.`,
    );
  }
}

export async function preflightShareSnapshotRestore(
  input: ShareSnapshotRestorePreflightInput,
): Promise<ShareSnapshotRestorePreflight> {
  const sources = input.sources ?? [];
  const snapshotSources = sources.filter(hasSnapshotMetadata);
  if (snapshotSources.length === 0) {
    return {
      status: "not-applicable",
      snapshotSourceCount: 0,
      resourceCount: 0,
    };
  }

  const resourceHashes = new Set<string>();
  const validationTime = Date.now();
  try {
    if (
      !input.conversations ||
      !input.sources ||
      !input.messages ||
      !input.rounds
    ) {
      throw new Error(
        "Snapshot restore requires complete Conversation, Source, Message, and Round stores.",
      );
    }
    const conversationIds = new Set(
      input.conversations.map(({ id }) => requireNonEmptyString(id, "Conversation id")),
    );
    const resourcesByConversation = new Map<string, Set<string>>();
    for (const source of snapshotSources) {
      requireNonEmptyString(source.id, "Snapshot Source id");
      const conversationId = requireNonEmptyString(
        source.conversationId,
        `Snapshot Source ${source.id} conversationId`,
      );
      if (!conversationIds.has(conversationId)) {
        throw new Error(
          `Snapshot Source ${source.id} references missing Conversation ${conversationId}.`,
        );
      }
      const metadata = requireSnapshotMetadata(source, validationTime);
      resourceHashes.add(metadata.resourceHash);
      const conversationResources =
        resourcesByConversation.get(conversationId) ?? new Set<string>();
      conversationResources.add(metadata.resourceHash);
      resourcesByConversation.set(conversationId, conversationResources);
    }
    for (const [conversationId, hashes] of resourcesByConversation) {
      if (hashes.size > 1) {
        throw new Error(
          `Snapshot Conversation ${conversationId} owns multiple resourceHash histories.`,
        );
      }
    }
    for (const resourceHash of resourceHashes) {
      await validateResourceHistory({
        resourceHash,
        sources: input.sources,
        conversations: input.conversations,
        messages: input.messages,
        rounds: input.rounds,
        validationTime,
      });
    }
  } catch (error) {
    return {
      status: "blocked",
      snapshotSourceCount: snapshotSources.length,
      resourceCount: resourceHashes.size,
      reasons: [error instanceof Error ? error.message : String(error)],
    };
  }

  return {
    status: "valid",
    snapshotSourceCount: snapshotSources.length,
    resourceCount: resourceHashes.size,
  };
}
