import { describe, expect, it } from "vitest";
import type { Conversation } from "@/core/entities/conversation";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { resolveKnowledgeProvenance } from "@/core/services/knowledge-provenance";
import { messageDeepLink, roundDeepLink } from "@/core/services/message-navigation";

const timestamp = "2026-09-07T00:00:00.000Z";

function conversation(id = "conversation-1"): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    sourceType: "Manual",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  };
}

function message(id: string, conversationId = "conversation-1", order = 0): Message {
  return {
    id,
    conversationId,
    role: "assistant",
    content: id,
    order,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function round(
  id = "round-1",
  conversationId = "conversation-1",
  messageIds = ["message-1", "message-2"],
): Round {
  return {
    id,
    conversationId,
    order: 1,
    title: `Round ${id}`,
    question: "Question",
    answer: "Answer",
    messageIds,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function card(fields: Partial<KnowledgeCard> = {}): KnowledgeCard {
  return {
    id: "knowledge-1",
    proposalId: "deleted-proposal",
    title: "Knowledge",
    content: "Content",
    summary: "Summary",
    sourceFile: "saved-source.txt",
    sourceConversationId: "conversation-1",
    sourceRoundId: "round-1",
    sourceMessageIds: ["message-1", "message-2"],
    sourceMessageCount: 2,
    sourceEvidenceExcerpt: "Evidence captured when Knowledge was created.",
    tagIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "Active",
    ...fields,
  };
}

function resolve(
  knowledge = card(),
  fields: Partial<{
    conversations: Conversation[];
    rounds: Round[];
    messages: Message[];
  }> = {},
) {
  return resolveKnowledgeProvenance({
    card: knowledge,
    conversations: fields.conversations ?? [conversation()],
    rounds: fields.rounds ?? [round()],
    messages: fields.messages ?? [message("message-1"), message("message-2", "conversation-1", 1)],
  });
}

describe("Knowledge provenance read model", () => {
  it("resolves a complete trusted Conversation, Round and multiple Messages", () => {
    const result = resolve();

    expect(result.current.conversation).toMatchObject({
      status: "available",
      href: "/conversation/conversation-1",
    });
    expect(result.current.round).toMatchObject({
      status: "available",
      href: roundDeepLink("conversation-1", "round-1"),
    });
    expect(result.current.messages.map(({ status, href }) => ({ status, href }))).toEqual([
      { status: "available", href: messageDeepLink("conversation-1", "message-1") },
      { status: "available", href: messageDeepLink("conversation-1", "message-2") },
    ]);
    expect(result.current.messages[0].containingRound?.href).toBe(
      roundDeepLink("conversation-1", "round-1"),
    );
  });

  it("supports Conversation-only provenance without inventing Round or Message sources", () => {
    const result = resolve(card({ sourceRoundId: undefined, sourceMessageIds: undefined }));

    expect(result.current.conversation.status).toBe("available");
    expect(result.current.round.status).toBe("not-recorded");
    expect(result.current.messagesStatus).toBe("not-recorded");
    expect(result.current.messages).toEqual([]);
  });

  it("keeps saved evidence visible when Conversation exists but Message IDs were not saved", () => {
    const result = resolve(card({ sourceRoundId: undefined, sourceMessageIds: [] }));

    expect(result.savedEvidence).toEqual({
      sourceFile: "saved-source.txt",
      sourceMessageCount: 2,
      sourceEvidenceExcerpt: "Evidence captured when Knowledge was created.",
    });
    expect(result.current.messagesStatus).toBe("not-recorded");
  });

  it("fails closed for dangling Conversation, Round and Message entities", () => {
    const result = resolve(card(), { conversations: [], rounds: [], messages: [] });

    expect(result.current.conversation.status).toBe("unavailable");
    expect(result.current.round.status).toBe("unavailable");
    expect(result.current.messages.map(({ status }) => status)).toEqual(["dangling", "dangling"]);
    expect(result.savedEvidence.sourceEvidenceExcerpt).toContain("Evidence captured");
  });

  it("does not expose orphan Round or Message links after the Conversation is deleted", () => {
    const result = resolve(card(), { conversations: [] });

    expect(result.current.conversation.status).toBe("unavailable");
    expect(result.current.round.status).toBe("unavailable");
    expect(result.current.messages.map(({ status, href }) => ({ status, href }))).toEqual([
      { status: "unverifiable", href: undefined },
      { status: "unverifiable", href: undefined },
    ]);
    expect(result.savedEvidence.sourceEvidenceExcerpt).toContain("Evidence captured");
  });

  it("fails closed for foreign Round and Message ownership", () => {
    const result = resolve(card(), {
      rounds: [round("round-1", "conversation-2")],
      messages: [message("message-1", "conversation-2"), message("message-2", "conversation-2", 1)],
    });

    expect(result.current.round.status).toBe("foreign");
    expect(result.current.messages.map(({ status, href }) => ({ status, href }))).toEqual([
      { status: "foreign", href: undefined },
      { status: "foreign", href: undefined },
    ]);
  });

  it("marks duplicate saved IDs and ambiguous duplicate current entities without links", () => {
    const duplicateSaved = resolve(card({ sourceMessageIds: ["message-1", "message-1"] }));
    expect(duplicateSaved.current.messages).toEqual([
      expect.objectContaining({
        messageId: "message-1",
        occurrenceCount: 2,
        status: "duplicate",
      }),
    ]);
    expect(duplicateSaved.current.messages[0].href).toBeUndefined();

    const duplicateCurrent = resolve(card({ sourceMessageIds: ["message-1"] }), {
      messages: [message("message-1"), message("message-1")],
    });
    expect(duplicateCurrent.current.messages[0].status).toBe("ambiguous");
    expect(duplicateCurrent.current.messages[0].href).toBeUndefined();
  });

  it("uses Knowledge-owned fields after Proposal deletion and preserves partial legacy states", () => {
    const complete = resolve(card({ proposalId: "proposal-does-not-exist" }));
    expect(complete.current.messages[0].status).toBe("available");

    const legacy = resolve(card({
      sourceConversationId: undefined,
      sourceRoundId: undefined,
      sourceMessageIds: undefined,
    }));
    expect(legacy.isLegacy).toBe(true);
    expect(legacy.current.conversation.status).toBe("not-recorded");
    expect(legacy.current.messagesStatus).toBe("not-recorded");
    expect(legacy.savedEvidence.sourceFile).toBe("saved-source.txt");
  });

  it("requires a saved Conversation owner before trusting a Message but can resolve an explicit Round", () => {
    const result = resolve(card({ sourceConversationId: undefined }));

    expect(result.current.conversation.status).toBe("not-recorded");
    expect(result.current.round).toMatchObject({
      status: "available",
      href: roundDeepLink("conversation-1", "round-1"),
    });
    expect(result.current.messages.map(({ status }) => status)).toEqual([
      "unverifiable",
      "unverifiable",
    ]);
  });

  it("is a read-only projection and never mutates Knowledge or source entities", () => {
    const frozenCard = Object.freeze(card());
    const frozenConversations = Object.freeze([Object.freeze(conversation())]);
    const frozenRounds = Object.freeze([Object.freeze({ ...round(), messageIds: Object.freeze(["message-1", "message-2"]) as unknown as string[] })]);
    const frozenMessages = Object.freeze([Object.freeze(message("message-1")), Object.freeze(message("message-2", "conversation-1", 1))]);

    expect(() => resolveKnowledgeProvenance({
      card: frozenCard,
      conversations: frozenConversations,
      rounds: frozenRounds,
      messages: frozenMessages,
    })).not.toThrow();
    expect(frozenCard.sourceMessageIds).toEqual(["message-1", "message-2"]);
  });
});
