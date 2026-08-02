import { describe, expect, it } from "vitest";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { ImportedSource } from "@/core/entities/imported-source";
import { ChatGPTExportImportService } from "@/core/services/chatgpt-export-import";
import { ConversationVersionService } from "@/core/services/conversation-version-service";
import { duplicateConversationWorkspace } from "@/core/services/conversation-workspace";
import { ImportParserPipeline } from "@/core/services/import-parser-pipeline";
import { ImportService } from "@/core/services/import-service";
import { editMessage } from "@/core/services/message-editing";
import { StorageBackedConversationVersionRestoreWriter } from "@/infrastructure/storage/storage-backed-conversation-version-restore-writer";
import {
  isShareSnapshotOwnedConversation,
  ShareSnapshotMutationBlockedError,
} from "@/core/services/share-snapshot-mutation-guard";
import {
  InMemoryConversationStorage,
  InMemoryMessageStorage,
  InMemoryRoundStorage,
  InMemorySourceStorage,
} from "./fakes";

const timestamp = "2026-07-28T08:00:00.000Z";
const conversationId = "snapshot-conversation";

function snapshotSource(
  schemaVersion: 1 | 2 = 2,
  sourceConversationId = conversationId,
): ImportedSource {
  return {
    id: `snapshot-source-v${schemaVersion}`,
    conversationId: sourceConversationId,
    kind: "text",
    name: "snapshot.txt",
    content: "User: Original\nAssistant: Stable",
    importedAt: timestamp,
    updatedAt: timestamp,
    shareSnapshot:
      schemaVersion === 1
        ? {
            schemaVersion: 1,
            shareId: "legacy-share",
            normalizedShareUrl: "https://chatgpt.com/share/legacy-share",
            snapshotHash: "legacy-snapshot-hash",
            snapshotMessageCount: 1,
            capturedAt: timestamp,
            parserVersion: "1.0.0",
            inputKind: "pasted-text",
            hashAlgorithm: "sha256-json-role-content-v1",
          }
        : {
            schemaVersion: 2,
            resourceHash: "resource-hash",
            snapshotHash: "snapshot-hash",
            snapshotMessageCount: 1,
            capturedAt: timestamp,
            parserVersion: "2.0.0",
            inputKind: "pasted-text",
            hashAlgorithm: "sha256-json-role-content-v1",
            snapshotSequence: 1,
          },
  };
}

function seedConversation(
  conversations: InMemoryConversationStorage,
  id = conversationId,
) {
  conversations.save({
    id,
    title: "Snapshot conversation",
    sourceType: "ChatGPT",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  });
}

