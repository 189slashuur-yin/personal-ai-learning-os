import { describe, expect, it } from "vitest";
import type { Conversation } from "@/core/entities/conversation";
import type {
  ChatGPTShareSnapshotMetadata,
  ImportedSource,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { hashChatGPTShareSnapshot } from "@/core/services/chatgpt-share-snapshot-comparator";
import {
  prepareChatGPTShareSnapshot,
  type ChatGPTShareSnapshotExistingTarget,
  type ChatGPTShareSnapshotIdKind,
} from "@/core/services/chatgpt-share-snapshot-service";

const capturedAt = "2026-07-27T02:00:00.000Z";
const previousAt = "2026-07-27T01:00:00.000Z";
const conversationId = "conversation";
const sourceId = "source";
const shareUrl = "https://chatgpt.com/share/12345678-abcd";
const resourceHash =
  "0f2e08f750e63fe2358752c452398948d3d05519a3b07e359b5ac2ee23e6464d";

function conversation(): Conversation {
  return {
    id: conversationId,
    title: "Locally maintained title",
    sourceType: "ChatGPT",
    note: "local note",
    summary: "local overview",
    context: {
      longTermBackground: "local background",
      currentState: "local state",
    },
    createdAt: previousAt,
    updatedAt: previousAt,
    lastOpenedAt: previousAt,
  };
}

function idFactory(): {
  createId: (kind: ChatGPTShareSnapshotIdKind) => string;
  calls: ChatGPTShareSnapshotIdKind[];
} {
  const calls: ChatGPTShareSnapshotIdKind[] = [];
  const counts = new Map<ChatGPTShareSnapshotIdKind, number>();
  return {
    calls,
    createId(kind) {
      calls.push(kind);
      const next = (counts.get(kind) ?? 0) + 1;
      counts.set(kind, next);
      return `${kind}-${next}`;
    },
  };
}

async function existingTarget(
  contents: readonly [string, string] = ["Question", "Answer"],
): Promise<ChatGPTShareSnapshotExistingTarget> {
  const drafts = [
    { role: "user" as const, content: contents[0], ordinal: 0 },
    { role: "assistant" as const, content: contents[1], ordinal: 1 },
  ];
  const metadata: ChatGPTShareSnapshotMetadata = {
    schemaVersion: 2,
    resourceHash,
    snapshotHash: await hashChatGPTShareSnapshot(drafts),
    snapshotMessageCount: drafts.length,
    capturedAt: previousAt,
    parserVersion: "1.0.0",
    inputKind: "pasted-text",
    hashAlgorithm: "sha256-json-role-content-v1",
    snapshotSequence: 1,
  };
  const source: ImportedSource = {
    id: sourceId,
    conversationId,
    kind: "text",
    name: "Preserved source name",
    content: "User:\nQuestion\n\nAssistant:\nAnswer",
    importedAt: previousAt,
    updatedAt: previousAt,
    shareSnapshot: metadata,
  };
  const messages: Message[] = drafts.map((draft) => ({
    id: `old-message-${draft.ordinal}`,
    conversationId,
    role: draft.role,
    content: draft.content,
    order: draft.ordinal,
    createdAt: previousAt,
    updatedAt: previousAt,
    sourceId,
    sourceOrdinal: draft.ordinal,
  }));
  const rounds: Round[] = [
    {
      id: "old-round",
      conversationId,
      order: 1,
      title: "Old round",
      question: contents[0],
      answer: contents[1],
      messageIds: messages.map(({ id }) => id),
      note: "important local note",
      summary: "important local summary",
      context: {
        inheritanceMode: "inherit",
        snapshot: { currentState: "important local context" },
        confirmedAt: previousAt,
      },
      createdAt: previousAt,
      updatedAt: previousAt,
    },
  ];
  return {
    kind: "existing",
    conversation: conversation(),
    source,
    messages,
    rounds,
  };
}

async function unansweredTarget(): Promise<ChatGPTShareSnapshotExistingTarget> {
  const drafts = [
    { role: "user" as const, content: "Question", ordinal: 0 },
    { role: "assistant" as const, content: "Answer", ordinal: 1 },
    { role: "user" as const, content: "Follow-up", ordinal: 2 },
  ];
  const metadata: ChatGPTShareSnapshotMetadata = {
    schemaVersion: 2,
    resourceHash,
    snapshotHash: await hashChatGPTShareSnapshot(drafts),
    snapshotMessageCount: drafts.length,
    capturedAt: previousAt,
    parserVersion: "1.0.0",
    inputKind: "pasted-text",
    hashAlgorithm: "sha256-json-role-content-v1",
    snapshotSequence: 1,
  };
  const messages: Message[] = drafts.map((draft) => ({
    id: `old-message-${draft.ordinal}`,
    conversationId,
    role: draft.role,
    content: draft.content,
    order: draft.ordinal,
    createdAt: previousAt,
    updatedAt: previousAt,
    sourceId,
    sourceOrdinal: draft.ordinal,
  }));
  return {
    kind: "existing",
    conversation: conversation(),
    source: {
      id: sourceId,
      conversationId,
      kind: "text",
      name: "Preserved source name",
      content:
        "User:\nQuestion\n\nAssistant:\nAnswer\n\nUser:\nFollow-up",
      importedAt: previousAt,
      updatedAt: previousAt,
      shareSnapshot: metadata,
    },
    messages,
    rounds: [
      {
        id: "old-round",
        conversationId,
        order: 1,
        title: "Old round",
        question: "Question",
        answer: "Answer",
        messageIds: ["old-message-0", "old-message-1"],
        createdAt: previousAt,
        updatedAt: previousAt,
      },
      {
        id: "unanswered-round",
        conversationId,
        order: 2,
        title: "Preserved follow-up title",
        question: "Follow-up",
        answer: "",
        messageIds: ["old-message-2"],
        note: "important local note",
        summary: "important local summary",
        context: {
          inheritanceMode: "inherit",
          snapshot: { currentState: "important local context" },
          confirmedAt: previousAt,
        },
        createdAt: previousAt,
        updatedAt: previousAt,
      },
    ],
  };
}

describe("ChatGPT Share Snapshot pure service", () => {
  it("composes URL, parser, metadata, import plan, and initial canonical records", async () => {
    const ids = idFactory();
    const targetConversation = conversation();
    const before = JSON.stringify(targetConversation);
    const preparation = await prepareChatGPTShareSnapshot({
      shareUrl: `${shareUrl}/?utm_source=test#fragment`,
      snapshot: {
        kind: "pasted-text",
        content: "User:\nQuestion\n\nAssistant:\nAnswer",
      },
      capturedAt,
      target: { kind: "new", conversation: targetConversation },
      createId: ids.createId,
    });

    expect(preparation.status).toBe("new");
    expect(preparation.errors).toEqual([]);
    expect(preparation.identity).toEqual({ resourceHash });
    expect(preparation.importPlan).toMatchObject({
      kind: "new",
      importedMessageCount: 2,
      importedRoundCount: 1,
    });
    expect(preparation.canonicalPlan).toMatchObject({
      conversation: {
        id: conversationId,
        title: "Locally maintained title",
        note: "local note",
        summary: "local overview",
        updatedAt: capturedAt,
      },
      source: {
        id: "source-1",
        conversationId,
        name: "Question",
        content: "User:\nQuestion\n\nAssistant:\nAnswer",
        shareSnapshot: {
          schemaVersion: 2,
          resourceHash,
          snapshotMessageCount: 2,
          capturedAt,
          snapshotSequence: 1,
        },
      },
      messages: [
        {
          id: "message-1",
          sourceId: "source-1",
          sourceOrdinal: 0,
          order: 0,
        },
        {
          id: "message-2",
          sourceId: "source-1",
          sourceOrdinal: 1,
          order: 1,
        },
      ],
      rounds: [
        {
          id: "round-1",
          order: 1,
          messageIds: ["message-1", "message-2"],
        },
      ],
    });
    expect(ids.calls).toEqual(["source", "message", "message", "round"]);
    expect(JSON.stringify(preparation)).not.toContain("12345678-abcd");
    expect(JSON.stringify(preparation)).not.toContain("chatgpt.com/share");
    expect(JSON.stringify(targetConversation)).toBe(before);
    expect(preparation.canonicalPlan?.conversation).not.toBe(
      targetConversation,
    );
  });

  it("builds an append-only canonical plan without mutating local enrichment", async () => {
    const ids = idFactory();
    const target = await existingTarget();
    const before = JSON.stringify(target);
    const preparation = await prepareChatGPTShareSnapshot({
      shareUrl,
      snapshot: {
        kind: "pasted-text",
        content:
          "User:\nQuestion\n\nAssistant:\nAnswer\n\nUser:\nFollow-up\n\nAssistant:\nFollow-up answer",
      },
      capturedAt,
      target,
      createId: ids.createId,
    });

    expect(preparation.status).toBe("append");
    expect(preparation.comparison).toMatchObject({
      status: "append",
      existingMessageCount: 2,
      newMessageCount: 2,
    });
    expect(preparation.canonicalPlan?.conversation).toMatchObject({
      title: "Locally maintained title",
      note: "local note",
      summary: "local overview",
      context: conversation().context,
      updatedAt: capturedAt,
    });
    expect(preparation.canonicalPlan?.source).toMatchObject({
      id: "source-1",
      name: "Question",
      importedAt: capturedAt,
      updatedAt: capturedAt,
      shareSnapshot: {
        resourceHash,
        snapshotMessageCount: 4,
        previousSnapshotSourceId: sourceId,
        snapshotSequence: 2,
      },
    });
    expect(preparation.canonicalPlan?.messages).toEqual([
      expect.objectContaining({
        id: "message-1",
        content: "Follow-up",
        order: 2,
        sourceId: "source-1",
        sourceOrdinal: 2,
      }),
      expect.objectContaining({
        id: "message-2",
        content: "Follow-up answer",
        order: 3,
        sourceId: "source-1",
        sourceOrdinal: 3,
      }),
    ]);
    expect(preparation.canonicalPlan?.rounds).toEqual([
      expect.objectContaining({
        id: "round-1",
        order: 2,
        question: "Follow-up",
        answer: "Follow-up answer",
        messageIds: ["message-1", "message-2"],
      }),
    ]);
    expect(preparation.canonicalPlan?.rounds).not.toContainEqual(
      expect.objectContaining({ id: "old-round" }),
    );
    expect(ids.calls).toEqual(["source", "message", "message", "round"]);
    expect(JSON.stringify(target)).toBe(before);
  });

  it("projects an assistant-only append into the existing unanswered tail Round", async () => {
    const ids = idFactory();
    const target = await unansweredTarget();
    const before = JSON.stringify(target);
    const preparation = await prepareChatGPTShareSnapshot({
      shareUrl,
      snapshot: {
        kind: "pasted-text",
        content:
          "User:\nQuestion\n\nAssistant:\nAnswer\n\nUser:\nFollow-up\n\nAssistant:\nDeferred answer",
      },
      capturedAt,
      target,
      createId: ids.createId,
    });

    expect(preparation).toMatchObject({
      status: "append",
      deltaProjection: {
        status: "projected",
        roundToExtend: {
          id: "unanswered-round",
          answer: "Deferred answer",
          messageIds: ["old-message-2", "message-1"],
          note: "important local note",
          summary: "important local summary",
          context: target.rounds[1].context,
        },
        roundsToCreate: [],
      },
      importPlan: {
        kind: "append",
        importedMessageCount: 1,
        importedRoundCount: 0,
        roundsToWrite: [],
      },
      canonicalPlan: {
        messages: [
          {
            id: "message-1",
            sourceId: "source-1",
            sourceOrdinal: 3,
          },
        ],
        rounds: [
          {
            id: "unanswered-round",
            answer: "Deferred answer",
            messageIds: ["old-message-2", "message-1"],
          },
        ],
      },
    });
    expect(ids.calls).toEqual(["source", "message"]);
    expect(JSON.stringify(target)).toBe(before);
  });

  it("extends the unanswered tail before deriving later User messages", async () => {
    const ids = idFactory();
    const target = await unansweredTarget();
    const preparation = await prepareChatGPTShareSnapshot({
      shareUrl,
      snapshot: {
        kind: "pasted-text",
        content:
          "User:\nQuestion\n\nAssistant:\nAnswer\n\nUser:\nFollow-up\n\nAssistant:\nDeferred answer\n\nUser:\nNew question\n\nAssistant:\nNew answer",
      },
      capturedAt,
      target,
      createId: ids.createId,
    });

    expect(preparation.status).toBe("append");
    expect(preparation.canonicalPlan?.rounds).toEqual([
      expect.objectContaining({
        id: "unanswered-round",
        messageIds: ["old-message-2", "message-1"],
      }),
      expect.objectContaining({
        id: "round-1",
        order: 3,
        question: "New question",
        answer: "New answer",
        messageIds: ["message-2", "message-3"],
      }),
    ]);
    expect(ids.calls).toEqual([
      "source",
      "message",
      "message",
      "message",
      "round",
    ]);
  });

  it("blocks an assistant-only append when the canonical tail is answered", async () => {
    const ids = idFactory();
    const preparation = await prepareChatGPTShareSnapshot({
      shareUrl,
      snapshot: {
        kind: "pasted-text",
        content:
          "User:\nQuestion\n\nAssistant:\nAnswer\n\nAssistant:\nAdditional answer",
      },
      capturedAt,
      target: await existingTarget(),
      createId: ids.createId,
    });

    expect(preparation).toMatchObject({
      status: "blocked",
      deltaProjection: {
        status: "blocked",
        reason: "no-unanswered-tail-round",
      },
      importPlan: {
        kind: "blocked",
        importedMessageCount: 0,
        importedRoundCount: 0,
        deltaProjectionBlockedReason: "no-unanswered-tail-round",
      },
    });
    expect(preparation.canonicalPlan).toBeUndefined();
  });

  it("returns Same with zero canonical writes and zero ID allocation", async () => {
    const ids = idFactory();
    const target = await existingTarget();
    const preparation = await prepareChatGPTShareSnapshot({
      shareUrl,
      snapshot: {
        kind: "pasted-text",
        content: "User:\nQuestion\n\nAssistant:\nAnswer",
      },
      capturedAt,
      target,
      createId: ids.createId,
    });

    expect(preparation).toMatchObject({
      status: "same",
      comparison: { status: "same", commonPrefixCount: 2 },
      importPlan: {
        kind: "same",
        messagesToWrite: [],
        roundsToWrite: [],
      },
      errors: [],
    });
    expect(preparation.canonicalPlan).toBeUndefined();
    expect(ids.calls).toEqual([]);
  });

  it("returns Blocked for diverged or shorter snapshots without allocating IDs", async () => {
    const divergedIds = idFactory();
    const diverged = await prepareChatGPTShareSnapshot({
      shareUrl,
      snapshot: {
        kind: "pasted-text",
        content: "User:\nQuestion\n\nAssistant:\nEdited answer",
      },
      capturedAt,
      target: await existingTarget(),
      createId: divergedIds.createId,
    });
    const shorterIds = idFactory();
    const shorter = await prepareChatGPTShareSnapshot({
      shareUrl,
      snapshot: {
        kind: "pasted-text",
        content: "User:\nQuestion",
      },
      capturedAt,
      target: await existingTarget(),
      createId: shorterIds.createId,
    });

    expect(diverged).toMatchObject({
      status: "blocked",
      comparison: { status: "blocked-diverged" },
      importPlan: { kind: "blocked", blockedReason: "diverged" },
    });
    expect(shorter).toMatchObject({
      status: "blocked",
      comparison: { status: "blocked-shorter" },
      importPlan: { kind: "blocked", blockedReason: "shorter" },
    });
    expect(diverged.canonicalPlan).toBeUndefined();
    expect(shorter.canonicalPlan).toBeUndefined();
    expect(divergedIds.calls).toEqual([]);
    expect(shorterIds.calls).toEqual([]);
  });

  it("returns Invalid for parser, target, or Share identity errors without writes", async () => {
    const parserIds = idFactory();
    const parserFailure = await prepareChatGPTShareSnapshot({
      shareUrl,
      snapshot: {
        kind: "pasted-text",
        content: "Unlabelled content",
      },
      capturedAt,
      target: { kind: "new", conversation: conversation() },
      createId: parserIds.createId,
    });
    const identityIds = idFactory();
    const identityFailure = await prepareChatGPTShareSnapshot({
      shareUrl: "https://chatgpt.com/share/different-share",
      snapshot: {
        kind: "pasted-text",
        content: "User:\nQuestion\n\nAssistant:\nAnswer",
      },
      capturedAt,
      target: await existingTarget(),
      createId: identityIds.createId,
    });

    expect(parserFailure.status).toBe("invalid");
    expect(parserFailure.errors[0]).toContain("无法识别对话角色");
    expect(identityFailure.status).toBe("invalid");
    expect(identityFailure.errors).toEqual([
      "Share Snapshot URL does not match source source.",
    ]);
    expect(parserFailure.canonicalPlan).toBeUndefined();
    expect(identityFailure.canonicalPlan).toBeUndefined();
    expect(parserIds.calls).toEqual([]);
    expect(identityIds.calls).toEqual([]);
  });
});
