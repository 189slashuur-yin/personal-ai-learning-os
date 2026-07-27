import { describe, expect, it } from "vitest";
import type {
  ChatGPTShareSnapshotMetadata,
  ImportedSource,
} from "@/core/entities/imported-source";
import type { Message, MessageRole } from "@/core/entities/message";
import {
  compareChatGPTShareSnapshot,
  hashChatGPTShareSnapshot,
} from "@/core/services/chatgpt-share-snapshot-comparator";
import {
  buildExistingChatGPTShareSnapshotImportPlan,
  buildNewChatGPTShareSnapshotImportPlan,
} from "@/core/services/chatgpt-share-snapshot-import";
import type { ChatGPTShareSnapshotMessageDraft } from "@/core/services/chatgpt-share-snapshot-parser";
import {
  identifyChatGPTShareUrl,
  normalizeChatGPTShareUrl,
} from "@/core/services/chatgpt-share-snapshot-url";

const sourceId = "share-source";
const timestamp = "2026-07-25T00:00:00.000Z";
const resourceHash =
  "0f2e08f750e63fe2358752c452398948d3d05519a3b07e359b5ac2ee23e6464d";

function draft(
  role: "user" | "assistant",
  content: string,
  ordinal: number,
): ChatGPTShareSnapshotMessageDraft {
  return { role, content, ordinal };
}

const originalSnapshot = [
  draft("user", "Question", 0),
  draft("assistant", "Answer", 1),
];

function metadata(
  snapshotHash = "stored-snapshot-hash",
  snapshotMessageCount = 2,
): ChatGPTShareSnapshotMetadata {
  return {
    schemaVersion: 2,
    resourceHash,
    snapshotHash,
    snapshotMessageCount,
    capturedAt: timestamp,
    parserVersion: "1.0.0",
    inputKind: "saved-html",
    hashAlgorithm: "sha256-json-role-content-v1",
    snapshotSequence: 1,
  };
}

function source(
  overrides: Partial<ImportedSource> = {},
): ImportedSource {
  return {
    id: sourceId,
    conversationId: "conversation",
    kind: "text",
    name: "Snapshot",
    content: "User:\nQuestion\n\nAssistant:\nAnswer",
    importedAt: timestamp,
    updatedAt: timestamp,
    shareSnapshot: metadata(),
    ...overrides,
  };
}

function message(
  id: string,
  role: MessageRole,
  content: string,
  sourceOrdinal: number,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: "conversation",
    role,
    content,
    order: sourceOrdinal,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceId,
    sourceOrdinal,
    ...overrides,
  };
}

describe("ChatGPT Share Snapshot URL identity", () => {
  it("normalizes transiently and exposes only a resource hash identity", async () => {
    const rawUrl =
      " https://chatgpt.com/share/12345678-abcd/?utm_source=test#fragment ";
    expect(normalizeChatGPTShareUrl(rawUrl)).toBe(
      "https://chatgpt.com/share/12345678-abcd",
    );
    const identity = await identifyChatGPTShareUrl(rawUrl);
    expect(identity).toEqual({ resourceHash });
    expect(JSON.stringify(identity)).not.toContain("12345678-abcd");
    expect(JSON.stringify(identity)).not.toContain("chatgpt.com/share");
  });

  it("rejects non-ChatGPT and non-HTTPS URLs", () => {
    expect(() =>
      normalizeChatGPTShareUrl("https://example.com/share/12345678-abcd"),
    ).toThrow("https://chatgpt.com/share/");
    expect(() =>
      normalizeChatGPTShareUrl("http://chatgpt.com/share/12345678-abcd"),
    ).toThrow("https://chatgpt.com/share/");
  });
});

