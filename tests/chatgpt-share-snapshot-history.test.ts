import { describe, expect, it } from "vitest";
import type {
  ChatGPTShareSnapshotMetadata,
  ImportedSource,
  LegacyChatGPTShareSnapshotMetadata,
} from "@/core/entities/imported-source";
import { resolveChatGPTShareSnapshotHistory } from "@/core/services/chatgpt-share-snapshot-history";
import { migrateLegacyMutableShareSnapshotSource } from "@/core/services/chatgpt-share-snapshot-migration";

const resourceHash =
  "0f2e08f750e63fe2358752c452398948d3d05519a3b07e359b5ac2ee23e6464d";
const timestamp = "2026-07-27T00:00:00.000Z";

function metadata(
  sequence: number,
  previousSnapshotSourceId?: string,
): ChatGPTShareSnapshotMetadata {
  return {
    schemaVersion: 2,
    resourceHash,
    snapshotHash: `snapshot-${sequence}`,
    snapshotMessageCount: sequence * 2,
    capturedAt: timestamp,
    parserVersion: "1.0.0",
    inputKind: "pasted-text",
    hashAlgorithm: "sha256-json-role-content-v1",
    previousSnapshotSourceId,
    snapshotSequence: sequence,
  };
}

function source(
  id: string,
  sequence: number,
  previousSnapshotSourceId?: string,
  conversationId = "conversation",
): ImportedSource {
  return {
    id,
    conversationId,
    kind: "text",
    name: id,
    content: "User:\nQuestion\n\nAssistant:\nAnswer",
    importedAt: timestamp,
    updatedAt: timestamp,
    shareSnapshot: metadata(sequence, previousSnapshotSourceId),
  };
}

describe("ChatGPT Share Snapshot history resolver", () => {
  it("resolves a valid chain and selects its linked head without updatedAt ordering", () => {
    const first = source("snapshot-1", 1);
    const second = source("snapshot-2", 2, first.id);
    const third = {
      ...source("snapshot-3", 3, second.id),
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    const result = resolveChatGPTShareSnapshotHistory({
      conversationId: "conversation",
      resourceHash,
      sources: [third, first, second],
    });

    expect(result).toMatchObject({
      status: "valid",
      head: { id: "snapshot-3" },
    });
    if (result.status === "valid") {
      expect(result.chain.map(({ id }) => id)).toEqual([
        "snapshot-1",
        "snapshot-2",
        "snapshot-3",
      ]);
    }
  });

  it("blocks multiple heads, cycles, and missing previous snapshots", () => {
    const multipleHeads = resolveChatGPTShareSnapshotHistory({
      conversationId: "conversation",
      resourceHash,
      sources: [source("snapshot-1", 1), source("snapshot-2", 2)],
    });
    const cycle = resolveChatGPTShareSnapshotHistory({
      conversationId: "conversation",
      resourceHash,
      sources: [
        source("snapshot-1", 1, "snapshot-2"),
        source("snapshot-2", 2, "snapshot-1"),
      ],
    });
    const missing = resolveChatGPTShareSnapshotHistory({
      conversationId: "conversation",
      resourceHash,
      sources: [source("snapshot-2", 2, "missing")],
    });

    expect(multipleHeads).toMatchObject({
      status: "blocked",
      reason: "multiple-heads",
    });
    expect(cycle).toMatchObject({ status: "blocked", reason: "cycle" });
    expect(missing).toMatchObject({
      status: "blocked",
      reason: "missing-previous-snapshot",
    });
  });

  it("blocks duplicate resource identity across Conversations", () => {
    const result = resolveChatGPTShareSnapshotHistory({
      conversationId: "conversation",
      resourceHash,
      sources: [
        source("snapshot-1", 1),
        source("snapshot-other", 2, "snapshot-1", "other-conversation"),
      ],
    });
    expect(result).toMatchObject({
      status: "blocked",
      reason: "ambiguous-resource",
    });
  });
});

describe("legacy mutable Snapshot compatibility", () => {
  it("produces a first known immutable Snapshot without retaining or fabricating history", async () => {
    const legacyMetadata: LegacyChatGPTShareSnapshotMetadata = {
      schemaVersion: 1,
      shareId: "12345678-abcd",
      normalizedShareUrl: "https://chatgpt.com/share/12345678-abcd",
      snapshotHash: "legacy-snapshot",
      snapshotMessageCount: 2,
      capturedAt: timestamp,
      parserVersion: "1.0.0",
      inputKind: "pasted-text",
      hashAlgorithm: "sha256-json-role-content-v1",
    };
    const legacySource: ImportedSource = {
      id: "legacy-source",
      conversationId: "conversation",
      kind: "text",
      name: "Legacy",
      content: "User:\nQuestion\n\nAssistant:\nAnswer",
      importedAt: timestamp,
      updatedAt: timestamp,
      shareSnapshot: legacyMetadata,
    };

    const result =
      await migrateLegacyMutableShareSnapshotSource(legacySource);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.source.id).toBe(legacySource.id);
    expect(result.source.content).toBe(legacySource.content);
    expect(result.source.shareSnapshot).toMatchObject({
      schemaVersion: 2,
      resourceHash,
      snapshotHash: "legacy-snapshot",
      snapshotSequence: 1,
    });
    expect(result.source.shareSnapshot).not.toHaveProperty(
      "previousSnapshotSourceId",
    );
    const serialized = JSON.stringify(result.source);
    expect(serialized).not.toContain("12345678-abcd");
    expect(serialized).not.toContain("chatgpt.com/share");
    expect(JSON.stringify(legacySource)).toContain("12345678-abcd");
  });
});
