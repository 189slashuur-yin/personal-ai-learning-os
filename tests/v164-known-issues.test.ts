import { describe, expect, it } from "vitest";
import { ChatGPTExportImportService } from "@/core/services/chatgpt-export-import";
import { ImportParserPipeline, deriveRoundDrafts } from "@/core/services/import-parser-pipeline";
import { ImportService } from "@/core/services/import-service";
import {
  buildImportPageSearch,
  decodeUtf8Text,
  deriveActiveImportSection,
  parseImportPageState,
} from "@/core/services/import-page-state";
import {
  createImportOperationProgress,
  failImportOperation,
  updateImportOperationProgress,
} from "@/core/services/import-operation-state";
import {
  deriveConversationQuickFilterIds,
  filterConversationQuickItems,
} from "@/core/services/conversation-quick-filters";
import {
  InMemoryConversationStorage,
  InMemoryMessageStorage,
  InMemoryRoundStorage,
  InMemorySourceStorage,
} from "./fakes";

function makeStores() {
  return {
    conversations: new InMemoryConversationStorage(),
    sources: new InMemorySourceStorage(),
    messages: new InMemoryMessageStorage(),
    rounds: new InMemoryRoundStorage(),
  };
}

function seedTarget(stores: ReturnType<typeof makeStores>, id = "target") {
  stores.conversations.save({
    id,
    title: "Target",
    sourceType: "Manual",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    lastOpenedAt: "2026-07-16T00:00:00.000Z",
  });
}

function chatPreview(externalConversationId = "chat-source") {
  return {
    externalConversationId,
    title: "Chat source",
    messages: [
      {
        externalMessageId: `${externalConversationId}-u1`,
        role: "user" as const,
        content: "Question?",
        contentHash: "same-user-content",
      },
      {
        externalMessageId: `${externalConversationId}-a1`,
        role: "assistant" as const,
        content: "Answer.",
        contentHash: "same-assistant-content",
      },
    ],
    unsupportedCount: 0,
    isLarge: false,
  };
}

function textPreview(parserId: "chatgpt" | "manual" | "txt") {
  return new ImportParserPipeline().preview(
    {
      name: parserId === "txt" ? "notes.txt" : "Pasted Conversation",
      channel: parserId === "txt" ? "file" : "clipboard",
      content: "User: Question?\nAssistant: Answer.",
      mediaType: parserId === "txt" ? "text/plain" : undefined,
    },
    parserId,
  );
}

describe("PALOS v1.6.4 — six import combinations", () => {
  it.each([
    ["Paste", "chatgpt"],
    ["TXT", "txt"],
  ] as const)("New + %s creates one Conversation with valid Messages/Rounds", (_, parserId) => {
    const stores = makeStores();
    const result = new ImportService(
      stores.conversations,
      stores.sources,
      stores.messages,
      stores.rounds,
    ).confirm(textPreview(parserId), { title: "New import" });

    expect(stores.conversations.getAll()).toHaveLength(1);
    expect(stores.messages.getByConversationId(result.conversationId)).toHaveLength(result.messageCount);
    expect(stores.rounds.getByConversationId(result.conversationId)).toHaveLength(result.roundCount);
  });

  it("New + ChatGPT creates one structured Conversation", () => {
    const stores = makeStores();
    const service = new ChatGPTExportImportService(
      stores.conversations,
      stores.sources,
      stores.messages,
      stores.rounds,
    );
    const result = service.importConversation(service.previewImport(chatPreview()), {
      forceNew: true,
    });
    expect(stores.conversations.getAll()).toHaveLength(1);
    expect(result.appended).toBe(2);
    expect(result.roundsCreated).toBe(1);
  });

  it.each([
    ["Paste", "manual"],
    ["TXT", "txt"],
  ] as const)("Existing + %s appends without creating another Conversation", (_, parserId) => {
    const stores = makeStores();
    seedTarget(stores);
    stores.sources.save({
      id: "seed-source",
      conversationId: "target",
      kind: "text",
      name: "seed.txt",
      content: "User: Seed?\nAssistant: Seed.",
      importedAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    });
    const service = new ImportService(
      stores.conversations,
      stores.sources,
      stores.messages,
      stores.rounds,
    );
    const result = service.appendToConversation(textPreview(parserId), "target");
    const messages = stores.messages.getByConversationId("target");
    const rounds = stores.rounds.getByConversationId("target");
    const messageIds = new Set(messages.map((message) => message.id));

    expect(stores.conversations.getAll()).toHaveLength(1);
    expect(result.messageCount).toBe(messages.length);
    expect(result.roundCount).toBe(rounds.length);
    expect(messages.every((message) => message.conversationId === "target")).toBe(true);
    expect(rounds.every((round) => round.conversationId === "target")).toBe(true);
    expect(rounds.flatMap((round) => round.messageIds).every((id) => messageIds.has(id))).toBe(true);
    expect(stores.sources.getAll()).toHaveLength(2);
    expect(stores.sources.getAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
        id: result.sourceId,
        conversationId: "target",
        name: parserId === "txt" ? "notes.txt" : "Pasted Conversation",
      }),
      ]),
    );
  });

  it("Existing + ChatGPT appends to the selected target", () => {
    const stores = makeStores();
    seedTarget(stores);
    const result = new ChatGPTExportImportService(
      stores.conversations,
      stores.sources,
      stores.messages,
      stores.rounds,
    ).appendToConversation(chatPreview(), "target");
    expect(stores.conversations.getAll()).toHaveLength(1);
    expect(result.appendedMessages).toBe(2);
    expect(result.appendedRounds).toBe(1);
  });
});