describe("ChatGPT Share Snapshot comparator", () => {
  it("classifies same from the immutable head transcript and full canonical stream", () => {
    const comparison = compareChatGPTShareSnapshot({
      headSource: source(),
      canonicalMessages: [
        message("m1", "user", "Question", 0, {
          sourceId: "first-snapshot",
        }),
        message("m2", "assistant", "Answer", 1, {
          sourceId: "second-snapshot",
        }),
      ],
      snapshotMessages: originalSnapshot,
      incomingSnapshotHash: "stored-snapshot-hash",
    });

    expect(comparison).toMatchObject({
      status: "same",
      existingMessageCount: 2,
      snapshotMessageCount: 2,
      commonPrefixCount: 2,
      newMessageCount: 0,
      suffixMessages: [],
      snapshotHashMatchesIncoming: true,
    });
  });

  it("classifies append and returns only the absolute-ordinal suffix", () => {
    const snapshot = [
      ...originalSnapshot,
      draft("user", "Follow-up", 2),
      draft("assistant", "Follow-up answer", 3),
    ];
    const comparison = compareChatGPTShareSnapshot({
      headSource: source(),
      canonicalMessages: [
        message("m1", "user", "Question", 0),
        message("m2", "assistant", "Answer", 1),
      ],
      snapshotMessages: snapshot,
      incomingSnapshotHash: "extended-snapshot-hash",
    });

    expect(comparison).toMatchObject({
      status: "append",
      commonPrefixCount: 2,
      newMessageCount: 2,
      suffixMessages: snapshot.slice(2),
    });
    expect(buildExistingChatGPTShareSnapshotImportPlan(comparison)).toMatchObject(
      {
        kind: "append",
        importedMessageCount: 2,
        importedRoundCount: 1,
      },
    );
  });

  it("blocks shorter and diverged incoming snapshots", () => {
    const canonicalMessages = [
      message("m1", "user", "Question", 0),
      message("m2", "assistant", "Answer", 1),
    ];
    const shorter = compareChatGPTShareSnapshot({
      headSource: source(),
      canonicalMessages,
      snapshotMessages: [draft("user", "Question", 0)],
      incomingSnapshotHash: "shorter",
    });
    const diverged = compareChatGPTShareSnapshot({
      headSource: source(),
      canonicalMessages,
      snapshotMessages: [
        draft("user", "Question", 0),
        draft("assistant", "Edited answer", 1),
      ],
      incomingSnapshotHash: "diverged",
    });

    expect(shorter.status).toBe("blocked-shorter");
    expect(diverged).toMatchObject({
      status: "blocked-diverged",
      estimatedDivergenceOrdinal: 1,
    });
    expect(buildExistingChatGPTShareSnapshotImportPlan(shorter)).toMatchObject({
      kind: "blocked",
      blockedReason: "shorter",
    });
    expect(buildExistingChatGPTShareSnapshotImportPlan(diverged)).toMatchObject({
      kind: "blocked",
      blockedReason: "diverged",
    });
  });

  it("blocks when the canonical projection no longer matches the head transcript", () => {
    const comparison = compareChatGPTShareSnapshot({
      headSource: source(),
      canonicalMessages: [
        message("m1", "user", "Question", 0),
        message("m2", "assistant", "Locally edited answer", 1),
      ],
      snapshotMessages: [
        ...originalSnapshot,
        draft("user", "Follow-up", 2),
      ],
      incomingSnapshotHash: "extended",
    });

    expect(comparison).toMatchObject({
      status: "blocked-projection-diverged",
      estimatedDivergenceOrdinal: 1,
      newMessageCount: 0,
      suffixMessages: [],
    });
    expect(buildExistingChatGPTShareSnapshotImportPlan(comparison)).toMatchObject(
      {
        kind: "blocked",
        blockedReason: "projection-diverged",
      },
    );
  });

  it("returns invalid for malformed head metadata or transcript counts", () => {
    const comparison = compareChatGPTShareSnapshot({
      headSource: source({
        shareSnapshot: metadata("stored", 3),
      }),
      canonicalMessages: [
        message("m1", "user", "Question", 0),
        message("m2", "assistant", "Answer", 1),
      ],
      snapshotMessages: originalSnapshot,
      incomingSnapshotHash: "stored",
    });
    expect(comparison).toMatchObject({
      status: "invalid",
      invalidReason:
        "Source share-source metadata expects 3 messages, but its transcript contains 2.",
    });
  });

  it("uses exact role/content bytes for snapshot identity", async () => {
    const baseHash = await hashChatGPTShareSnapshot(originalSnapshot);
    const whitespaceHash = await hashChatGPTShareSnapshot([
      draft("user", "Question ", 0),
      draft("assistant", "Answer", 1),
    ]);
    expect(baseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(whitespaceHash).not.toBe(baseHash);
  });

  it("builds a new pure plan without mutating the parser result", () => {
    const parsed = {
      title: "Synthetic",
      messages: originalSnapshot,
      inputKind: "saved-html" as const,
      parserVersion: "1.0.0" as const,
      warnings: [],
      errors: [],
    };
    const before = JSON.stringify(parsed);
    const plan = buildNewChatGPTShareSnapshotImportPlan(parsed);
    expect(plan).toMatchObject({
      kind: "new",
      importedMessageCount: 2,
      importedRoundCount: 1,
    });
    expect(JSON.stringify(parsed)).toBe(before);
  });
});