function seedMessage(
  messages: InMemoryMessageStorage,
  id = "message-original",
  targetConversationId = conversationId,
) {
  messages.save({
    id,
    conversationId: targetConversationId,
    role: "user",
    content: "Original",
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

class InMemoryConversationVersionStorage
  implements ConversationVersionStorage
{
  private readonly versions = new Map<string, ConversationVersion>();

  save(version: ConversationVersion): void {
    this.versions.set(version.id, structuredClone(version));
  }

  getAll(): ConversationVersion[] {
    return [...this.versions.values()].map((version) =>
      structuredClone(version),
    );
  }

  getByConversationId(targetConversationId: string): ConversationVersion[] {
    return this.getAll().filter(
      (version) => version.conversationId === targetConversationId,
    );
  }

  removeByConversationId(targetConversationId: string): void {
    for (const [id, version] of this.versions) {
      if (version.conversationId === targetConversationId) {
        this.versions.delete(id);
      }
    }
  }
}

function importPreview() {
  return new ImportParserPipeline().preview(
    {
      name: "append.txt",
      channel: "clipboard",
      content: "User: New question\nAssistant: New answer",
    },
    "chatgpt",
  );
}

function chatGPTPreview() {
  return {
    externalConversationId: "chatgpt-export",
    title: "ChatGPT export",
    messages: [
      {
        externalMessageId: "chatgpt-message",
        role: "user" as const,
        content: "New export message",
        contentHash: "new-export-hash",
      },
    ],
    unsupportedCount: 0,
    isLarge: false,
  };
}

describe("v1.8 immutable share Snapshot mutation guard", () => {
  it.each([1, 2] as const)(
    "recognizes schema v%s Source ownership without blocking ordinary Sources",
    (schemaVersion) => {
      const sources = new InMemorySourceStorage();
      sources.save(snapshotSource(schemaVersion));
      sources.save({
        id: "ordinary-source",
        conversationId: "ordinary-conversation",
        kind: "text",
        name: "ordinary.txt",
        content: "Editable",
        importedAt: timestamp,
        updatedAt: timestamp,
      });

      expect(
        isShareSnapshotOwnedConversation(sources, conversationId),
      ).toBe(true);
      expect(
        isShareSnapshotOwnedConversation(sources, "ordinary-conversation"),
      ).toBe(false);
    },
  );

  it("blocks Message editing before any write and preserves ordinary editing", async () => {
    const conversations = new InMemoryConversationStorage();
    const sources = new InMemorySourceStorage();
    const messages = new InMemoryMessageStorage();
    seedConversation(conversations);
    seedMessage(messages);
    sources.save(snapshotSource());

    await expect(
      editMessage("message-original", "Mutated", {
        conversations,
        sources,
        messages,
      }),
    ).rejects.toThrow(ShareSnapshotMutationBlockedError);
    expect(messages.getByConversationId(conversationId)[0]).toMatchObject({
      id: "message-original",
      content: "Original",
      updatedAt: timestamp,
    });

    const ordinaryConversationId = "ordinary-conversation";
    seedConversation(conversations, ordinaryConversationId);
    seedMessage(messages, "ordinary-message", ordinaryConversationId);
    sources.save({
      id: "ordinary-source",
      conversationId: ordinaryConversationId,
      kind: "text",
      name: "ordinary.txt",
      content: "Editable",
      importedAt: timestamp,
      updatedAt: timestamp,
    });

    expect(
      (await editMessage("ordinary-message", "Edited normally", {
        conversations,
        sources,
        messages,
      }))?.message.content,
    ).toBe("Edited normally");
  });

  it("blocks generic import and ChatGPT export append paths with zero writes", async () => {
    const conversations = new InMemoryConversationStorage();
    const sources = new InMemorySourceStorage();
    const messages = new InMemoryMessageStorage();
    const rounds = new InMemoryRoundStorage();
    seedConversation(conversations);
    seedMessage(messages);
    sources.save(snapshotSource());

    const before = {
      conversation: conversations.getById(conversationId),
      sources: sources.getAll(),
      messages: messages.getAll(),
      rounds: rounds.getAll(),
    };

    expect(() =>
      new ImportService(
        conversations,
        sources,
        messages,
        rounds,
      ).appendToConversation(importPreview(), conversationId),
    ).toThrow(ShareSnapshotMutationBlockedError);

    const chatGPTService = new ChatGPTExportImportService(
      conversations,
      sources,
      messages,
      rounds,
    );
    expect(() =>
      chatGPTService.appendToConversation(
        chatGPTPreview(),
        conversationId,
      ),
    ).toThrow(ShareSnapshotMutationBlockedError);
    expect(() =>
      chatGPTService.importConversation({
        ...chatGPTPreview(),
        existingConversationId: conversationId,
        existingMessages: 1,
        newMessages: 1,
        skippedDuplicates: 0,
        appendOnly: true,
      }),
    ).toThrow(ShareSnapshotMutationBlockedError);

    expect({
      conversation: conversations.getById(conversationId),
      sources: sources.getAll(),
      messages: messages.getAll(),
      rounds: rounds.getAll(),
    }).toEqual(before);
  });

  it("blocks version restore and Conversation duplication before replacement", async () => {
    const conversations = new InMemoryConversationStorage();
    const sources = new InMemorySourceStorage();
    const messages = new InMemoryMessageStorage();
    const rounds = new InMemoryRoundStorage();
    const versions = new InMemoryConversationVersionStorage();
    seedConversation(conversations);
    seedMessage(messages);
    sources.save(snapshotSource());
    versions.save({
      id: "version",
      conversationId,
      name: "Earlier",
      description: "",
      createdAt: timestamp,
      sourceVersion: 1,
      messageCount: 1,
      snapshotData: {
        conversation: {
          ...conversations.getById(conversationId)!,
          title: "Restored title",
        },
        messages: [
          {
            ...messages.getByConversationId(conversationId)[0],
            content: "Restored content",
          },
        ],
      },
    });

    await expect(
      new ConversationVersionService({
        conversations,
        messages,
        versions,
      }).restoreSnapshot(conversationId, "version", {
        sources,
        rounds,
        writer: new StorageBackedConversationVersionRestoreWriter({
          conversations,
          messages,
          rounds,
        }),
      }),
    ).rejects.toThrow(ShareSnapshotMutationBlockedError);
    await expect(
      duplicateConversationWorkspace(conversationId, {
        conversations,
        sources,
        messages,
        proposals: {} as ProposalStorage,
        knowledgeCards: {} as KnowledgeCardStorage,
      }),
    ).rejects.toThrow(ShareSnapshotMutationBlockedError);

    expect(conversations.getAll()).toHaveLength(1);
    expect(messages.getByConversationId(conversationId)).toEqual([
      expect.objectContaining({
        id: "message-original",
        content: "Original",
      }),
    ]);
  });
});
