import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { SourceStorage } from "@/core/contracts/source-storage";
import type { Conversation } from "@/core/entities/conversation";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import {
  assertShareSnapshotTranscriptMutable,
  executeShareSnapshotTranscriptMutation,
} from "@/core/services/share-snapshot-mutation-guard";

export type ConversationMergePreview = Readonly<{
  sourceConversation: Readonly<Conversation>;
  targetConversation: Readonly<Conversation>;
  sourceMessages: readonly Readonly<Message>[];
  targetMessages: readonly Readonly<Message>[];
  sourceRounds: readonly Readonly<Round>[];
  targetRounds: readonly Readonly<Round>[];
  conversationVersions: readonly Readonly<ConversationVersion>[];
}>;

export type ConversationMergeResult = Readonly<{
  targetConversation: Conversation;
  appendedMessages: Message[];
  appendedRounds: Round[];
  automaticVersion: ConversationVersion;
}>;

type ConversationMergeStorages = Readonly<{
  conversations: ConversationStorage;
  messages: MessageStorage;
  rounds: RoundStorage;
  sources: SourceStorage;
  versions: ConversationVersionStorage;
}>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export class ConversationMergeService {
  constructor(private readonly storages: ConversationMergeStorages) {}

  preview(sourceConversationId: string, targetConversationId: string): ConversationMergePreview {
    if (
      !sourceConversationId ||
      !targetConversationId ||
      sourceConversationId === targetConversationId
    ) {
      throw new Error("Merge requires different source and target Conversations.");
    }
    const sourceConversation =
      this.storages.conversations.getById(sourceConversationId);
    const targetConversation =
      this.storages.conversations.getById(targetConversationId);
    if (!sourceConversation || !targetConversation) {
      throw new Error("Merge Conversation is unavailable.");
    }
    assertShareSnapshotTranscriptMutable(
      this.storages.sources,
      sourceConversationId,
      "merge from Conversation transcript",
    );
    assertShareSnapshotTranscriptMutable(
      this.storages.sources,
      targetConversationId,
      "merge into Conversation transcript",
    );

    return clone({
      sourceConversation,
      targetConversation,
      sourceMessages:
        this.storages.messages.getByConversationId(sourceConversationId),
      targetMessages:
        this.storages.messages.getByConversationId(targetConversationId),
      sourceRounds:
        this.storages.rounds.getByConversationId(sourceConversationId),
      targetRounds:
        this.storages.rounds.getByConversationId(targetConversationId),
      conversationVersions: [
        ...this.storages.versions.getByConversationId(sourceConversationId),
        ...this.storages.versions.getByConversationId(targetConversationId),
      ],
    });
  }

  private assertFallbackBaseline(preview: ConversationMergePreview): void {
    const current = this.preview(
      preview.sourceConversation.id,
      preview.targetConversation.id,
    );
    if (!valuesMatch(current, preview)) {
      throw new Error("Merge baseline changed; preview again.");
    }
  }

  async confirm(preview: ConversationMergePreview): Promise<ConversationMergeResult> {
    const sourceConversationId = preview.sourceConversation.id;
    const targetConversationId = preview.targetConversation.id;
    if (sourceConversationId === targetConversationId) {
      throw new Error("Merge requires different source and target Conversations.");
    }

    const timestamp = new Date().toISOString();
    const maxMessageOrder = preview.targetMessages.reduce(
      (maximum, message) => Math.max(maximum, message.order),
      -1,
    );
    const appendedMessages = preview.sourceMessages.map((message, index) => ({
      ...clone(message),
      id: crypto.randomUUID(),
      conversationId: targetConversationId,
      order: maxMessageOrder + index + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    const appendedMessageIdBySourceId = new Map(
      preview.sourceMessages.map((message, index) => [
        message.id,
        appendedMessages[index].id,
      ]),
    );
    const maxRoundOrder = preview.targetRounds.reduce(
      (maximum, round) => Math.max(maximum, round.order),
      0,
    );
    const appendedRounds = preview.sourceRounds.map((round, index) => {
      const order = maxRoundOrder + index + 1;
      return {
        id: crypto.randomUUID(),
        conversationId: targetConversationId,
        order,
        title: round.title.trim() || `Round ${order}`,
        question: round.question.trim(),
        answer: round.answer.trim(),
        messageIds: round.messageIds.flatMap((messageId) => {
          const mapped = appendedMessageIdBySourceId.get(messageId);
          return mapped ? [mapped] : [];
        }),
        note: round.note?.trim() || undefined,
        summary: round.summary?.trim() || undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies Round;
    });
    const updatedTarget: Conversation = {
      ...clone(preview.targetConversation),
      updatedAt: timestamp,
    };
    const targetVersions = preview.conversationVersions.filter(
      (version) => version.conversationId === targetConversationId,
    );
    const automaticVersion: ConversationVersion = {
      id: crypto.randomUUID(),
      conversationId: targetConversationId,
      name: `自动恢复点 — Merge「${preview.sourceConversation.title}」`,
      description: `合并来自「${preview.sourceConversation.title}」的内容前自动创建`,
      createdAt: timestamp,
      sourceVersion:
        Math.max(0, ...targetVersions.map((version) => version.sourceVersion)) + 1,
      messageCount: preview.targetMessages.length,
      snapshotData: {
        conversation: clone(preview.targetConversation),
        messages: preview.targetMessages.map(clone),
      },
      kind: "automatic",
    };

    const result: ConversationMergeResult = {
      targetConversation: updatedTarget,
      appendedMessages,
      appendedRounds,
      automaticVersion,
    };
    const mutation = executeShareSnapshotTranscriptMutation(
      this.storages.sources,
      {
        conversationIds: [sourceConversationId, targetConversationId],
        operation: "merge Conversation transcript",
        expected: {
          conversations: [
            preview.sourceConversation,
            preview.targetConversation,
          ],
          messages: [
            ...preview.sourceMessages,
            ...preview.targetMessages,
          ],
          rounds: [...preview.sourceRounds, ...preview.targetRounds],
          conversationVersions: preview.conversationVersions,
        },
        put: {
          conversations: [updatedTarget],
          messages: appendedMessages,
          rounds: appendedRounds,
          conversationVersions: [automaticVersion],
        },
      },
      () => {
        this.assertFallbackBaseline(preview);
        this.storages.versions.save(automaticVersion);
        this.storages.messages.saveMany(appendedMessages);
        this.storages.rounds.saveMany(appendedRounds);
        this.storages.conversations.save(updatedTarget);
      },
    );
    await mutation;
    return result;
  }
}
