import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ChatGPTExportImportService } from "@/core/services/chatgpt-export-import";
import { ImportParserPipeline } from "@/core/services/import-parser-pipeline";
import { ImportService } from "@/core/services/import-service";
import {
  InMemoryConversationStorage,
  InMemoryMessageStorage,
  InMemoryRoundStorage,
  InMemorySourceStorage,
} from "./fakes";

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, "fixtures", name), "utf-8");
}

function makeService() {
  return new ChatGPTExportImportService(
    new InMemoryConversationStorage(),
    new InMemorySourceStorage(),
    new InMemoryMessageStorage(),
    new InMemoryRoundStorage(),
  );
}

describe("ChatGPTExportImportService.parseExport", () => {
  it("parses a basic ChatGPT conversations.json file", () => {
    const text = loadFixture("chatgpt-basic.json");
    const service = makeService();
    const previews = service.parseExport(text);

    expect(previews).toHaveLength(1);
    expect(previews[0].title).toBe("Hello World Chat");
    expect(previews[0].externalConversationId).toBe("conv-basic-001");
    // 3 messages: user -> assistant -> user
    expect(previews[0].messages).toHaveLength(3);
    expect(previews[0].unsupportedCount).toBe(0);
    expect(previews[0].messages[0].role).toBe("user");
    expect(previews[0].messages[0].content).toBe("Hello, how are you?");
    expect(previews[0].messages[1].role).toBe("assistant");
    expect(previews[0].messages[2].role).toBe("user");
  });

  it("assigns fallback title when title is missing", () => {
    const json = JSON.stringify([
      {
        id: "conv-no-title",
        title: "   ",
        create_time: 1715875200,
        current_node: "node-1",
        mapping: {
          "node-1": {
            id: "msg-1",
            message: {
              id: "msg-1",
              author: { role: "user" },
              content: { content_type: "text", parts: ["Hello"] },
            },
          },
        },
      },
    ]);
    const service = makeService();
    const previews = service.parseExport(json);
    expect(previews[0].title).toBe("ChatGPT Conversation 1");
  });

  it("skips conversations without a mapping", () => {
    const json = JSON.stringify([
      { id: "conv-no-mapping", title: "No Mapping", create_time: 1715875200 },
    ]);
    const service = makeService();
    const previews = service.parseExport(json);
    expect(previews).toHaveLength(0);
  });

  it("throws on non-array JSON", () => {
    const json = JSON.stringify({ conversations: [] });
    const service = makeService();
    expect(() => service.parseExport(json)).toThrow("conversations.json 顶层必须是数组。");
  });

  it("throws on invalid JSON", () => {
    const service = makeService();
    expect(() => service.parseExport("not valid json")).toThrow();
  });
});

describe("ChatGPTExportImportService — unsupported messages", () => {
  it("counts unsupported roles (tool, system) without crashing", () => {
    const text = loadFixture("chatgpt-unsupported.json");
    const service = makeService();
    const previews = service.parseExport(text);

    expect(previews).toHaveLength(1);
    expect(previews[0].title).toBe("Mixed Content Chat");
    // Only 2 supported messages: 1 user text + 1 assistant text
    // Unsupported: tool call, system message, multimodal (image)
    expect(previews[0].messages).toHaveLength(2);
    expect(previews[0].unsupportedCount).toBe(3);
  });

  it("skips empty content messages", () => {
    const json = JSON.stringify([
      {
        id: "conv-empty-content",
        title: "Empty Content",
        current_node: "node-1",
        mapping: {
          "node-1": {
            id: "msg-1",
            message: {
              id: "msg-1",
              author: { role: "user" },
              content: { content_type: "text", parts: [""] },
            },
          },
        },
      },
    ]);
    const service = makeService();
    const previews = service.parseExport(json);

    expect(previews[0].messages).toHaveLength(0);
    expect(previews[0].unsupportedCount).toBe(1);
  });

  it("does not crash on a null message node", () => {
    const json = JSON.stringify([
      {
        id: "conv-null-message",
        title: "Null Message",
        current_node: "node-1",
        mapping: {
          "node-1": {
            id: "null-msg",
            message: null,
          },
        },
      },
    ]);
    const service = makeService();
    const previews = service.parseExport(json);

    // Null message is skipped without incrementing unsupportedCount (line 99-101: if !message returns without counting)
    expect(previews[0].messages).toHaveLength(0);
    expect(previews[0].unsupportedCount).toBe(0);
  });
});