describe("PALOS v1.6.4 — invalid TXT", () => {
  it.each(["", "  \n\t"])("rejects empty or whitespace-only TXT", (content) => {
    const preview = new ImportParserPipeline().preview(
      { name: "empty.txt", channel: "file", content },
      "txt",
    );
    expect(preview.canConfirm).toBe(false);
    expect(preview.errors).not.toHaveLength(0);
  });

  it("rejects TXT without parseable role labels", () => {
    const preview = new ImportParserPipeline().preview(
      { name: "plain.txt", channel: "file", content: "plain unlabeled prose" },
      "txt",
    );
    expect(preview.canConfirm).toBe(false);
    expect(preview.errors.join(" ")).toContain("parseable speaker labels");
  });

  it("rejects invalid UTF-8 bytes", () => {
    const bytes = Uint8Array.from([0xff, 0xfe, 0xfd]);
    expect(() => decodeUtf8Text(bytes.buffer)).toThrow();
  });
});

describe("PALOS v1.6.4 — mode and URL state", () => {
  it("supports one distinct input section for ChatGPT, Paste, and TXT", () => {
    expect(deriveActiveImportSection("json")).toBe("chatgpt-export");
    expect(deriveActiveImportSection("paste")).toBe("paste-text");
    expect(deriveActiveImportSection("txt")).toBe("txt-file");
  });

  it("Existing → New removes stale target params", () => {
    const search = buildImportPageSearch(
      "importPath=existing&inputMode=txt&existingTargetId=old&targetConversationId=legacy",
      { importPath: "new", inputMode: "txt", existingTargetId: "old" },
    );
    const parsed = parseImportPageState(new URLSearchParams(search));
    expect(parsed).toEqual({ importPath: "new", inputMode: "txt", existingTargetId: "" });
    expect(search).not.toContain("targetConversationId");
    expect(search).not.toContain("existingTargetId");
  });

  it("New → Existing starts without a stale target and input switches roundtrip", () => {
    const existing = buildImportPageSearch("", {
      importPath: "existing",
      inputMode: "json",
      existingTargetId: "",
    });
    expect(parseImportPageState(new URLSearchParams(existing))).toEqual({
      importPath: "existing",
      inputMode: "json",
      existingTargetId: "",
    });
    const txt = buildImportPageSearch(existing, {
      importPath: "existing",
      inputMode: "txt",
      existingTargetId: "target",
    });
    const paste = buildImportPageSearch(txt, {
      importPath: "existing",
      inputMode: "paste",
      existingTargetId: "target",
    });
    expect(parseImportPageState(new URLSearchParams(paste)).inputMode).toBe("paste");
  });
});

