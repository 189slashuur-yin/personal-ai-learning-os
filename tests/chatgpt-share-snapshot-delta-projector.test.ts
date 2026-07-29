import { describe, expect, it } from "vitest";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import type { ChatGPTShareSnapshotComparison } from "@/core/services/chatgpt-share-snapshot-comparator";
import {
  projectChatGPTShareSnapshotDelta,
  type ChatGPTShareSnapshotDeltaProjection,
} from "@/core/services/chatgpt-share-snapshot-delta-projector";

const conversationId = "conversation";
const previousAt = "2026-07-27T01:00:00.000Z";
const capturedAt = "2026-07-27T02:00:00.000Z";

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
  ordinal: number,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId,
    role,
    content,
    order: ordinal,
    createdAt: previousAt,
    updatedAt: previousAt,
    sourceId: ordinal < 3 ? "snapshot-1" : "snapshot-2",
    sourceOrdinal: ordinal,
    ...overrides,
  };
}

function existingMessages(): Message[] {
  return [
    message("message-0", "user", "Initial question", 0),
    message("message-1", "assistant", "Initial answer", 1),
    message("message-2", "user", "Unanswered follow-up", 2),
  ];
}

function existingRounds(): Round[] {
  return [
    {
      id: "round-1",
      conversationId,
      order: 1,
      title: "Initial title",
      question: "Initial question",
      answer: "Initial answer",
      messageIds: ["message-0", "message-1"],
      createdAt: previousAt,
      updatedAt: previousAt,
    },
    {
      id: "round-tail",
      conversationId,
      order: 2,
      title: "Locally preserved title",
      question: "Unanswered follow-up",
      answer: "",
      messageIds: ["message-2"],
      note: "local note",
      summary: "local summary",
      context: {
        inheritanceMode: "inherit",
        snapshot: { currentState: "local context" },
        confirmedAt: previousAt,
      },
      createdAt: previousAt,
      updatedAt: previousAt,
    },
  ];
}

function assistantSuffix(): Message[] {
  return [
    message("message-3", "assistant", "Deferred answer", 3, {
      createdAt: capturedAt,
      updatedAt: capturedAt,
    }),
  ];
}

function baseline(
  suffix = assistantSuffix(),
  overrides: Partial<ChatGPTShareSnapshotComparison> = {},
): ChatGPTShareSnapshotComparison {
  return {
    status: "append",
    sourceId: "snapshot-1",
    existingMessageCount: 3,
    snapshotMessageCount: 3 + suffix.length,
    commonPrefixCount: 3,
    newMessageCount: suffix.length,
    suffixMessages: suffix.map(({ role, content, sourceOrdinal }) => ({
      role: role as "user" | "assistant",
      content,
      ordinal: sourceOrdinal as number,
    })),
    snapshotHashMatchesIncoming: false,
    ...overrides,
  };
}

function project(input: {
  messages?: Message[];
  rounds?: Round[];
  suffix?: Message[];
  comparison?: ChatGPTShareSnapshotComparison;
} = {}): ChatGPTShareSnapshotDeltaProjection {
  const suffix = input.suffix ?? assistantSuffix();
  return projectChatGPTShareSnapshotDelta({
    existingCanonicalMessages: input.messages ?? existingMessages(),
    existingRounds: input.rounds ?? existingRounds(),
    appendSuffixMessages: suffix,
    comparisonBaseline: input.comparison ?? baseline(suffix),
  });
}

describe("ChatGPT Share Snapshot delta projector", () => {
  it("extends a valid unanswered tail with an assistant-only suffix", () => {
    const projection = project();

    expect(projection).toMatchObject({
      status: "projected",
      roundToExtend: {
        id: "round-tail",
        answer: "Deferred answer",
        messageIds: ["message-2", "message-3"],
        updatedAt: capturedAt,
      },
      messagesToAppend: [{ id: "message-3", sourceOrdinal: 3 }],
      roundsToCreate: [],
    });
  });

  it("blocks assistant-only append when there is no tail Round", () => {
    expect(project({ rounds: [] })).toEqual({
      status: "blocked",
      reason: "no-unanswered-tail-round",
    });
  });

  it("blocks assistant-only append when the tail Round is already answered", () => {
    const rounds = existingRounds();
    rounds[1] = { ...rounds[1], answer: "Already answered" };

    expect(project({ rounds })).toEqual({
      status: "blocked",
      reason: "no-unanswered-tail-round",
    });
  });

  it("blocks a tail Round owned by another Conversation", () => {
    const rounds = existingRounds();
    rounds[1] = { ...rounds[1], conversationId: "another-conversation" };

    expect(project({ rounds })).toEqual({
      status: "blocked",
      reason: "ownership-mismatch",
    });
  });

  it("blocks an Assistant that does not continue the absolute ordinal", () => {
    const suffix = assistantSuffix().map((entry) => ({
      ...entry,
      sourceOrdinal: 4,
    }));

    expect(project({ suffix, comparison: baseline(suffix) })).toEqual({
      status: "blocked",
      reason: "message-order-mismatch",
    });
  });

  it("preserves the existing Round ID instead of allocating an orphan Round", () => {
    const projection = project();

    expect(projection.status).toBe("projected");
    if (projection.status !== "projected") return;
    expect(projection.roundToExtend?.id).toBe("round-tail");
    expect(projection.roundsToCreate).toHaveLength(0);
  });

  it("preserves note, summary, context, title, and question", () => {
    const tail = existingRounds()[1];
    const projection = project();

    expect(projection.status).toBe("projected");
    if (projection.status !== "projected" || !projection.roundToExtend) return;
    expect(projection.roundToExtend).toMatchObject({
      id: tail.id,
      note: tail.note,
      summary: tail.summary,
      context: tail.context,
      title: tail.title,
      question: tail.question,
      createdAt: tail.createdAt,
    });
  });

  it("extends the tail Assistant prefix and derives new Rounds from the later User", () => {
    const suffix = [
      ...assistantSuffix(),
      message("message-4", "user", "New question", 4, {
        createdAt: capturedAt,
        updatedAt: capturedAt,
      }),
      message("message-5", "assistant", "New answer", 5, {
        createdAt: capturedAt,
        updatedAt: capturedAt,
      }),
    ];
    const projection = project({ suffix });

    expect(projection).toMatchObject({
      status: "projected",
      roundToExtend: {
        id: "round-tail",
        messageIds: ["message-2", "message-3"],
      },
      roundsToCreate: [
        {
          order: 1,
          question: "New question",
          answer: "New answer",
          messageIndexes: [1, 2],
        },
      ],
    });
  });

  it("never creates an orphan Assistant Round", () => {
    const projection = project();

    expect(projection.status).toBe("projected");
    if (projection.status !== "projected") return;
    expect(projection.roundsToCreate).toEqual([]);
    expect(projection.roundToExtend?.question).toBe("Unanswered follow-up");
  });

  it("blocks when the canonical tail membership does not match the baseline", () => {
    const rounds = existingRounds();
    rounds[1] = { ...rounds[1], messageIds: ["message-1"] };

    expect(project({ rounds })).toEqual({
      status: "blocked",
      reason: "tail-round-mismatch",
    });
  });

  it("blocks when the comparison suffix diverges from materialized Messages", () => {
    const comparison = baseline(assistantSuffix(), {
      suffixMessages: [
        { role: "assistant", content: "Different answer", ordinal: 3 },
      ],
    });

    expect(project({ comparison })).toEqual({
      status: "blocked",
      reason: "projection-divergence",
    });
  });
});
