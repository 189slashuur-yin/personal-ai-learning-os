import { describe, expect, it } from "vitest";
import type {
  ShareSnapshotCanonicalWriteCommand,
  ShareSnapshotCanonicalWriteReceipt,
  ShareSnapshotCanonicalWriter,
} from "@/core/contracts/share-snapshot-canonical-writer";
import type { Conversation } from "@/core/entities/conversation";
import type {
  ChatGPTShareSnapshotMetadata,
  ImportedSource,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import type { ShareSnapshotCaptureRequest } from "@/core/models/share-snapshot-preview";
import { hashChatGPTShareSnapshot } from "@/core/services/chatgpt-share-snapshot-comparator";
import {
  ChatGPTShareSnapshotWorkflow,
  type ChatGPTShareSnapshotWorkflowStorages,
} from "@/core/services/chatgpt-share-snapshot-workflow";
import type { ChatGPTShareSnapshotIdKind } from "@/core/services/chatgpt-share-snapshot-service";
import {
  InMemoryConversationStorage,
  InMemoryMessageStorage,
  InMemoryRoundStorage,
  InMemorySourceStorage,
} from "./fakes";

const shareUrl = "https://chatgpt.com/share/12345678-abcd";
const capturedAt = "2026-07-27T03:00:00.000Z";
const previousAt = "2026-07-27T02:00:00.000Z";
const conversationId = "conversation-existing";
const sourceId = "source-existing";
const resourceHash =
  "0f2e08f750e63fe2358752c452398948d3d05519a3b07e359b5ac2ee23e6464d";

const sameTranscript = "User:\nQuestion\n\nAssistant:\nAnswer";
const appendTranscript =
  "User:\nQuestion\n\nAssistant:\nAnswer\n\nUser:\nFollow-up\n\nAssistant:\nFollow-up answer";

function conversation(
  id = conversationId,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id,
    title: "Preserved local title",
    sourceType: "ChatGPT",
    note: "important local note",
    summary: "important local summary",
    context: {
      longTermBackground: "important background",
      currentState: "important current state",
    },
    createdAt: previousAt,
    updatedAt: previousAt,
    lastOpenedAt: previousAt,
    ...overrides,
  };
}

function captureRequest(
  content = appendTranscript,
): ShareSnapshotCaptureRequest {
  return {
    shareUrl,
    snapshot: { kind: "pasted-text", content },
    newConversation: conversation("conversation-new", {
      title: "New conversation",
    }),
  };
}

async function shareMetadata(
  contents: readonly [string, string] = ["Question", "Answer"],
): Promise<ChatGPTShareSnapshotMetadata> {
  return {
    schemaVersion: 2,
    resourceHash,
    snapshotHash: await hashChatGPTShareSnapshot([
      { role: "user", content: contents[0], ordinal: 0 },
      { role: "assistant", content: contents[1], ordinal: 1 },
    ]),
    snapshotMessageCount: 2,
    capturedAt: previousAt,
    parserVersion: "1.0.0",
    inputKind: "pasted-text",
    hashAlgorithm: "sha256-json-role-content-v1",
    snapshotSequence: 1,
  };
}

async function existingRecords(): Promise<{
  conversation: Conversation;
  source: ImportedSource;
  messages: Message[];
  rounds: Round[];
}> {
  const targetConversation = conversation();
  const source: ImportedSource = {
    id: sourceId,
    conversationId,
    kind: "text",
    name: "Preserved source name",
    content: sameTranscript,
    importedAt: previousAt,
    updatedAt: previousAt,
    shareSnapshot: await shareMetadata(),
  };
  const messages: Message[] = [
    {
      id: "message-existing-1",
      conversationId,
      role: "user",
      content: "Question",
      order: 0,
      createdAt: previousAt,
      updatedAt: previousAt,
      sourceId,
      sourceOrdinal: 0,
    },
    {
      id: "message-existing-2",
      conversationId,
      role: "assistant",
      content: "Answer",
      order: 1,
      createdAt: previousAt,
      updatedAt: previousAt,
      sourceId,
      sourceOrdinal: 1,
    },
  ];
  const rounds: Round[] = [
    {
      id: "round-existing",
      conversationId,
      order: 1,
      title: "Existing round",
      question: "Question",
      answer: "Answer",
      messageIds: messages.map(({ id }) => id),
      note: "round note",
      summary: "round summary",
      context: {
        inheritanceMode: "inherit",
        snapshot: { currentState: "round context" },
        confirmedAt: previousAt,
      },
      createdAt: previousAt,
      updatedAt: previousAt,
    },
  ];
  return { conversation: targetConversation, source, messages, rounds };
}

