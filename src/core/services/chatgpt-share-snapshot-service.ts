import type { Conversation } from "@/core/entities/conversation";
import type {
  ChatGPTShareSnapshotMetadata,
  ImportedSource,
} from "@/core/entities/imported-source";
import { isChatGPTShareSnapshotMetadata } from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import {
  compareChatGPTShareSnapshot,
  type ChatGPTShareSnapshotComparison,
} from "@/core/services/chatgpt-share-snapshot-comparator";
import {
  buildChatGPTShareSnapshotMetadata,
  buildExistingChatGPTShareSnapshotImportPlan,
  buildNewChatGPTShareSnapshotImportPlan,
  renderChatGPTShareSnapshotTranscript,
  type ChatGPTShareSnapshotImportPlan,
} from "@/core/services/chatgpt-share-snapshot-import";
import {
  parseChatGPTShareSnapshot,
  type ChatGPTShareSnapshotInput,
  type ChatGPTShareSnapshotParseResult,
} from "@/core/services/chatgpt-share-snapshot-parser";
import {
  identifyChatGPTShareUrl,
  type ChatGPTShareIdentity,
} from "@/core/services/chatgpt-share-snapshot-url";

export type ChatGPTShareSnapshotIdKind = "source" | "message" | "round";

export type ChatGPTShareSnapshotCanonicalPlan = Readonly<{
  conversation: Readonly<Conversation>;
  source: Readonly<ImportedSource>;
  messages: readonly Readonly<Message>[];
  rounds: readonly Readonly<Round>[];
}>;

export type ChatGPTShareSnapshotNewTarget = Readonly<{
  kind: "new";
  conversation: Readonly<Conversation>;
}>;

export type ChatGPTShareSnapshotExistingTarget = Readonly<{
  kind: "existing";
  conversation: Readonly<Conversation>;
  source: Readonly<ImportedSource>;
  messages: readonly Readonly<Message>[];
  rounds: readonly Readonly<Round>[];
}>;

export type ChatGPTShareSnapshotTarget =
  | ChatGPTShareSnapshotNewTarget
  | ChatGPTShareSnapshotExistingTarget;

export type PrepareChatGPTShareSnapshotInput = Readonly<{
  shareUrl: string;
  snapshot: ChatGPTShareSnapshotInput;
  capturedAt: string;
  target: ChatGPTShareSnapshotTarget;
  createId: (kind: ChatGPTShareSnapshotIdKind) => string;
}>;

export type ChatGPTShareSnapshotPreparationStatus =
  | "new"
  | "append"
  | "same"
  | "blocked"
  | "invalid";

export type ChatGPTShareSnapshotPreparation = {
  status: ChatGPTShareSnapshotPreparationStatus;
  identity: ChatGPTShareIdentity;
  parsed: ChatGPTShareSnapshotParseResult;
  metadata?: ChatGPTShareSnapshotMetadata;
  comparison?: ChatGPTShareSnapshotComparison;
  importPlan?: ChatGPTShareSnapshotImportPlan;
  canonicalPlan?: ChatGPTShareSnapshotCanonicalPlan;
  warnings: string[];
  errors: string[];
};

function cloneConversation(
  conversation: Readonly<Conversation>,
  capturedAt: string,
): Conversation {
  return {
    ...conversation,
    context: conversation.context ? { ...conversation.context } : undefined,
    updatedAt: capturedAt,
  };
}

function invalidPreparation(input: {
  identity: ChatGPTShareIdentity;
  parsed: ChatGPTShareSnapshotParseResult;
  errors: string[];
  metadata?: ChatGPTShareSnapshotMetadata;
  comparison?: ChatGPTShareSnapshotComparison;
  importPlan?: ChatGPTShareSnapshotImportPlan;
}): ChatGPTShareSnapshotPreparation {
  return {
    status: "invalid",
    identity: input.identity,
    parsed: input.parsed,
    metadata: input.metadata,
    comparison: input.comparison,
    importPlan: input.importPlan,
    warnings: [...input.parsed.warnings],
    errors: [...input.errors],
  };
}

function validateCapturedAt(capturedAt: string): string | null {
  if (!capturedAt.trim() || Number.isNaN(Date.parse(capturedAt))) {
    return "Share Snapshot capturedAt must be a valid timestamp.";
  }
  return null;
}