describe("PALOS v1.6.4 — duplicate boundaries", () => {
  it("same source/message identities are skipped on a repeated append", () => {
    const stores = makeStores();
    seedTarget(stores);
    const service = new ChatGPTExportImportService(
      stores.conversations,
      stores.sources,
      stores.messages,
      stores.rounds,
    );
    const first = service.appendToConversation(chatPreview("same-source"), "target");
    const second = service.appendToConversation(chatPreview("same-source"), "target");
    expect(first.appendedMessages).toBe(2);
    expect(second).toMatchObject({ appendedMessages: 0, skipped: 2, skippedExistingSource: true });
  });

  it("same content from different sources is not globally deduplicated", () => {
    const stores = makeStores();
    seedTarget(stores);
    const service = new ChatGPTExportImportService(
      stores.conversations,
      stores.sources,
      stores.messages,
      stores.rounds,
    );
    service.appendToConversation(chatPreview("source-a"), "target");
    const result = service.appendToConversation(chatPreview("source-b"), "target");
    expect(result).toMatchObject({ appendedMessages: 2, skipped: 0 });
    expect(stores.messages.getByConversationId("target")).toHaveLength(4);
  });

  it("legitimate repeated TXT messages are preserved once per parser result", () => {
    const stores = makeStores();
    seedTarget(stores);
    const preview = new ImportParserPipeline().preview(
      {
        name: "repeat.txt",
        channel: "file",
        content: "User: same\nAssistant: same\nUser: same\nAssistant: same",
      },
      "txt",
    );
    const result = new ImportService(
      stores.conversations,
      stores.sources,
      stores.messages,
      stores.rounds,
    ).appendToConversation(preview, "target");
    expect(result).toMatchObject({ messageCount: 4, roundCount: 2, skippedCount: 0 });
    expect(new Set(result.messageIds).size).toBe(4);
  });
});

describe("PALOS v1.6.4 — progress state", () => {
  it("moves importing → flushing → verifying → success with stable counters", () => {
    let state = createImportOperationProgress("importing", 2);
    state = updateImportOperationProgress(state, {
      phase: "importing",
      processedConversations: 2,
      importedMessages: 5,
      importedRounds: 3,
      skippedMessages: 1,
    });
    state = updateImportOperationProgress(state, { phase: "flushing" });
    state = updateImportOperationProgress(state, { phase: "verifying" });
    state = updateImportOperationProgress(state, { phase: "success" });
    expect(state).toMatchObject({
      phase: "success",
      processedConversations: 2,
      importedMessages: 5,
      importedRounds: 3,
      skippedMessages: 1,
      unprocessedConversations: 0,
    });
  });

  it("failed replaces success phase and a new operation clears old counters", () => {
    const success = updateImportOperationProgress(
      createImportOperationProgress("importing", 1),
      { phase: "success", processedConversations: 1, importedMessages: 2 },
    );
    expect(failImportOperation(success, "boom")).toMatchObject({ phase: "failed", error: "boom" });
    expect(createImportOperationProgress("importing", 3)).toMatchObject({
      importedMessages: 0,
      importedRounds: 0,
      skippedMessages: 0,
      selectedConversations: 3,
    });
  });

  it("quota-stopped reports processed and unprocessed conversations", () => {
    const state = updateImportOperationProgress(
      createImportOperationProgress("importing", 5),
      { phase: "quota-stopped", processedConversations: 2, importedMessages: 10 },
    );
    expect(state).toMatchObject({ phase: "quota-stopped", processedConversations: 2, unprocessedConversations: 3 });
  });
});

describe("PALOS v1.6.4 — quick filters and Round draft edges", () => {
  const items = [
    { conversation: { id: "manual", workspaceId: "a" }, messageCount: 2, roundCount: 1 },
    { conversation: { id: "empty", workspaceId: "a" }, messageCount: 0, roundCount: 0 },
    { conversation: { id: "imported", workspaceId: "b", externalSource: "chatgpt" as const }, messageCount: 2, roundCount: 1 },
    { conversation: { id: "failed", workspaceId: "a", externalSource: "chatgpt" as const }, messageCount: 0, roundCount: 0 },
  ];

  it("derives empty/imported/failed-import sets and composes with Workspace", () => {
    const ids = deriveConversationQuickFilterIds(items);
    expect([...ids.empty]).toEqual(["empty", "failed"]);
    expect([...ids.imported]).toEqual(["imported", "failed"]);
    expect([...ids.failedImport]).toEqual(["failed"]);
    expect(filterConversationQuickItems(items, "a", "empty").map((item) => item.conversation.id)).toEqual(["empty", "failed"]);
    expect(filterConversationQuickItems(items, "all", "imported").map((item) => item.conversation.id)).toEqual(["imported", "failed"]);
  });

  it("handles empty, context, orphan, unknown, and consecutive assistant groups", () => {
    expect(deriveRoundDrafts([])).toEqual([]);
    const rounds = deriveRoundDrafts([
      { role: "system", content: "context" },
      { role: "assistant", content: "orphan one" },
      { role: "assistant", content: "orphan two" },
      { role: "unknown", content: "unknown question" },
      { role: "assistant", content: "answer" },
    ]);
    expect(rounds).toHaveLength(3);
    expect(rounds[0]).toMatchObject({ question: "context", answer: "" });
    expect(rounds[1]).toMatchObject({ question: "", answer: "orphan one\n\norphan two" });
    expect(rounds[2]).toMatchObject({ question: "unknown question", answer: "answer" });
  });
});