class RecordingWriter implements ShareSnapshotCanonicalWriter {
  readonly commands: ShareSnapshotCanonicalWriteCommand[] = [];

  constructor(
    private readonly handler: (
      command: ShareSnapshotCanonicalWriteCommand,
    ) =>
      | ShareSnapshotCanonicalWriteReceipt
      | Promise<ShareSnapshotCanonicalWriteReceipt> = (command) => ({
      status: "written",
      conversationId: command.plan.conversation.id,
      sourceId: command.plan.source.id,
      writtenMessageCount: command.plan.messages.length,
      writtenRoundCount: command.plan.rounds.length,
      verifiedMessageCount: command.plan.messages.length,
      verifiedRoundCount: command.plan.rounds.length,
      pendingWriteCount: 0,
    }),
  ) {}

  async execute(
    command: ShareSnapshotCanonicalWriteCommand,
  ): Promise<ShareSnapshotCanonicalWriteReceipt> {
    this.commands.push(command);
    return this.handler(command);
  }
}

type WorkflowHarness = {
  storages: ChatGPTShareSnapshotWorkflowStorages;
  writer: RecordingWriter;
  workflow: ChatGPTShareSnapshotWorkflow;
};

function workflowHarness(writer = new RecordingWriter()): WorkflowHarness {
  const storages: ChatGPTShareSnapshotWorkflowStorages = {
    conversations: new InMemoryConversationStorage(),
    sources: new InMemorySourceStorage(),
    messages: new InMemoryMessageStorage(),
    rounds: new InMemoryRoundStorage(),
  };
  const idCounts = new Map<ChatGPTShareSnapshotIdKind, number>();
  let previewCount = 0;
  return {
    storages,
    writer,
    workflow: new ChatGPTShareSnapshotWorkflow(storages, {
      writer,
      createId(kind) {
        const next = (idCounts.get(kind) ?? 0) + 1;
        idCounts.set(kind, next);
        return `${kind}-new-${next}`;
      },
      createPreviewId() {
        previewCount += 1;
        return `preview-${previewCount}`;
      },
      now: () => capturedAt,
    }),
  };
}

async function seedExisting(
  storages: ChatGPTShareSnapshotWorkflowStorages,
): Promise<Awaited<ReturnType<typeof existingRecords>>> {
  const records = await existingRecords();
  storages.conversations.save(records.conversation);
  storages.sources.save(records.source);
  storages.messages.saveMany(records.messages);
  storages.rounds.saveMany(records.rounds);
  return records;
}

function storageSnapshot(
  storages: ChatGPTShareSnapshotWorkflowStorages,
): string {
  return JSON.stringify({
    conversations: storages.conversations.getAll(),
    sources: storages.sources.getAll(),
    messages: storages.messages.getAll(),
    rounds: storages.rounds.getAll(),
  });
}