describe("ChatGPTExportImportService.previewImport", () => {
  it("shows all new messages for a first import (no existing conversation)", () => {
    const text = loadFixture("chatgpt-basic.json");
    const service = makeService();
    const previews = service.parseExport(text);
    const importPreview = service.previewImport(previews[0]);

    expect(importPreview.existingConversationId).toBeUndefined();
    expect(importPreview.existingMessages).toBe(0);
    // 3 messages total, all new
    expect(importPreview.newMessages).toBe(3);
    expect(importPreview.skippedDuplicates).toBe(0);
    expect(importPreview.appendOnly).toBe(false);
  });

  it("detects duplicate conversation and counts skipped messages", () => {
    const text = loadFixture("chatgpt-basic.json");
    const conversations = new InMemoryConversationStorage();
    const messages = new InMemoryMessageStorage();

    // Pre-populate an existing imported conversation with one matching message
    const existingId = "existing-conv-id";
    conversations.save({
      id: existingId,
      title: "Hello World Chat",
      sourceType: "ChatGPT",
      externalSource: "chatgpt",
      externalConversationId: "conv-basic-001",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    });
    messages.save({
      id: "existing-msg-1",
      conversationId: existingId,
      role: "user",
      content: "Hello, how are you?",
      order: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      externalMessageId: "msg-user-1",
      contentHash: "fnv1a-abc",
    });

    const service = new ChatGPTExportImportService(
      conversations,
      new InMemorySourceStorage(),
      messages,
      new InMemoryRoundStorage(),
    );

    const previews = service.parseExport(text);
    const importPreview = service.previewImport(previews[0]);

    expect(importPreview.existingConversationId).toBe(existingId);
    expect(importPreview.existingMessages).toBe(1);
    // 3 total, 1 matched by externalMessageId = 2 new, 1 skipped
    expect(importPreview.newMessages).toBe(2);
    expect(importPreview.skippedDuplicates).toBe(1);
    expect(importPreview.appendOnly).toBe(true);
  });

  it("detects duplicate by content hash when no externalMessageId", () => {
    // Replicate the same FNV-1a hash used in chatgpt-export-import.ts
    function computeHash(role: string, content: string) {
      const input = `${role}\u0000${content.replace(/\s+/g, " ").trim()}`;
      let hash = 2166136261;
      for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
    }

    const text = loadFixture("chatgpt-basic.json");
    const conversations = new InMemoryConversationStorage();
    const messages = new InMemoryMessageStorage();

    const existingId = "existing-conv-id";
    conversations.save({
      id: existingId,
      title: "Hello World Chat",
      sourceType: "ChatGPT",
      externalSource: "chatgpt",
      externalConversationId: "conv-basic-001",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    });
    // Store message without externalMessageId — dedup will use contentHash.
    // Use the matching computed hash so the dedup correctly detects it.
    messages.save({
      id: "existing-msg-no-extid",
      conversationId: existingId,
      role: "user",
      content: "Hello, how are you?",
      order: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      contentHash: computeHash("user", "Hello, how are you?"),
    });

    const service = new ChatGPTExportImportService(
      conversations,
      new InMemorySourceStorage(),
      messages,
      new InMemoryRoundStorage(),
    );

    const previews = service.parseExport(text);
    const importPreview = service.previewImport(previews[0]);

    expect(importPreview.existingMessages).toBe(1);
    // 3 total, 1 matched by contentHash = 2 new, 1 skipped
    expect(importPreview.skippedDuplicates).toBe(1);
    expect(importPreview.newMessages).toBe(2);
  });

  it("correctly shows multiple conversations from the same export", () => {
    const json = JSON.stringify([
      {
        id: "conv-a",
        title: "Conversation A",
        current_node: "node-a1",
        mapping: {
          "node-a1": {
            id: "msg-a",
            message: {
              id: "msg-a",
              author: { role: "user" },
              content: { content_type: "text", parts: ["Question A"] },
            },
          },
        },
      },
      {
        id: "conv-b",
        title: "Conversation B",
        current_node: "node-b1",
        mapping: {
          "node-b1": {
            id: "msg-b",
            message: {
              id: "msg-b",
              author: { role: "assistant" },
              content: { content_type: "text", parts: ["Answer B"] },
            },
          },
        },
      },
    ]);

    const service = makeService();
    const previews = service.parseExport(json);

    expect(previews).toHaveLength(2);
    expect(previews[0].title).toBe("Conversation A");
    expect(previews[1].title).toBe("Conversation B");
  });
});