function validateTarget(target: ChatGPTShareSnapshotTarget): string[] {
  const errors: string[] = [];
  const conversationId = target.conversation.id.trim();
  if (!conversationId) {
    errors.push("Share Snapshot target conversation id is required.");
    return errors;
  }
  if (target.kind === "new") return errors;

  if (target.source.conversationId !== conversationId) {
    errors.push(
      `Share Snapshot source ${target.source.id} does not belong to conversation ${conversationId}.`,
    );
  }
  if (!isChatGPTShareSnapshotMetadata(target.source.shareSnapshot)) {
    errors.push(
      `Share Snapshot source ${target.source.id} is not an immutable Snapshot Source.`,
    );
  }
  for (const message of target.messages) {
    if (message.conversationId !== conversationId) {
      errors.push(
        `Share Snapshot message ${message.id} does not belong to conversation ${conversationId}.`,
      );
    }
  }
  for (const round of target.rounds) {
    if (round.conversationId !== conversationId) {
      errors.push(
        `Share Snapshot round ${round.id} does not belong to conversation ${conversationId}.`,
      );
    }
  }
  return errors;
}

function validateIdentity(
  identity: ChatGPTShareIdentity,
  target: ChatGPTShareSnapshotExistingTarget,
): string | null {
  const stored = target.source.shareSnapshot;
  if (!isChatGPTShareSnapshotMetadata(stored)) return null;
  if (stored.resourceHash !== identity.resourceHash) {
    return `Share Snapshot URL does not match source ${target.source.id}.`;
  }
  return null;
}

function allocateId(
  kind: ChatGPTShareSnapshotIdKind,
  createId: (kind: ChatGPTShareSnapshotIdKind) => string,
  reservedIds: Set<string>,
): string {
  const id = createId(kind).trim();
  if (!id) {
    throw new Error(`Share Snapshot ${kind} id factory returned an empty id.`);
  }
  if (reservedIds.has(id)) {
    throw new Error(`Share Snapshot ${kind} id ${id} already exists.`);
  }
  reservedIds.add(id);
  return id;
}

function materializeCanonicalPlan(input: {
  target: ChatGPTShareSnapshotTarget;
  parsed: ChatGPTShareSnapshotParseResult;
  metadata: ChatGPTShareSnapshotMetadata;
  importPlan: ChatGPTShareSnapshotImportPlan;
  capturedAt: string;
  createId: (kind: ChatGPTShareSnapshotIdKind) => string;
}): ChatGPTShareSnapshotCanonicalPlan {
  const { target, parsed, metadata, importPlan, capturedAt, createId } = input;
  if (importPlan.kind !== "new" && importPlan.kind !== "append") {
    throw new Error(
      `Share Snapshot ${importPlan.kind} plan cannot be materialized.`,
    );
  }

  const conversationId = target.conversation.id;
  const existingMessages = target.kind === "existing" ? target.messages : [];
  const existingRounds = target.kind === "existing" ? target.rounds : [];
  const sourceId = allocateId(
    "source",
    createId,
    new Set(target.kind === "existing" ? [target.source.id] : []),
  );
  const messageIds = new Set(existingMessages.map((message) => message.id));
  const roundIds = new Set(existingRounds.map((round) => round.id));
  const maxMessageOrder = existingMessages.reduce(
    (maximum, message) => Math.max(maximum, message.order),
    -1,
  );
  const maxRoundOrder = existingRounds.reduce(
    (maximum, round) => Math.max(maximum, round.order),
    0,
  );
  const messages: Message[] = importPlan.messagesToWrite.map((draft, index) => ({
    id: allocateId("message", createId, messageIds),
    conversationId,
    role: draft.role,
    content: draft.content,
    order: maxMessageOrder + index + 1,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    sourceId,
    sourceOrdinal: draft.ordinal,
  }));
  const rounds: Round[] = importPlan.roundsToWrite.map((draft) => ({
    id: allocateId("round", createId, roundIds),
    conversationId,
    order: maxRoundOrder + draft.order,
    title: draft.title,
    question: draft.question,
    answer: draft.answer,
    messageIds: draft.messageIndexes.map((messageIndex) => {
      const message = messages[messageIndex];
      if (!message) {
        throw new Error(
          `Share Snapshot Round references missing suffix message index ${messageIndex}.`,
        );
      }
      return message.id;
    }),
    createdAt: capturedAt,
    updatedAt: capturedAt,
  }));
  const source: ImportedSource = {
    id: sourceId,
    conversationId,
    kind: "text",
    name: parsed.title,
    content: renderChatGPTShareSnapshotTranscript(parsed.messages),
    importedAt: capturedAt,
    updatedAt: capturedAt,
    shareSnapshot: { ...metadata },
  };

  return {
    conversation: cloneConversation(target.conversation, capturedAt),
    source,
    messages,
    rounds,
  };
}