describe("ChatGPT Share Snapshot application workflow", () => {
  it("resolves no matching Source as a new, confirmable preview without writing", async () => {
    const { workflow, storages, writer } = workflowHarness();
    const request = captureRequest();
    const inputBefore = JSON.stringify(request);
    const storageBefore = storageSnapshot(storages);

    const preview = await workflow.preview(request);

    expect(preview).toMatchObject({
      status: "new",
      target: {
        kind: "new",
        conversationId: "conversation-new",
      },
      summary: {
        existingMessageCount: 0,
        snapshotMessageCount: 4,
        newMessageCount: 4,
        existingRoundCount: 0,
        newRoundCount: 2,
      },
      confirmable: true,
    });
    expect(preview.baselineFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(preview).not.toHaveProperty("canonicalPlan");
    expect(preview).not.toHaveProperty("plan");
    expect(storageSnapshot(storages)).toBe(storageBefore);
    expect(writer.commands).toHaveLength(0);
    expect(JSON.stringify(request)).toBe(inputBefore);
  });

  it("resolves one matching Source to append or same without changing enrichment", async () => {
    const appendHarness = workflowHarness();
    await seedExisting(appendHarness.storages);
    const enrichmentBefore = storageSnapshot(appendHarness.storages);

    const appendPreview =
      await appendHarness.workflow.preview(captureRequest());

    expect(appendPreview).toMatchObject({
      status: "append",
      target: {
        kind: "existing",
        conversationId,
        sourceId,
      },
      summary: {
        existingMessageCount: 2,
        snapshotMessageCount: 4,
        newMessageCount: 2,
        existingRoundCount: 1,
        newRoundCount: 1,
      },
      confirmable: true,
    });
    expect(storageSnapshot(appendHarness.storages)).toBe(enrichmentBefore);
    expect(appendHarness.writer.commands).toHaveLength(0);

    const sameHarness = workflowHarness();
    await seedExisting(sameHarness.storages);
    const samePreview = await sameHarness.workflow.preview(
      captureRequest(sameTranscript),
    );

    expect(samePreview).toMatchObject({
      status: "same",
      target: { kind: "existing", conversationId, sourceId },
      confirmable: false,
    });
    expect(sameHarness.writer.commands).toHaveLength(0);
  });

  it("blocks multiple immutable history heads without using array order", async () => {
    const { workflow, storages, writer } = workflowHarness();
    const records = await seedExisting(storages);
    storages.sources.save({
      ...records.source,
      id: "source-duplicate",
      name: "Duplicate identity",
    });
    const before = storageSnapshot(storages);

    const preview = await workflow.preview(captureRequest());

    expect(preview).toMatchObject({
      status: "blocked",
      confirmable: false,
    });
    expect(preview.errors[0]).toContain("multiple-heads");
    expect(storageSnapshot(storages)).toBe(before);
    expect(writer.commands).toHaveLength(0);
  });

  it("returns invalid for a dangling Source or cross-Conversation ownership", async () => {
    const danglingHarness = workflowHarness();
    const records = await existingRecords();
    danglingHarness.storages.sources.save(records.source);

    const dangling = await danglingHarness.workflow.preview(captureRequest());

    expect(dangling).toMatchObject({ status: "invalid", confirmable: false });
    expect(dangling.errors[0]).toContain("no valid owning Conversation");
    expect(danglingHarness.writer.commands).toHaveLength(0);

    const ownershipHarness = workflowHarness();
    await seedExisting(ownershipHarness.storages);
    ownershipHarness.storages.messages.save({
      id: "cross-owned-message",
      conversationId: "another-conversation",
      role: "user",
      content: "Cross-owned",
      order: 0,
      createdAt: previousAt,
      updatedAt: previousAt,
      sourceId,
      sourceOrdinal: 2,
    });

    const ownership =
      await ownershipHarness.workflow.preview(captureRequest());

    expect(ownership).toMatchObject({ status: "invalid", confirmable: false });
    expect(ownership.errors[0]).toContain("referenced across Conversations");
    expect(ownershipHarness.writer.commands).toHaveLength(0);
  });

  it.each([
    { label: "new", seed: false, content: appendTranscript, mode: "new" },
    { label: "append", seed: true, content: appendTranscript, mode: "append" },
  ] as const)(
    "confirms a $label preview through the writer exactly once",
    async ({ seed, content, mode }) => {
      const { workflow, storages, writer } = workflowHarness();
      if (seed) await seedExisting(storages);
      const request = captureRequest(content);
      const inputBefore = JSON.stringify(request);
      const preview = await workflow.preview(request);

      const result = await workflow.confirm({
        previewId: preview.previewId,
        baselineFingerprint: preview.baselineFingerprint as string,
      });

      expect(result).toMatchObject({ status: "success", mode });
      expect(writer.commands).toHaveLength(1);
      expect(writer.commands[0]).toMatchObject({
        expectedBaseline: {
          fingerprint: preview.baselineFingerprint,
        },
      });
      expect(JSON.stringify(request)).toBe(inputBefore);

      const duplicate = await workflow.confirm({
        previewId: preview.previewId,
        baselineFingerprint: preview.baselineFingerprint as string,
      });
      expect(duplicate.status).toBe("stale");
      expect(writer.commands).toHaveLength(1);
    },
  );

  it("returns same as a typed noop and never invokes the writer", async () => {
    const { workflow, storages, writer } = workflowHarness();
    await seedExisting(storages);
    const preview = await workflow.preview(captureRequest(sameTranscript));

    const result = await workflow.confirm({
      previewId: preview.previewId,
      baselineFingerprint: preview.baselineFingerprint as string,
    });

    expect(result).toEqual({
      status: "noop",
      reason: "same",
      previewId: preview.previewId,
    });
    expect(writer.commands).toHaveLength(0);
  });

  it("blocks a changed baseline before invoking the writer", async () => {
    const { workflow, storages, writer } = workflowHarness();
    const records = await seedExisting(storages);
    const preview = await workflow.preview(captureRequest());
    storages.conversations.save({
      ...records.conversation,
      note: "changed after preview",
    });

    const result = await workflow.confirm({
      previewId: preview.previewId,
      baselineFingerprint: preview.baselineFingerprint as string,
    });

    expect(result.status).toBe("stale");
    expect(writer.commands).toHaveLength(0);
  });

  it("maps writer stale and failures to typed workflow results", async () => {
    const staleWriter = new RecordingWriter((command) => ({
      status: "stale",
      expectedFingerprint: command.expectedBaseline.fingerprint,
      actualFingerprint: "changed-fingerprint",
    }));
    const staleHarness = workflowHarness(staleWriter);
    const stalePreview = await staleHarness.workflow.preview(captureRequest());

    const staleResult = await staleHarness.workflow.confirm({
      previewId: stalePreview.previewId,
      baselineFingerprint: stalePreview.baselineFingerprint as string,
    });

    expect(staleResult.status).toBe("stale");
    expect(staleWriter.commands).toHaveLength(1);

    const failingWriter = new RecordingWriter(() => {
      throw new Error("sensitive low-level failure");
    });
    const failureHarness = workflowHarness(failingWriter);
    const failurePreview =
      await failureHarness.workflow.preview(captureRequest());

    const failureResult = await failureHarness.workflow.confirm({
      previewId: failurePreview.previewId,
      baselineFingerprint: failurePreview.baselineFingerprint as string,
    });

    expect(failureResult).toEqual({
      status: "write-failed",
      previewId: failurePreview.previewId,
      message: "Share Snapshot canonical write failed.",
    });
    expect(failingWriter.commands).toHaveLength(1);
  });

  it("does not expose or persist the raw URL or share token in workflow objects", async () => {
    const { workflow, writer } = workflowHarness();
    const request = captureRequest();
    const preview = await workflow.preview(request);
    const result = await workflow.confirm({
      previewId: preview.previewId,
      baselineFingerprint: preview.baselineFingerprint as string,
    });
    const serialized = JSON.stringify({
      preview,
      result,
      commands: writer.commands,
    });

    expect(serialized).not.toContain("12345678-abcd");
    expect(serialized).not.toContain("chatgpt.com/share");
    expect(serialized).toContain(resourceHash);
  });
});