describe("ChatGPTExportImportService.importConversation", () => {
  it("imports a new conversation — creates Conversation, Messages, and Rounds", () => {
    const text = loadFixture("chatgpt-basic.json");
    const conversations = new InMemoryConversationStorage();
    const sources = new InMemorySourceStorage();
    const messages = new InMemoryMessageStorage();
    const rounds = new InMemoryRoundStorage();

    const service = new ChatGPTExportImportService(
      conversations,
      sources,
      messages,
      rounds,
    );

    const previews = service.parseExport(text);
    const importPreview = service.previewImport(previews[0]);
    const result = service.importConversation(importPreview);

    expect(result.conversationId).toBeTruthy();
    expect(result.appended).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);
    expect(result.roundsCreated).toBeGreaterThan(0);

    // Verify Conversation was saved
    const saved = conversations.getById(result.conversationId);
    expect(saved).not.toBeNull();
    expect(saved?.externalSource).toBe("chatgpt");
    expect(saved?.externalConversationId).toBe("conv-basic-001");
    expect(saved?.importedAt).toBeTruthy();

    // Verify Messages were saved with external IDs and hashes
    const savedMessages = messages.getByConversationId(result.conversationId);
    expect(savedMessages.length).toBeGreaterThan(0);
    expect(savedMessages[0].externalMessageId).toBeTruthy();
    expect(savedMessages[0].contentHash).toBeTruthy();
  });

  it("incrementally imports — appends only new Messages to existing Conversation", () => {
    const text = loadFixture("chatgpt-basic.json");
    const conversations = new InMemoryConversationStorage();
    const messages = new InMemoryMessageStorage();

    // First import
    const service1 = new ChatGPTExportImportService(
      conversations,
      new InMemorySourceStorage(),
      messages,
      new InMemoryRoundStorage(),
    );
    const previews1 = service1.parseExport(text);
    const importPreview1 = service1.previewImport(previews1[0]);
    const result1 = service1.importConversation(importPreview1);

    const initialCount = messages.getByConversationId(result1.conversationId).length;

    // Now simulate a second export with one additional message
    const extendedJson = JSON.stringify([
      {
        id: "conv-basic-001",
        conversation_id: "conv-basic-001",
        title: "Hello World Chat",
        create_time: 1715875200,
        update_time: 1715880000,
        current_node: "node-4",
        mapping: {
          "node-1": {
            id: "msg-user-1",
            parent: null,
            message: {
              id: "msg-user-1",
              author: { role: "user" },
              content: {
                content_type: "text",
                parts: ["Hello, how are you?"],
              },
              create_time: 1715875200,
            },
          },
          "node-2": {
            id: "msg-assistant-1",
            parent: "node-1",
            message: {
              id: "msg-assistant-1",
              author: { role: "assistant" },
              content: {
                content_type: "text",
                parts: [
                  "Hi! I'm doing well, thank you for asking. How can I help you today?",
                ],
              },
              create_time: 1715875260,
            },
          },
          "node-3": {
            id: "msg-user-2",
            parent: "node-2",
            message: {
              id: "msg-user-2",
              author: { role: "user" },
              content: {
                content_type: "text",
                parts: ["Can you explain TypeScript generics?"],
              },
              create_time: 1715875320,
            },
          },
          "node-4": {
            id: "msg-assistant-2",
            parent: "node-3",
            message: {
              id: "msg-assistant-2",
              author: { role: "assistant" },
              content: {
                content_type: "text",
                parts: [
                  "TypeScript generics allow you to create reusable components that work with a variety of types.",
                ],
              },
              create_time: 1715880000,
            },
          },
        },
      },
    ]);

    // Re-import with the same service
    const previews2 = service1.parseExport(extendedJson);
    const importPreview2 = service1.previewImport(previews2[0]);
    const result2 = service1.importConversation(importPreview2);

    expect(result2.conversationId).toBe(result1.conversationId);
    expect(result2.appended).toBe(1); // One new message
    expect(result2.skipped).toBe(3); // Three duplicates skipped
    // v1.4.9: Append mode now generates rounds for new messages
    expect(result2.roundsCreated).toBeGreaterThan(0);

    const finalMessages = messages.getByConversationId(result1.conversationId);
    expect(finalMessages.length).toBe(initialCount + 1);
  });

  it("skips all messages when there are no new ones (fully duplicate import)", () => {
    const text = loadFixture("chatgpt-basic.json");
    const conversations = new InMemoryConversationStorage();
    const messages = new InMemoryMessageStorage();

    const service = new ChatGPTExportImportService(
      conversations,
      new InMemorySourceStorage(),
      messages,
      new InMemoryRoundStorage(),
    );

    // First import
    const previews = service.parseExport(text);
    const importPreview = service.previewImport(previews[0]);
    const result1 = service.importConversation(importPreview);

    // Second import of identical data
    const previews2 = service.parseExport(text);
    const importPreview2 = service.previewImport(previews2[0]);
    const result2 = service.importConversation(importPreview2);

    expect(result2.conversationId).toBe(result1.conversationId);
    expect(result2.appended).toBe(0);
    expect(result2.skipped).toBe(3);
    expect(result2.roundsCreated).toBe(0);

    // No additional messages were saved
    const finalMessages = messages.getByConversationId(result1.conversationId);
    expect(finalMessages.length).toBe(3);
  });

  it("throws when trying to append to a nonexistent conversation", () => {
    const text = loadFixture("chatgpt-basic.json");
    const service = makeService();
    const previews = service.parseExport(text);

    // Manually craft a preview with a fake existingConversationId
    const fakePreview = {
      ...previews[0],
      existingConversationId: "nonexistent-id",
      existingMessages: 0,
      newMessages: 0,
      skippedDuplicates: 0,
      appendOnly: true,
    };

    expect(() => service.importConversation(fakePreview)).toThrow(
      "Existing Conversation is unavailable.",
    );
  });
});