export async function prepareChatGPTShareSnapshot(
  input: PrepareChatGPTShareSnapshotInput,
): Promise<ChatGPTShareSnapshotPreparation> {
  const identity = await identifyChatGPTShareUrl(input.shareUrl);
  const parsed = parseChatGPTShareSnapshot(input.snapshot);
  const capturedAtError = validateCapturedAt(input.capturedAt);
  const inputErrors = [
    ...parsed.errors,
    ...(capturedAtError ? [capturedAtError] : []),
    ...validateTarget(input.target),
  ];
  if (inputErrors.length > 0) {
    return invalidPreparation({ identity, parsed, errors: inputErrors });
  }

  const metadata = await buildChatGPTShareSnapshotMetadata({
    identity,
    messages: parsed.messages,
    capturedAt: input.capturedAt,
    inputKind: parsed.inputKind,
    parserVersion: parsed.parserVersion,
    previousSnapshotSourceId:
      input.target.kind === "existing" ? input.target.source.id : undefined,
    snapshotSequence:
      input.target.kind === "existing" &&
      isChatGPTShareSnapshotMetadata(input.target.source.shareSnapshot)
        ? input.target.source.shareSnapshot.snapshotSequence + 1
        : 1,
  });

  if (input.target.kind === "new") {
    const importPlan = buildNewChatGPTShareSnapshotImportPlan(parsed);
    try {
      return {
        status: "new",
        identity,
        parsed,
        metadata,
        importPlan,
        canonicalPlan: materializeCanonicalPlan({
          target: input.target,
          parsed,
          metadata,
          importPlan,
          capturedAt: input.capturedAt,
          createId: input.createId,
        }),
        warnings: [...parsed.warnings],
        errors: [],
      };
    } catch (error) {
      return invalidPreparation({
        identity,
        parsed,
        metadata,
        importPlan,
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  const identityError = validateIdentity(identity, input.target);
  if (identityError) {
    return invalidPreparation({
      identity,
      parsed,
      metadata,
      errors: [identityError],
    });
  }

  let comparison: ChatGPTShareSnapshotComparison;
  try {
    comparison = compareChatGPTShareSnapshot({
      headSource: input.target.source,
      canonicalMessages: input.target.messages as readonly Message[],
      snapshotMessages: parsed.messages,
      incomingSnapshotHash: metadata.snapshotHash,
    });
  } catch (error) {
    return invalidPreparation({
      identity,
      parsed,
      metadata,
      errors: [error instanceof Error ? error.message : String(error)],
    });
  }

  if (comparison.status === "invalid") {
    return invalidPreparation({
      identity,
      parsed,
      metadata,
      comparison,
      errors: [
        comparison.invalidReason ?? "Share Snapshot comparison is invalid.",
      ],
    });
  }
  const importPlan = buildExistingChatGPTShareSnapshotImportPlan(comparison);
  if (importPlan.kind === "same") {
    return {
      status: "same",
      identity,
      parsed,
      metadata,
      comparison,
      importPlan,
      warnings: [...parsed.warnings],
      errors: [],
    };
  }
  if (importPlan.kind === "blocked") {
    return {
      status: "blocked",
      identity,
      parsed,
      metadata,
      comparison,
      importPlan,
      warnings: [...parsed.warnings],
      errors: [],
    };
  }

  try {
    return {
      status: "append",
      identity,
      parsed,
      metadata,
      comparison,
      importPlan,
      canonicalPlan: materializeCanonicalPlan({
        target: input.target,
        parsed,
        metadata,
        importPlan,
        capturedAt: input.capturedAt,
        createId: input.createId,
      }),
      warnings: [...parsed.warnings],
      errors: [],
    };
  } catch (error) {
    return invalidPreparation({
      identity,
      parsed,
      metadata,
      comparison,
      importPlan,
      errors: [error instanceof Error ? error.message : String(error)],
    });
  }
}
