import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { Conversation } from "@/core/entities/conversation";
import type { Message } from "@/core/entities/message";

export type ConversationVersionStorages = {
  conversations: ConversationStorage;
  messages: MessageStorage;
  versions: ConversationVersionStorage;
};

export type RestoredConversationSnapshot = {
  conversation: Conversation;
  messages: Message[];
  version: ConversationVersion;
};

export class ConversationVersionService {
  constructor(private readonly storages: ConversationVersionStorages) {}

  createSnapshot(
    conversationId: string,
    name: string,
    description: string,
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
        conversation: { ...conversation },
        messages: messages.map((message) => ({ ...message })),
      },
    };

    this.storages.versions.save(version);
    return version;
  }

  restoreSnapshot(
    conversationId: string,
    versionId: string,
  ): RestoredConversationSnapshot | null {
    const currentConversation =
      this.storages.conversations.getById(conversationId);
    const version = this.storages.versions
      .getByConversationId(conversationId)
      .find((item) => item.id === versionId);

    if (!currentConversation || !version) {
      return null;
    }

    const timestamp = new Date().toISOString();
    const restoredConversation: Conversation = {
      ...version.snapshotData.conversation,
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

    this.storages.conversations.save(restoredConversation);
    this.storages.messages.replaceByConversationId(
      currentConversation.id,
      restoredMessages,
    );

    return {
      conversation: restoredConversation,
      messages: restoredMessages,
      version,
    };
  }
}
