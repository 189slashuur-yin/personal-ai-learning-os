import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationSnapshotHistory } from "@/app/conversation/[id]/conversation-snapshot-history";
import type {
  ChatGPTShareSnapshotMetadata,
  ImportedSource,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import {
  compareChatGPTShareSnapshotHistoryEntries,
  defaultChatGPTShareSnapshotHistorySelection,
  inspectChatGPTShareSnapshotHistory,
} from "@/core/services/chatgpt-share-snapshot-history-view";

const conversationId = "conversation-history";
const resourceHash = "a".repeat(64);
const baseTime = Date.parse("2026-09-01T00:00:00.000Z");

const transcripts = [
  [
    ["user", "Plan the release"],
    ["assistant", "Start with a focused audit."],
  ],
  [
    ["user", "Plan the release"],
    ["assistant", "Start with a focused audit."],
    ["user", "What changed since the first capture?"],
  ],
  [
    ["user", "Plan the release"],
    ["assistant", "Start with a focused audit."],
    ["user", "What changed since the first capture?"],
    ["assistant", "Only the assistant follow-up was added."],
  ],
] as const;

function transcriptContent(index: number) {
  return transcripts[index]
    .map(([role, content]) =>
      `${role === "user" ? "User" : "Assistant"}:\n${content}`,
    )
    .join("\n\n");
}

function snapshotMetadata(
  sequence: number,
  previousSnapshotSourceId?: string,
  hash = resourceHash,
): ChatGPTShareSnapshotMetadata {
  return {
    schemaVersion: 2,
    resourceHash: hash,
    snapshotHash: `${sequence}`.repeat(64).slice(0, 64),
    snapshotMessageCount: transcripts[sequence - 1].length,
    capturedAt: new Date(baseTime + sequence * 60_000).toISOString(),
    parserVersion: "1.1.0",
    inputKind: "pasted-text",
    hashAlgorithm: "sha256-json-role-content-v1",
    previousSnapshotSourceId,
    snapshotSequence: sequence,
  };
}

function snapshotSource(
  sequence: number,
  previousSnapshotSourceId?: string,
  hash = resourceHash,
): ImportedSource {
  const id = `snapshot-${sequence}`;
  const metadata = snapshotMetadata(sequence, previousSnapshotSourceId, hash);
  return {
    id,
    conversationId,
    kind: "text",
    name: `Snapshot ${sequence}`,
    content: transcriptContent(sequence - 1),
    importedAt: metadata.capturedAt,
    updatedAt: metadata.capturedAt,
    shareSnapshot: metadata,
  };
}

function historySources() {
  const first = snapshotSource(1);
  const second = snapshotSource(2, first.id);
  const third = {
    ...snapshotSource(3, second.id),
    updatedAt: "2020-01-01T00:00:00.000Z",
  };
  return [third, first, second];
}

function canonicalMessages(): Message[] {
  return transcripts[2].map(([role, content], index) => ({
    id: `message-${index}`,
    conversationId,
    role,
    content,
    order: index,
    createdAt: new Date(baseTime + index * 1_000).toISOString(),
    updatedAt: new Date(baseTime + index * 1_000).toISOString(),
    sourceId: index < 2 ? "snapshot-1" : index === 2 ? "snapshot-2" : "snapshot-3",
    sourceOrdinal: index,
  }));
}

describe("v1.9 Conversation Snapshot history read model", () => {
  it("reports an empty state without inventing history for a legacy Snapshot", () => {
    const legacy: ImportedSource = {
      id: "legacy",
      conversationId,
      kind: "text",
      name: "Legacy Snapshot",
      content: transcriptContent(0),
      importedAt: new Date(baseTime).toISOString(),
      updatedAt: new Date(baseTime).toISOString(),
      shareSnapshot: {
        schemaVersion: 1,
        shareId: "legacy-token",
        normalizedShareUrl: "https://chatgpt.com/share/legacy-token",
        snapshotHash: "b".repeat(64),
        snapshotMessageCount: 2,
        capturedAt: new Date(baseTime).toISOString(),
        parserVersion: "1.0.0",
        inputKind: "pasted-text",
        hashAlgorithm: "sha256-json-role-content-v1",
      },
    };

    expect(
      inspectChatGPTShareSnapshotHistory({
        conversationId,
        sources: [legacy],
      }),
    ).toEqual({ status: "empty", legacySnapshotCount: 1 });
  });

  it("selects the lineage head without using updatedAt and preserves chain order", () => {
    const history = inspectChatGPTShareSnapshotHistory({
      conversationId,
      sources: historySources(),
    });

    expect(history).toMatchObject({
      status: "valid",
      head: { id: "snapshot-3" },
    });
    if (history.status === "valid") {
      expect(history.chain.map(({ id }) => id)).toEqual([
        "snapshot-1",
        "snapshot-2",
        "snapshot-3",
      ]);
    }
  });

  it("fails closed for multiple resource histories and sequence gaps", () => {
    const first = snapshotSource(1);
    const otherResource = snapshotSource(2, first.id, "c".repeat(64));
    expect(
      inspectChatGPTShareSnapshotHistory({
        conversationId,
        sources: [first, otherResource],
      }),
    ).toMatchObject({
      status: "blocked",
      reason: "multiple-resource-histories",
    });

    const badSequence = {
      ...snapshotSource(2, first.id),
      shareSnapshot: {
        ...snapshotMetadata(2, first.id),
        snapshotSequence: 7,
      },
    };
    expect(
      inspectChatGPTShareSnapshotHistory({
        conversationId,
        sources: [first, badSequence],
      }),
    ).toMatchObject({ status: "blocked", reason: "invalid-sequence" });
  });

  it("handles one Snapshot as an initial diff and the same Snapshot as zero delta", () => {
    const first = snapshotSource(1);
    const history = inspectChatGPTShareSnapshotHistory({
      conversationId,
      sources: [first],
    });
    expect(defaultChatGPTShareSnapshotHistorySelection(history)).toEqual({
      beforeSourceId: null,
      afterSourceId: first.id,
    });

    const initial = compareChatGPTShareSnapshotHistoryEntries({
      history,
      canonicalMessages: canonicalMessages().slice(0, 2),
      beforeSourceId: null,
      afterSourceId: first.id,
    });
    const same = compareChatGPTShareSnapshotHistoryEntries({
      history,
      canonicalMessages: canonicalMessages().slice(0, 2),
      beforeSourceId: first.id,
      afterSourceId: first.id,
    });

    expect(initial).toMatchObject({
      status: "initial",
      snapshotMessageCount: 2,
    });
    expect(initial.addedAssistantMessages.map(({ content }) => content)).toEqual([
      "Start with a focused audit.",
    ]);
    expect(same).toMatchObject({ status: "same", addedMessages: [] });
  });

  it("reuses the canonical comparator for adjacent and non-adjacent append diffs", () => {
    const history = inspectChatGPTShareSnapshotHistory({
      conversationId,
      sources: historySources(),
    });
    const adjacent = compareChatGPTShareSnapshotHistoryEntries({
      history,
      canonicalMessages: canonicalMessages(),
      beforeSourceId: "snapshot-2",
      afterSourceId: "snapshot-3",
    });
    const acrossHistory = compareChatGPTShareSnapshotHistoryEntries({
      history,
      canonicalMessages: canonicalMessages(),
      beforeSourceId: "snapshot-1",
      afterSourceId: "snapshot-3",
    });

    expect(adjacent).toMatchObject({
      status: "append",
      existingMessageCount: 3,
      snapshotMessageCount: 4,
    });
    expect(adjacent.addedAssistantMessages.map(({ content }) => content)).toEqual([
      "Only the assistant follow-up was added.",
    ]);
    expect(acrossHistory).toMatchObject({ status: "append" });
    expect(acrossHistory.addedMessages.map(({ role }) => role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("blocks a diff when the canonical Message projection no longer matches", () => {
    const history = inspectChatGPTShareSnapshotHistory({
      conversationId,
      sources: historySources(),
    });
    const messages = canonicalMessages();
    messages[1] = { ...messages[1], content: "diverged" };

    expect(
      compareChatGPTShareSnapshotHistoryEntries({
        history,
        canonicalMessages: messages,
        beforeSourceId: "snapshot-2",
        afterSourceId: "snapshot-3",
      }),
    ).toMatchObject({
      status: "blocked",
      comparisonStatus: "blocked-projection-diverged",
      addedMessages: [],
    });
  });
});

describe("v1.9 Conversation Snapshot history UI", () => {
  it("renders a bounded timeline, current head, diff selectors, and assistant delta", () => {
    const history = inspectChatGPTShareSnapshotHistory({
      conversationId,
      sources: historySources(),
    });
    const html = renderToStaticMarkup(
      createElement(ConversationSnapshotHistory, {
        conversationId,
        history,
        messages: canonicalMessages(),
      }),
    );

    expect(html).toContain("Snapshot 时间线与新增内容");
    expect(html).toContain("3 个 Snapshot · 当前 head #3");
    expect(html).toContain("Current head");
    expect(html).toContain("Snapshot 对比基线");
    expect(html).toContain("本次新增的 Assistant 内容");
    expect(html).toContain("Only the assistant follow-up was added.");
    expect(html).toContain("查看对比前完整 Snapshot");
    expect(html).toContain("max-h-96");
  });

  it("renders an actionable empty state", () => {
    const html = renderToStaticMarkup(
      createElement(ConversationSnapshotHistory, {
        conversationId,
        history: { status: "empty", legacySnapshotCount: 0 },
        messages: [],
      }),
    );

    expect(html).toContain("尚无 Conversation Snapshot history");
    expect(html).toContain("创建 Snapshot Conversation");
  });
});

describe("v1.9.1 Snapshot Message anchors", () => {
  const history = inspectChatGPTShareSnapshotHistory({ conversationId, sources: historySources() });
  const rounds = [
    { id: "round-1", conversationId, order: 1, title: "First", question: "", answer: "", messageIds: ["message-0", "message-1"], createdAt: "", updatedAt: "" },
    { id: "round-2", conversationId, order: 2, title: "Tail", question: "", answer: "", messageIds: ["message-2", "message-3"], createdAt: "", updatedAt: "" },
  ];
  it.each([
    [null, "snapshot-1", [0, 1]],
    ["snapshot-1", "snapshot-3", [2, 3]],
    ["snapshot-2", "snapshot-3", [3]],
    ["snapshot-3", "snapshot-3", []],
  ] as const)("maps %s → %s including first, new Round and assistant tail", (beforeSourceId, afterSourceId, ordinals) => {
    const result = compareChatGPTShareSnapshotHistoryEntries({ history, canonicalMessages: canonicalMessages(), rounds, beforeSourceId, afterSourceId });
    expect(result.addedMessages.map(({ anchor }) => anchor)).toEqual(ordinals.map((ordinal) => ({
      messageId: `message-${ordinal}`, sourceOrdinal: ordinal,
      roundId: ordinal < 2 ? "round-1" : "round-2", roundOrder: ordinal < 2 ? 1 : 2,
    })));
  });
  it.each(["missing", "duplicate", "undefined ordinal", "negative ordinal", "fractional ordinal", "broken ordinal", "role", "content", "order"])("retains diff but disables anchor for %s in suffix", (fault) => {
    const messages = canonicalMessages();
    if (fault === "missing") messages.pop();
    if (fault === "duplicate") messages.push({ ...messages[3], id: "duplicate" });
    if (fault === "undefined ordinal") messages[3].sourceOrdinal = undefined;
    if (fault === "negative ordinal") messages[3].sourceOrdinal = -1;
    if (fault === "fractional ordinal") messages[3].sourceOrdinal = 3.5;
    if (fault === "broken ordinal") messages[3].sourceOrdinal = 7;
    if (fault === "role") messages[3].role = "user";
    if (fault === "content") messages[3].content += " changed";
    if (fault === "order") messages[3].order = messages[2].order;
    const result = compareChatGPTShareSnapshotHistoryEntries({ history, canonicalMessages: messages, rounds, beforeSourceId: "snapshot-2", afterSourceId: "snapshot-3" });
    expect(result.status).toBe("append");
    expect(result.addedAssistantMessages).toHaveLength(1);
    expect(result.addedAssistantMessages[0]).toMatchObject({ content: transcripts[2][3][1], anchor: null });
  });
  it.each(["dangling", "duplicate member", "multiple rounds", "other member duplicated", "foreign round", "duplicate round id"])("disables navigation for %s", (fault) => {
    const changed = structuredClone(rounds);
    if (fault === "dangling") changed[1].messageIds.push("missing");
    if (fault === "duplicate member") changed[1].messageIds.push("message-3");
    if (fault === "multiple rounds") changed[0].messageIds.push("message-3");
    if (fault === "other member duplicated") changed[0].messageIds.push("message-2");
    if (fault === "foreign round") changed[1].conversationId = "elsewhere";
    if (fault === "duplicate round id") changed[0].id = changed[1].id;
    const result = compareChatGPTShareSnapshotHistoryEntries({ history, canonicalMessages: canonicalMessages(), rounds: changed, beforeSourceId: "snapshot-2", afterSourceId: "snapshot-3" });
    expect(result.addedAssistantMessages[0].anchor).toBeNull();
  });
  it("renders trusted Message/Round links, Message-only links, and a disabled untrusted action", () => {
    const render = (messages: Message[], memberships = rounds) => renderToStaticMarkup(createElement(ConversationSnapshotHistory, { conversationId, history, messages, rounds: memberships }));
    const trusted = render(canonicalMessages());
    expect(trusted).toContain(`/conversation/${conversationId}?message=message-3#message-message-3`);
    expect(trusted).toContain(`?mode=workspace&amp;round=round-2#round-round-2`);
    expect(trusted).toContain("打开所在 Round");
    expect(render(canonicalMessages(), [])).not.toContain("打开所在 Round");
    const untrusted = render(canonicalMessages().slice(0, 3));
    expect(untrusted).toContain("Only the assistant follow-up was added.");
    expect(untrusted).toContain("不可定位");
    expect(untrusted).toContain('disabled=""');
    expect(untrusted).not.toContain("?message=");
  });
});
