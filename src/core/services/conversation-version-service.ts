import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { SourceStorage } from "@/core/contracts/source-storage";
import type {
  ConversationContextChange,
  ConversationVersion,
  ConversationVersionKind,
} from "@/core/entities/conversation-version";
import type { Conversation } from "@/core/entities/conversation";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { assertShareSnapshotTranscriptMutable } from "@/core/services/share-snapshot-mutation-guard";

export type ConversationVersionStorages = {
  conversations: ConversationStorage;
  messages: MessageStorage;
  versions: ConversationVersionStorage;
};

export type RestoredConversationSnapshot = {
  conversation: Conversation;
  messages: Message[];
  rounds: Round[];
  version: ConversationVersion;
};

export type ConversationSnapshotRestoreStorages = {
  sources: SourceStorage;
  rounds: RoundStorage;
};

export type CreateConversationSnapshotOptions = {
  kind?: ConversationVersionKind;
  contextChanges?: ConversationContextChange[];
};

function cloneConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    context: conversation.context ? { ...conversation.context } : undefined,
  };
}

export class ConversationVersionService {
  constructor(private readonly storages: ConversationVersionStorages) {}

  createSnapshot(
    conversationId: string,
    name: string,
    description: string,
    options: CreateConversationSnapshotOptions = {},
  ): ConversationVersion | null {
    const conversation = this.storages.conversations.getById(conversationId);
    const normalizedName = name.trim();

    if (!conversation || !normalizedName) {
      return null;
    }

    const messages = this.storages.messages.getByConversationId(conversationId);
    const currentVersions = this.storages.versions.getByConversationId(
      conversationId,
    );
    const sourceVersion =
      Math.max(0, ...currentVersions.map((version) => version.sourceVersion)) + 1;
    const version: ConversationVersion = {
      id: crypto.randomUUID(),
      conversationId,
      name: normalizedName,
      description: description.trim(),
      createdAt: new Date().toISOString(),
      sourceVersion,
      messageCount: messages.length,
      snapshotData: {
        conversation: cloneConversation(conversation),
        messages: messages.map((message) => ({ ...message })),
      },
      kind: options.kind,
      contextChanges: options.contextChanges?.map((change) => ({ ...change })),
    };

    this.storages.versions.save(version);
    return version;
  }

  restoreSnapshot(
    conversationId: string,
    versionId: string,
    restoreStorages: ConversationSnapshotRestoreStorages,
  ): RestoredConversationSnapshot | null {
    const currentConversation =
      this.storages.conversations.getById(conversationId);
    const version = this.storages.versions
      .getByConversationId(conversationId)
      .find((item) => item.id === versionId);

    if (!currentConversation || !version) {
      return null;
    }

    assertShareSnapshotTranscriptMutable(
      restoreStorages.sources,
      conversationId,
      "restore Conversation version",
    );

    const currentMessages =
      this.storages.messages.getByConversationId(conversationId);
    const currentRounds =
      restoreStorages.rounds.getByConversationId(conversationId);
    const timestamp = new Date().toISOString();
    const restoredConversation: Conversation = {
      ...cloneConversation(version.snapshotData.conversation),
      id: currentConversation.id,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
    };
    const restoredMessages: Message[] = version.snapshotData.messages.map(
      (message) => ({
        ...message,
        id: crypto.randomUUID(),
        conversationId: currentConversation.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    const restoredMessageByOrder = new Map(
      restoredMessages.map((message) => [message.order, message]),
    );
    const restoredMessageIdByReferenceId = new Map(
      version.snapshotData.messages.map((message, index) => [
        message.id,
        restoredMessages[index].id,
      ]),
    );
    currentMessages.forEach((message) => {
      const restoredMessage = restoredMessageByOrder.get(message.order);
      if (restoredMessage) {
        restoredMessageIdByReferenceId.set(message.id, restoredMessage.id);
      }
    });
    const restoredRounds: Round[] = currentRounds.map((round) => ({
      ...round,
      messageIds: round.messageIds.flatMap((messageId) => {
        const restoredMessageId =
          restoredMessageIdByReferenceId.get(messageId);
        return restoredMessageId ? [restoredMessageId] : [];
      }),
    }));

    this.storages.conversations.save(restoredConversation);
    this.storages.messages.replaceByConversationId(
      currentConversation.id,
      restoredMessages,
    );
    restoreStorages.rounds.replaceByConversationId(
      currentConversation.id,
      restoredRounds,
    );

    return {
      conversation: restoredConversation,
      messages: restoredMessages,
      rounds: restoredRounds,
      version,
    };
  }
}
