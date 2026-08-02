import { describe, expect, it } from "vitest";
import type {
  ChatGPTShareSnapshotMetadata,
  ImportedSource,
  LegacyChatGPTShareSnapshotMetadata,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { hashChatGPTShareSnapshot } from "@/core/services/chatgpt-share-snapshot-comparator";
import {
  migrateLegacyMutableShareSnapshotSource,
  type LegacyShareSnapshotMigrationInput,
} from "@/core/services/chatgpt-share-snapshot-migration";

const timestamp = "2026-07-27T00:00:00.000Z";
const conversationId = "conversation";
const sourceId = "legacy-source";
const shareId = "12345678-abcd";
const normalizedShareUrl = `https://chatgpt.com/share/${shareId}`;
const resourceHash =
  "0f2e08f750e63fe2358752c452398948d3d05519a3b07e359b5ac2ee23e6464d";
const transcript = "User:\nQuestion\n\nAssistant:\nAnswer";
const drafts = [
  { role: "user" as const, content: "Question", ordinal: 0 },
  { role: "assistant" as const, content: "Answer", ordinal: 1 },
];

type LegacyFixture = {
  source: ImportedSource;
  messages: Message[];
  rounds: Round[];
  sources: ImportedSource[];
};

async function legacyFixture(): Promise<LegacyFixture> {
  const metadata: LegacyChatGPTShareSnapshotMetadata = {
    schemaVersion: 1,
    shareId,
    normalizedShareUrl,
    snapshotHash: await hashChatGPTShareSnapshot(drafts),
    snapshotMessageCount: drafts.length,
    capturedAt: timestamp,
    parserVersion: "1.0.0",
    inputKind: "pasted-text",
    hashAlgorithm: "sha256-json-role-content-v1",
  };
  const source: ImportedSource = {
    id: sourceId,
    conversationId,
    kind: "text",
    name: "Legacy",
    content: transcript,
    importedAt: timestamp,
    updatedAt: timestamp,
    shareSnapshot: metadata,
  };
  const messages: Message[] = drafts.map((draft) => ({
    id: `message-${draft.ordinal}`,
    conversationId,
    role: draft.role,
    content: draft.content,
    order: draft.ordinal,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceId,
    sourceOrdinal: draft.ordinal,
  }));
  const rounds: Round[] = [
    {
      id: "round-1",
      conversationId,
      order: 1,
      title: "Round 1",
      question: drafts[0].content,
      answer: drafts[1].content,
      messageIds: messages.map(({ id }) => id),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  return { source, messages, rounds, sources: [source] };
}

async function migrate(
  fixture: LegacyFixture,
): Promise<ReturnType<typeof migrateLegacyMutableShareSnapshotSource> extends Promise<infer Result> ? Result : never> {
  return migrateLegacyMutableShareSnapshotSource(fixture);
}

function withSource(
  fixture: LegacyFixture,
  source: ImportedSource,
): LegacyFixture {
  return {
    ...fixture,
    source,
    sources: fixture.sources.map((candidate) =>
      candidate.id === source.id ? source : candidate,
    ),
  };
}

describe("legacy mutable Share Snapshot migration", () => {
  it("creates the first known immutable Snapshot without fabricating history", async () => {
    const fixture = await legacyFixture();
    const beforeSource = JSON.stringify(fixture.source);
    const beforeMessages = JSON.stringify(fixture.messages);
    const result = await migrate(fixture);

    expect(result.status).toBe("migrated");
    if (result.status !== "migrated") return;
    expect(result.source).toMatchObject({
      id: sourceId,
      conversationId,
      content: transcript,
      shareSnapshot: {
        schemaVersion: 2,
        resourceHash,
        snapshotSequence: 1,
      },
    });
    expect(result.source.shareSnapshot).not.toHaveProperty(
      "previousSnapshotSourceId",
    );
    expect(JSON.stringify(result.source)).not.toContain(shareId);
    expect(JSON.stringify(result.source)).not.toContain("chatgpt.com/share");
    expect(JSON.stringify(fixture.source)).toBe(beforeSource);
    expect(JSON.stringify(fixture.messages)).toBe(beforeMessages);
  });

  it("returns no-op for an already migrated immutable Source", async () => {
    const fixture = await legacyFixture();
    const migrated = await migrate(fixture);
    expect(migrated.status).toBe("migrated");
    if (migrated.status !== "migrated") return;
    const immutableSource = migrated.source as ImportedSource;

    const result = await migrateLegacyMutableShareSnapshotSource({
      source: immutableSource,
      messages: fixture.messages,
      rounds: fixture.rounds,
      sources: [immutableSource],
    });

    expect(result).toEqual({ status: "noop", source: immutableSource });
  });

  it("preserves Source ID, Message IDs, and Message provenance", async () => {
    const fixture = await legacyFixture();
    const messageIdentity = fixture.messages.map(
      ({ id, sourceId: messageSourceId, sourceOrdinal }) => ({
        id,
        sourceId: messageSourceId,
        sourceOrdinal,
      }),
    );

    const result = await migrate(fixture);

    expect(result.status).toBe("migrated");
    if (result.status !== "migrated") return;
    expect(result.source.id).toBe(fixture.source.id);
    expect(
      fixture.messages.map(
        ({ id, sourceId: messageSourceId, sourceOrdinal }) => ({
          id,
          sourceId: messageSourceId,
          sourceOrdinal,
        }),
      ),
    ).toEqual(messageIdentity);
  });

  it("blocks invalid legacy metadata and unsupported hash algorithms", async () => {
    const fixture = await legacyFixture();
    const missingHash: LegacyFixture = {
      ...fixture,
      source: {
        ...fixture.source,
        shareSnapshot: {
          ...fixture.source
            .shareSnapshot as LegacyChatGPTShareSnapshotMetadata,
          snapshotHash: "",
        },
      },
    };
    const unsupportedHash: LegacyFixture = {
      ...fixture,
      source: {
        ...fixture.source,
        shareSnapshot: {
          ...fixture.source
            .shareSnapshot as LegacyChatGPTShareSnapshotMetadata,
          hashAlgorithm: "md5",
        } as unknown as LegacyChatGPTShareSnapshotMetadata,
      },
    };

    await expect(migrate(missingHash)).resolves.toMatchObject({
      status: "blocked",
      reason: "invalid-legacy-metadata",
    });
    await expect(migrate(unsupportedHash)).resolves.toMatchObject({
      status: "blocked",
      reason: "unsupported-hash-algorithm",
    });
  });

  it.each([
    {
      label: "capturedAt",
      remove(source: ImportedSource): ImportedSource {
        const metadata = {
          ...source.shareSnapshot,
        } as Partial<LegacyChatGPTShareSnapshotMetadata>;
        delete metadata.capturedAt;
        return {
          ...source,
          shareSnapshot:
            metadata as LegacyChatGPTShareSnapshotMetadata,
        };
      },
    },
    {
      label: "importedAt",
      remove(source: ImportedSource): ImportedSource {
        return {
          ...source,
          importedAt: undefined,
        } as unknown as ImportedSource;
      },
    },
    {
      label: "updatedAt",
      remove(source: ImportedSource): ImportedSource {
        return {
          ...source,
          updatedAt: undefined,
        } as unknown as ImportedSource;
      },
    },
  ])("blocks a missing $label timestamp", async ({ label, remove }) => {
    const fixture = await legacyFixture();
    const input = withSource(fixture, remove(fixture.source));

    const result = await migrate(input);

    expect(result).toMatchObject({
      status: "blocked",
      reason: "invalid-legacy-metadata",
    });
    expect(result.status === "blocked" ? result.error : "").toContain(label);
  });

  it.each(["capturedAt", "importedAt", "updatedAt"] as const)(
    "blocks a future %s timestamp",
    async (field) => {
      const fixture = await legacyFixture();
      const future = new Date(Date.now() + 60_000).toISOString();
      const metadata =
        fixture.source.shareSnapshot as LegacyChatGPTShareSnapshotMetadata;
      const source =
        field === "capturedAt"
          ? {
              ...fixture.source,
              shareSnapshot: { ...metadata, capturedAt: future },
            }
          : { ...fixture.source, [field]: future };

      const result = await migrate(withSource(fixture, source));

      expect(result).toMatchObject({
        status: "blocked",
        reason: "invalid-legacy-metadata",
      });
      expect(result.status === "blocked" ? result.error : "").toContain(
        `${field} cannot be in the future`,
      );
    },
  );

  it.each([
    {
      label: "capturedAt later than importedAt",
      capturedAt: "2026-07-27T02:00:00.000Z",
      importedAt: "2026-07-27T01:00:00.000Z",
      updatedAt: "2026-07-27T03:00:00.000Z",
      expected: "capturedAt cannot be later than importedAt",
    },
    {
      label: "importedAt later than updatedAt",
      capturedAt: "2026-07-27T01:00:00.000Z",
      importedAt: "2026-07-27T03:00:00.000Z",
      updatedAt: "2026-07-27T02:00:00.000Z",
      expected: "importedAt cannot be later than updatedAt",
    },
  ])("blocks timestamp order error: $label", async ({
    capturedAt,
    importedAt,
    updatedAt,
    expected,
  }) => {
    const fixture = await legacyFixture();
    const metadata =
      fixture.source.shareSnapshot as LegacyChatGPTShareSnapshotMetadata;
    const source: ImportedSource = {
      ...fixture.source,
      importedAt,
      updatedAt,
      shareSnapshot: { ...metadata, capturedAt },
    };

    const result = await migrate(withSource(fixture, source));

    expect(result).toMatchObject({
      status: "blocked",
      reason: "invalid-legacy-metadata",
    });
    expect(result.status === "blocked" ? result.error : "").toContain(
      expected,
    );
  });

  it("blocks invalid URL normalization and shareId mismatch", async () => {
    const fixture = await legacyFixture();
    const metadata =
      fixture.source.shareSnapshot as LegacyChatGPTShareSnapshotMetadata;
    const invalidUrl: LegacyFixture = {
      ...fixture,
      source: {
        ...fixture.source,
        shareSnapshot: {
          ...metadata,
          normalizedShareUrl: `${normalizedShareUrl}?utm_source=legacy`,
        },
      },
    };
    const mismatchedShareId: LegacyFixture = {
      ...fixture,
      source: {
        ...fixture.source,
        shareSnapshot: {
          ...metadata,
          shareId: "different-share-id",
        },
      },
    };

    await expect(migrate(invalidUrl)).resolves.toMatchObject({
      status: "blocked",
      reason: "invalid-url-normalization",
    });
    await expect(migrate(mismatchedShareId)).resolves.toMatchObject({
      status: "blocked",
      reason: "invalid-url-normalization",
    });
  });

  it("blocks missing Source ownership and broken sourceOrdinal", async () => {
    const fixture = await legacyFixture();
    const missingOwnership: LegacyFixture = {
      ...fixture,
      source: { ...fixture.source, conversationId: undefined },
    };
    const brokenOrdinal: LegacyFixture = {
      ...fixture,
      messages: fixture.messages.map((message, index) =>
        index === 1 ? { ...message, sourceOrdinal: 3 } : message,
      ),
    };

    await expect(migrate(missingOwnership)).resolves.toMatchObject({
      status: "blocked",
      reason: "missing-source-ownership",
    });
    await expect(migrate(brokenOrdinal)).resolves.toMatchObject({
      status: "blocked",
      reason: "broken-source-ordinal",
    });
  });

  it("blocks canonical transcript and Message provenance divergence", async () => {
    const fixture = await legacyFixture();
    const transcriptMismatch: LegacyFixture = {
      ...fixture,
      messages: fixture.messages.map((message, index) =>
        index === 1 ? { ...message, content: "Edited answer" } : message,
      ),
    };
    const provenanceMismatch: LegacyFixture = {
      ...fixture,
      messages: fixture.messages.map((message, index) =>
        index === 1 ? { ...message, sourceId: "another-source" } : message,
      ),
    };

    await expect(migrate(transcriptMismatch)).resolves.toMatchObject({
      status: "blocked",
      reason: "canonical-transcript-mismatch",
    });
    await expect(migrate(provenanceMismatch)).resolves.toMatchObject({
      status: "blocked",
      reason: "message-provenance-mismatch",
    });
  });

  it("blocks non-zero Message order, non-canonical transcript coverage, and incomplete Round membership", async () => {
    const fixture = await legacyFixture();
    const nonZeroOrder: LegacyFixture = {
      ...fixture,
      messages: fixture.messages.map((message) => ({
        ...message,
        order: message.order + 1,
      })),
    };
    const nonCanonicalTranscript: LegacyFixture = {
      ...fixture,
      source: {
        ...fixture.source,
        content: `${fixture.source.content}\n`,
      },
    };
    nonCanonicalTranscript.sources = [nonCanonicalTranscript.source];
    const incompleteRoundMembership: LegacyFixture = {
      ...fixture,
      rounds: fixture.rounds.map((round) => ({
        ...round,
        messageIds: [fixture.messages[0].id],
      })),
    };

    await expect(migrate(nonZeroOrder)).resolves.toMatchObject({
      status: "blocked",
      reason: "broken-source-ordinal",
    });
    await expect(migrate(nonCanonicalTranscript)).resolves.toMatchObject({
      status: "blocked",
      reason: "canonical-transcript-mismatch",
    });
    await expect(migrate(incompleteRoundMembership)).resolves.toMatchObject({
      status: "blocked",
      reason: "canonical-transcript-mismatch",
    });
  });

  it("blocks resourceHash collision across Conversations", async () => {
    const fixture = await legacyFixture();
    const otherMetadata: ChatGPTShareSnapshotMetadata = {
      schemaVersion: 2,
      resourceHash,
      snapshotHash: "other-snapshot",
      snapshotMessageCount: 1,
      capturedAt: timestamp,
      parserVersion: "1.0.0",
      inputKind: "pasted-text",
      hashAlgorithm: "sha256-json-role-content-v1",
      snapshotSequence: 1,
    };
    const otherSource: ImportedSource = {
      ...fixture.source,
      id: "other-source",
      conversationId: "other-conversation",
      shareSnapshot: otherMetadata,
    };

    const result = await migrate({
      ...fixture,
      sources: [fixture.source, otherSource],
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "resource-hash-collision",
    });
  });

  it("leaves Source and Messages untouched when migration is blocked", async () => {
    const fixture = await legacyFixture();
    const input: LegacyShareSnapshotMigrationInput = {
      ...fixture,
      messages: fixture.messages.map((message, index) =>
        index === 1 ? { ...message, sourceOrdinal: 99 } : message,
      ),
    };
    const before = JSON.stringify(input);
    const sourceIds = input.sources.map(({ id }) => id);
    const messageIds = input.messages.map(({ id }) => id);
    const provenance = input.messages.map(
      ({ sourceId: messageSourceId, sourceOrdinal }) => ({
        sourceId: messageSourceId,
        sourceOrdinal,
      }),
    );

    const result = await migrateLegacyMutableShareSnapshotSource(input);

    expect(result).toMatchObject({
      status: "blocked",
      reason: "broken-source-ordinal",
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(input.sources.map(({ id }) => id)).toEqual(sourceIds);
    expect(input.messages.map(({ id }) => id)).toEqual(messageIds);
    expect(
      input.messages.map(
        ({ sourceId: messageSourceId, sourceOrdinal }) => ({
          sourceId: messageSourceId,
          sourceOrdinal,
        }),
      ),
    ).toEqual(provenance);
  });
});
