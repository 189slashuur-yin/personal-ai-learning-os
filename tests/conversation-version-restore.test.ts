import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import { ConversationVersionService } from "@/core/services/conversation-version-service";
import {
  InMemoryConversationStorage,
  InMemoryMessageStorage,
  InMemoryRoundStorage,
  InMemorySourceStorage,
} from "./fakes";

const timestamp = "2026-07-29T00:00:00.000Z";
const conversationId = "restore-conversation";

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

function createHarness() {
  const conversations = new InMemoryConversationStorage();
  const messages = new InMemoryMessageStorage();
  const rounds = new InMemoryRoundStorage();
  const sources = new InMemorySourceStorage();
  const versions = new InMemoryConversationVersionStorage();
  const conversation = {
    id: conversationId,
    title: "Restore target",
    sourceType: "Manual" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  };
  const snapshotMessages = [
    {
      id: "message-before-user",
      conversationId,
      role: "user" as const,
      content: "Question at checkpoint",
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "message-before-assistant",
      conversationId,
      role: "assistant" as const,
      content: "Answer at checkpoint",
      order: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  const round = {
    id: "round-stable",
    conversationId,
    order: 1,
    title: "Stable round",
    question: "Projected question",
    answer: "Projected answer",
    messageIds: snapshotMessages.map((message) => message.id),
    note: "Keep note",
    summary: "Keep summary",
    context: {
      inheritanceMode: "exclude" as const,
      excludedFields: ["decisions" as const],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  conversations.save(conversation);
  messages.saveMany(snapshotMessages);
  rounds.save(round);
  versions.save({
    id: "version",
    conversationId,
    name: "Checkpoint",
    description: "",
    createdAt: timestamp,
    sourceVersion: 1,
    messageCount: snapshotMessages.length,
    snapshotData: {
      conversation,
      messages: snapshotMessages,
    },
  });

  return {
    conversations,
    messages,
    rounds,
    sources,
    versions,
    round,
    snapshotMessages,
    service: new ConversationVersionService({
      conversations,
      messages,
      versions,
    }),
  };
}

describe("ConversationVersionService restore referential integrity", () => {
  it("regenerates Message identity and remaps stable Round references", () => {
    const harness = createHarness();
    const restored = harness.service.restoreSnapshot(
      conversationId,
      "version",
      {
        sources: harness.sources,
        rounds: harness.rounds,
      },
    );

    expect(restored).not.toBeNull();
    expect(restored?.messages.map((message) => message.id)).not.toEqual(
      harness.snapshotMessages.map((message) => message.id),
    );
    expect(restored?.messages.map((message) => message.content)).toEqual([
      "Question at checkpoint",
      "Answer at checkpoint",
    ]);
    expect(restored?.messages.map((message) => message.order)).toEqual([0, 1]);

    const restoredRound = harness.rounds.getById(harness.round.id);
    expect(restoredRound).toEqual({
      ...harness.round,
      messageIds: restored?.messages.map((message) => message.id),
    });
    expect(
      restoredRound?.messageIds.every((messageId) =>
        harness.messages.getAll().some((message) => message.id === messageId),
      ),
    ).toBe(true);
  });

  it("remaps from already-restored Message IDs on a repeated restore", () => {
    const harness = createHarness();
    const first = harness.service.restoreSnapshot(
      conversationId,
      "version",
      {
        sources: harness.sources,
        rounds: harness.rounds,
      },
    );
    const second = harness.service.restoreSnapshot(
      conversationId,
      "version",
      {
        sources: harness.sources,
        rounds: harness.rounds,
      },
    );

    expect(second?.messages.map((message) => message.id)).not.toEqual(
      first?.messages.map((message) => message.id),
    );
    expect(harness.rounds.getById(harness.round.id)?.messageIds).toEqual(
      second?.messages.map((message) => message.id),
    );
  });

  it("refreshes RoundWorkspace after a successful Detail restore", () => {
    const detailSource = readFileSync(
      new URL(
        "../src/app/conversation/[id]/conversation-detail.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(detailSource).toContain(
      "setRoundWorkspaceRevision((current) => current + 1)",
    );
    expect(
      detailSource.match(
        /key=\{`round-workspace-\$\{roundWorkspaceRevision\}`\}/g,
      ),
    ).toHaveLength(2);
  });
});