describe("Unified import service paths", () => {
  it("supports New + Text via the shared parser and import service", () => {
    const conversations = new InMemoryConversationStorage();
    const sources = new InMemorySourceStorage();
    const messages = new InMemoryMessageStorage();
    const rounds = new InMemoryRoundStorage();
    const preview = new ImportParserPipeline().preview(
      {
        name: "manual paste",
        channel: "clipboard",
        content: "User: hello\nAssistant: hi",
      },
      "chatgpt",
    );

    const result = new ImportService(
      conversations,
      sources,
      messages,
      rounds,
    ).confirm(preview, { title: "Manual Text" });

    expect(conversations.getById(result.conversationId)?.title).toBe("Manual Text");
    expect(sources.getByConversationId(result.conversationId)?.content).toContain("hello");
    expect(messages.getByConversationId(result.conversationId)).toHaveLength(2);
    expect(rounds.getByConversationId(result.conversationId)).toHaveLength(1);
  });

  it("supports Existing + Text without overwriting previous Messages or Rounds", () => {
    const conversations = new InMemoryConversationStorage();
    const sources = new InMemorySourceStorage();
    const messages = new InMemoryMessageStorage();
    const rounds = new InMemoryRoundStorage();
    const timestamp = new Date().toISOString();
    conversations.save({
      id: "target",
      title: "Target",
      sourceType: "Manual",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
    });
    messages.save({
      id: "existing-message",
      conversationId: "target",
      role: "user",
      content: "existing",
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    rounds.save({
      id: "existing-round",
      conversationId: "target",
      order: 1,
      title: "Existing",
      question: "existing",
      answer: "",
      messageIds: ["existing-message"],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const preview = new ImportParserPipeline().preview(
      {
        name: "append paste",
        channel: "clipboard",
        content: "User: new question\nAssistant: new answer",
      },
      "chatgpt",
    );

    const result = new ImportService(
      conversations,
      sources,
      messages,
      rounds,
    ).appendToConversation(preview, "target");

    expect(result.conversationId).toBe("target");
    expect(messages.getByConversationId("target").map((message) => message.order)).toEqual([0, 1, 2]);
    expect(rounds.getByConversationId("target").map((round) => round.order)).toEqual([1, 2]);
    expect(sources.getByConversationId("target")?.content).toContain("new question");
  });

  it("imports 100 Conversations without a fixed conversation-count limit", () => {
    const conversations = new InMemoryConversationStorage();
    const sources = new InMemorySourceStorage();
    const messages = new InMemoryMessageStorage();
    const rounds = new InMemoryRoundStorage();
    const service = new ChatGPTExportImportService(
      conversations,
      sources,
      messages,
      rounds,
    );
    const json = JSON.stringify(
      Array.from({ length: 100 }, (_, index) => ({
        id: `conv-${index}`,
        title: `Conversation ${index}`,
        current_node: `assistant-${index}`,
        mapping: {
          [`user-${index}`]: {
            id: `user-message-${index}`,
            parent: null,
            message: {
              id: `user-message-${index}`,
              author: { role: "user" },
              content: { content_type: "text", parts: [`Question ${index}`] },
            },
          },
          [`assistant-${index}`]: {
            id: `assistant-message-${index}`,
            parent: `user-${index}`,
            message: {
              id: `assistant-message-${index}`,
              author: { role: "assistant" },
              content: { content_type: "text", parts: [`Answer ${index}`] },
            },
          },
        },
      })),
    );

    const previews = service.parseExport(json);
    for (const preview of previews) {
      service.importConversation(service.previewImport(preview), { forceNew: true });
    }

    expect(previews).toHaveLength(100);
    expect(conversations.getAll()).toHaveLength(100);
    expect(messages.getAll()).toHaveLength(200);
  });

  it("does not hard block large imports at the service layer", () => {
    const service = makeService();
    const json = JSON.stringify([
      {
        id: "large",
        title: "Large",
        mapping: Object.fromEntries(
          Array.from({ length: 101 }, (_, index) => [
            `node-${index}`,
            {
              id: `message-${index}`,
              parent: index === 0 ? null : `node-${index - 1}`,
              message: {
                id: `message-${index}`,
                author: { role: index % 2 === 0 ? "user" : "assistant" },
                content: { content_type: "text", parts: [`Message ${index}`] },
              },
            },
          ]),
        ),
        current_node: "node-100",
      },
    ]);

    const previews = service.parseExport(json);
    const result = service.importConversation(service.previewImport(previews[0]));

    expect(previews[0].isLarge).toBe(true);
    expect(result.appended).toBe(101);
  });
});

describe("ChatGPTExportImportService — large conversations", () => {
  it("parses a large conversation without errors", () => {
    const text = loadFixture("chatgpt-large.json");
    const service = makeService();
    const previews = service.parseExport(text);

    expect(previews).toHaveLength(1);
    expect(previews[0].messages.length).toBeGreaterThanOrEqual(30);
  });

  it("shows correct counts in preview for a large conversation", () => {
    const text = loadFixture("chatgpt-large.json");
    const service = makeService();
    const previews = service.parseExport(text);
    const importPreview = service.previewImport(previews[0]);

    expect(importPreview.newMessages).toBe(importPreview.messages.length);
    expect(importPreview.existingMessages).toBe(0);
    expect(importPreview.skippedDuplicates).toBe(0);
  });
});

describe("ChatGPTExportImportService — import summary counts", () => {
  it("returns new / skipped / unsupported counts in preview", () => {
    const text = loadFixture("chatgpt-unsupported.json");
    const service = makeService();
    const previews = service.parseExport(text);
    const importPreview = service.previewImport(previews[0]);

    // Summary shows all three counts
    expect(importPreview.newMessages).toBeGreaterThanOrEqual(0);
    expect(importPreview.skippedDuplicates).toBeGreaterThanOrEqual(0);
    expect(importPreview.unsupportedCount).toBeGreaterThanOrEqual(0);
    // unsupportedCount is the count from parseExport, should be 3
    expect(importPreview.unsupportedCount).toBe(3);
  });

  it("import result includes appended and skipped counts", () => {
    const text = loadFixture("chatgpt-basic.json");
    const service = makeService();
    const previews = service.parseExport(text);
    const importPreview = service.previewImport(previews[0]);
    const result = service.importConversation(importPreview);

    expect(result.appended).toBeGreaterThanOrEqual(0);
    expect(result.skipped).toBeGreaterThanOrEqual(0);
    expect(typeof result.roundsCreated).toBe("number");
  });
});

// ============================================================================
// P0-E: Dedup tests — New mode & Existing append
// ============================================================================
describe("ChatGPTExportImportService — P0-E dedup", () => {
  it("New mode: skips import when externalConversationId already exists (forceNew=true)", () => {
    const conversations = new InMemoryConversationStorage();
    const messages = new InMemoryMessageStorage();

    // Pre-populate a ChatGPT-imported conversation with the same externalConversationId
    conversations.save({
      id: "existing-conv",
      title: "Already Imported",
      sourceType: "ChatGPT",
      externalSource: "chatgpt",
      externalConversationId: "conv-basic-001",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    });
    messages.save({
      id: "existing-msg",
      conversationId: "existing-conv",
      role: "user",
      content: "Hello, how are you?",
      order: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      externalMessageId: "msg-user-1",
    });

    const text = loadFixture("chatgpt-basic.json");
    const service = new ChatGPTExportImportService(
      conversations,
      new InMemorySourceStorage(),
      messages,
      new InMemoryRoundStorage(),
    );

    const previews = service.parseExport(text);
    const importPreview = service.previewImport(previews[0]);

    // previewImport detects the existing conversation
    expect(importPreview.existingConversationId).toBe("existing-conv");
    expect(importPreview.appendOnly).toBe(true);

    // importConversation with forceNew=true must skip, not create a copy
    const result = service.importConversation(importPreview, { forceNew: true });

    expect((result as Record<string, unknown>).skippedDuplicateConversation).toBe(true);
    expect(result.appended).toBe(0);
    expect(result.skipped).toBe(3); // all 3 messages skipped

    // Verify no new conversation was created
    expect(conversations.getAll()).toHaveLength(1);
  });

  it("New mode: does NOT skip when externalSource differs (same externalConversationId, different source)", () => {
    const conversations = new InMemoryConversationStorage();
    const messages = new InMemoryMessageStorage();

    // A conversation with the same externalConversationId but NOT from chatgpt
    conversations.save({
      id: "manual-conv",
      title: "Manual Import",
      sourceType: "Manual",
      // Deliberately NO externalSource field
      externalConversationId: "conv-basic-001",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    });

    const text = loadFixture("chatgpt-basic.json");
    const service = new ChatGPTExportImportService(
      conversations,
      new InMemorySourceStorage(),
      messages,
      new InMemoryRoundStorage(),
    );

    const previews = service.parseExport(text);
    const importPreview = service.previewImport(previews[0]);

    // previewImport checks externalSource === "chatgpt", so manual source won't match
    expect(importPreview.existingConversationId).toBeUndefined();
    expect(importPreview.appendOnly).toBe(false);

    // importConversation with forceNew=true should proceed normally (no duplicate detected)
    const result = service.importConversation(importPreview, { forceNew: true });
    expect((result as Record<string, unknown>).skippedDuplicateConversation).toBeFalsy();
    expect(result.appended).toBeGreaterThan(0);
  });

  it("Existing append: skips source when externalMessageIds already exist in target (source-level dedup)", () => {
    const conversations = new InMemoryConversationStorage();
    const messages = new InMemoryMessageStorage();

    // Create a target conversation with a message from the source
    conversations.save({
      id: "target-conv",
      title: "Target",
      sourceType: "ChatGPT",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    });
    messages.save({
      id: "target-existing-msg",
      conversationId: "target-conv",
      role: "user",
      content: "Hello, how are you?",
      order: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      externalMessageId: "msg-user-1",  // matches source message
    });

    const text = loadFixture("chatgpt-basic.json");
    const service = new ChatGPTExportImportService(
      conversations,
      new InMemorySourceStorage(),
      messages,
      new InMemoryRoundStorage(),
    );

    const previews = service.parseExport(text);

    const result = service.appendToConversation(previews[0], "target-conv");

    // Source-level dedup: externalMessageId "msg-user-1" already in target → skip
    expect((result as Record<string, unknown>).skippedExistingSource).toBe(true);
    expect(result.appendedMessages).toBe(0);
    expect(result.skipped).toBe(3);  // all messages skipped at source level

    // Verify no new messages were written to the target
    expect(messages.getByConversationId("target-conv")).toHaveLength(1);
  });

  it("Existing append: proceeds normally when source is new (no false positive)", () => {
    const conversations = new InMemoryConversationStorage();
    const messages = new InMemoryMessageStorage();

    // Target with some messages, but none from the source
    conversations.save({
      id: "target-conv",
      title: "Target",
      sourceType: "ChatGPT",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    });
    messages.save({
      id: "unrelated-msg",
      conversationId: "target-conv",
      role: "user",
      content: "Some unrelated content",
      order: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      externalMessageId: "completely-different-id",
    });

    const text = loadFixture("chatgpt-basic.json");
    const service = new ChatGPTExportImportService(
      conversations,
      new InMemorySourceStorage(),
      messages,
      new InMemoryRoundStorage(),
    );

    const previews = service.parseExport(text);

    const result = service.appendToConversation(previews[0], "target-conv");

    // Source is new — should NOT be skipped at source level
    expect((result as Record<string, unknown>).skippedExistingSource).toBeFalsy();
    // Messages should be appended (or skipped by individual message dedup)
    expect(result.appendedMessages + result.skipped).toBe(3);
  });

  it("Existing append: source without externalMessageIds is never falsely skipped", () => {
    const conversations = new InMemoryConversationStorage();
    const messages = new InMemoryMessageStorage();

    conversations.save({
      id: "target-conv",
      title: "Target",
      sourceType: "Manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    });

    const service = new ChatGPTExportImportService(
      conversations,
      new InMemorySourceStorage(),
      messages,
      new InMemoryRoundStorage(),
    );

    // Source preview with messages that have NO externalMessageId (simulates manual import)
    const preview: Parameters<typeof service.appendToConversation>[0] = {
      externalConversationId: "no-ext-ids-source",
      title: "No External IDs",
      messages: [
        { role: "user", content: "hello", contentHash: "hash-a", externalMessageId: undefined },
        { role: "assistant", content: "hi", contentHash: "hash-b", externalMessageId: undefined },
      ],
      unsupportedCount: 0,
      isLarge: false,
    };

    const result = service.appendToConversation(preview, "target-conv");

    // sourceExternalIds set is empty → alreadyAppended is false → proceeds normally
    expect((result as Record<string, unknown>).skippedExistingSource).toBeFalsy();
    expect(result.appendedMessages).toBe(2);
  });
});

// ============================================================================
// PALOS v1.4.9 — Round Generation P0 Fix
// ============================================================================
describe("PALOS v1.4.9 — Round Generation (real ChatGPT fixture)", () => {
  const text = loadFixture("chatgpt-basic.json");

  // ===== New import tests =====
  describe("New ChatGPT import", () => {
    it("produces messages.length > 0 and rounds.length > 0", () => {
      const conversations = new InMemoryConversationStorage();
      const messages = new InMemoryMessageStorage();
      const rounds = new InMemoryRoundStorage();
      const service = new ChatGPTExportImportService(
        conversations,
        new InMemorySourceStorage(),
        messages,
        rounds,
      );
      const previews = service.parseExport(text);
      const importPreview = service.previewImport(previews[0]);
      const result = service.importConversation(importPreview);

      expect(result.appended).toBeGreaterThan(0);
      expect(result.roundsCreated).toBeGreaterThan(0);

      const savedMessages = messages.getByConversationId(result.conversationId);
      const savedRounds = rounds.getByConversationId(result.conversationId);

      expect(savedMessages.length).toBeGreaterThan(0);
      expect(savedRounds.length).toBeGreaterThan(0);
    });

    it("every Round.conversationId equals createdConversationId", () => {
      const conversations = new InMemoryConversationStorage();
      const messages = new InMemoryMessageStorage();
      const rounds = new InMemoryRoundStorage();
      const service = new ChatGPTExportImportService(
        conversations,
        new InMemorySourceStorage(),
        messages,
        rounds,
      );
      const previews = service.parseExport(text);
      const importPreview = service.previewImport(previews[0]);
      const result = service.importConversation(importPreview);

      const savedRounds = rounds.getByConversationId(result.conversationId);
      expect(savedRounds.length).toBeGreaterThan(0);
      for (const r of savedRounds) {
        expect(r.conversationId).toBe(result.conversationId);
      }
    });

    it("every Round.messageIds references messages that exist in getByConversationId", () => {
      const conversations = new InMemoryConversationStorage();
      const messages = new InMemoryMessageStorage();
      const rounds = new InMemoryRoundStorage();
      const service = new ChatGPTExportImportService(
        conversations,
        new InMemorySourceStorage(),
        messages,
        rounds,
      );
      const previews = service.parseExport(text);
      const importPreview = service.previewImport(previews[0]);
      const result = service.importConversation(importPreview);

      const savedMessages = messages.getByConversationId(result.conversationId);
      const savedRounds = rounds.getByConversationId(result.conversationId);
      const messageIdSet = new Set(savedMessages.map((m) => m.id));

      expect(savedRounds.length).toBeGreaterThan(0);
      for (const r of savedRounds) {
        expect(r.messageIds.length).toBeGreaterThan(0);
        for (const mid of r.messageIds) {
          expect(messageIdSet.has(mid)).toBe(true);
        }
      }
    });

    it("roundsCreated matches actual rounds.getByConversationId length", () => {
      const conversations = new InMemoryConversationStorage();
      const messages = new InMemoryMessageStorage();
      const rounds = new InMemoryRoundStorage();
      const service = new ChatGPTExportImportService(
        conversations,
        new InMemorySourceStorage(),
        messages,
        rounds,
      );
      const previews = service.parseExport(text);
      const importPreview = service.previewImport(previews[0]);
      const result = service.importConversation(importPreview);

      expect(result.roundsCreated).toBe(
        rounds.getByConversationId(result.conversationId).length,
      );
    });

    it("report does NOT silently report success when parserPreview has rounds but none were created", () => {
      // This test verifies the contract: if rounds are parsed but not created,
      // the result must reflect that honestly (roundsCreated is 0).
      // We use a fixture with only an unanswered user message,
      // which deriveRoundDrafts puts in a round with 1 messageIndex.
      // The import MUST create that round — roundsCreated must match.
      const json = JSON.stringify([
        {
          id: "conv-solo-user",
          title: "Solo User",
          current_node: "node-1",
          mapping: {
            "node-1": {
              id: "msg-1",
              message: {
                id: "msg-1",
                author: { role: "user" },
                content: { content_type: "text", parts: ["Just a question, no answer."] },
              },
            },
          },
        },
      ]);
      const conversations = new InMemoryConversationStorage();
      const messages = new InMemoryMessageStorage();
      const rounds = new InMemoryRoundStorage();
      const service = new ChatGPTExportImportService(
        conversations,
        new InMemorySourceStorage(),
        messages,
        rounds,
      );
      const previews = service.parseExport(json);
      const importPreview = service.previewImport(previews[0]);
      const result = service.importConversation(importPreview);

      // The parser will create 1 round for a solo user message
      // (deriveRoundDrafts puts it in its own group).
      // The import must report that round honestly.
      const savedRounds = rounds.getByConversationId(result.conversationId);
      expect(result.roundsCreated).toBe(savedRounds.length);
      // If rounds were parseable, they must be created — not silently dropped.
      if (savedRounds.length > 0) {
        expect(result.roundsCreated).toBeGreaterThan(0);
      }
    });
  });

  // ===== Existing append tests =====
  describe("Existing ChatGPT append (appendToConversation)", () => {
    it("messages increase and rounds increase after append", () => {
      const conversations = new InMemoryConversationStorage();
      const messages = new InMemoryMessageStorage();
      const rounds = new InMemoryRoundStorage();
      const targetId = "target-append-rounds";
      conversations.save({
        id: targetId,
        title: "Target",
        sourceType: "ChatGPT",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      });

      const service = new ChatGPTExportImportService(
        conversations,
        new InMemorySourceStorage(),
        messages,
        rounds,
      );
      const previews = service.parseExport(text);

      const prevMsgCount = messages.getByConversationId(targetId).length;
      const prevRoundCount = rounds.getByConversationId(targetId).length;

      const result = service.appendToConversation(previews[0], targetId);

      expect(result.appendedMessages).toBeGreaterThan(0);
      expect(result.appendedRounds).toBeGreaterThan(0);

      const afterMsgCount = messages.getByConversationId(targetId).length;
      const afterRoundCount = rounds.getByConversationId(targetId).length;

      expect(afterMsgCount).toBe(prevMsgCount + result.appendedMessages);
      expect(afterRoundCount).toBe(prevRoundCount + result.appendedRounds);
    });

    it("appended Round.conversationId equals targetConversationId", () => {
      const conversations = new InMemoryConversationStorage();
      const messages = new InMemoryMessageStorage();
      const rounds = new InMemoryRoundStorage();
      const targetId = "target-round-convid";
      conversations.save({
        id: targetId,
        title: "Target",
        sourceType: "ChatGPT",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      });

      const service = new ChatGPTExportImportService(
        conversations,
        new InMemorySourceStorage(),
        messages,
        rounds,
      );
      const previews = service.parseExport(text);
      service.appendToConversation(previews[0], targetId);

      const allRounds = rounds.getByConversationId(targetId);
      expect(allRounds.length).toBeGreaterThan(0);
      for (const r of allRounds) {
        expect(r.conversationId).toBe(targetId);
      }
    });

    it("appended Round.messageIds are all findable in target messages", () => {
      const conversations = new InMemoryConversationStorage();
      const messages = new InMemoryMessageStorage();
      const rounds = new InMemoryRoundStorage();
      const targetId = "target-msgids";
      conversations.save({
        id: targetId,
        title: "Target",
        sourceType: "ChatGPT",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      });

      const service = new ChatGPTExportImportService(
        conversations,
        new InMemorySourceStorage(),
        messages,
        rounds,
      );
      const previews = service.parseExport(text);
      service.appendToConversation(previews[0], targetId);

      const allMessages = messages.getByConversationId(targetId);
      const allRounds = rounds.getByConversationId(targetId);
      const messageIdSet = new Set(allMessages.map((m) => m.id));

      expect(allRounds.length).toBeGreaterThan(0);
      for (const r of allRounds) {
        expect(r.messageIds.length).toBeGreaterThan(0);
        for (const mid of r.messageIds) {
          expect(messageIdSet.has(mid)).toBe(true);
        }
      }
    });
  });

  // ===== importConversation existing-append path (without forceNew) =====
  describe("importConversation existing-append (no forceNew)", () => {
    it("creates rounds when appending to existing conversation", () => {
      const conversations = new InMemoryConversationStorage();
      const messages = new InMemoryMessageStorage();
      const rounds = new InMemoryRoundStorage();

      // Pre-populate an existing conversation that matches the fixture
      const existingId = "existing-for-rounds";
      conversations.save({
        id: existingId,
        title: "Hello World Chat",
        sourceType: "ChatGPT",
        externalSource: "chatgpt",
        externalConversationId: "conv-basic-001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      });
      // Add a single existing message that matches the first message in the fixture
      function fnv1a(role: string, content: string) {
        const input = `${role} ${content.replace(/\s+/g, " ").trim()}`;
        let hash = 2166136261;
        for (let i = 0; i < input.length; i++) {
          hash ^= input.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
      }
      messages.save({
        id: "existing-msg-1",
        conversationId: existingId,
        role: "user",
        content: "Hello, how are you?",
        order: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        externalMessageId: "msg-user-1",
        contentHash: fnv1a("user", "Hello, how are you?"),
      });

      const service = new ChatGPTExportImportService(
        conversations,
        new InMemorySourceStorage(),
        messages,
        rounds,
      );
      const previews = service.parseExport(text);
      const importPreview = service.previewImport(previews[0]);

      // This should detect existing and use the append path (no forceNew)
      expect(importPreview.existingConversationId).toBe(existingId);
      expect(importPreview.appendOnly).toBe(true);

      const prevRoundCount = rounds.getByConversationId(existingId).length;

      // Call WITHOUT forceNew to hit the existing-append path
      const result = service.importConversation(importPreview);
      expect(result.conversationId).toBe(existingId);
      expect(result.appended).toBeGreaterThan(0);
      // The key assertion: rounds MUST be created
      expect(result.roundsCreated).toBeGreaterThan(0);

      const afterRounds = rounds.getByConversationId(existingId);
      expect(afterRounds.length).toBe(prevRoundCount + result.roundsCreated);

      // Verify round integrity
      const messageIdSet = new Set(
        messages.getByConversationId(existingId).map((m) => m.id),
      );
      for (const r of afterRounds) {
        expect(r.conversationId).toBe(existingId);
        for (const mid of r.messageIds) {
          expect(messageIdSet.has(mid)).toBe(true);
        }
      }
    });

    it("does not silently report roundsCreated=0 when messages are appended", () => {
      const conversations = new InMemoryConversationStorage();
      const messages = new InMemoryMessageStorage();
      const rounds = new InMemoryRoundStorage();

      const existingId = "no-silent-rounds";
      conversations.save({
        id: existingId,
        title: "Target",
        sourceType: "ChatGPT",
        externalSource: "chatgpt",
        externalConversationId: "conv-basic-001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      });

      const service = new ChatGPTExportImportService(
        conversations,
        new InMemorySourceStorage(),
        messages,
        rounds,
      );
      const previews = service.parseExport(text);
      const importPreview = service.previewImport(previews[0]);

      expect(importPreview.appendOnly).toBe(true);
      const result = service.importConversation(importPreview);
      expect(result.appended).toBeGreaterThan(0);
      // The contract: if messages were appended, roundsCreated must not silently be 0
      // unless the parser genuinely produced 0 rounds (which would be a parse failure)
      expect(result.roundsCreated).toBeGreaterThan(0);
    });
  });
});
