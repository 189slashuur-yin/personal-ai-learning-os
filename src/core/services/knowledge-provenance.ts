import type { Conversation } from "@/core/entities/conversation";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import {
  messageDeepLink,
  roundDeepLink,
} from "@/core/services/message-navigation";

export type KnowledgeConversationSource =
  | Readonly<{ status: "not-recorded" }>
  | Readonly<{ status: "unavailable"; conversationId: string }>
  | Readonly<{
      status: "available";
      conversation: Readonly<Conversation>;
      href: string;
    }>;

export type KnowledgeRoundSource =
  | Readonly<{ status: "not-recorded" }>
  | Readonly<{ status: "unavailable"; roundId: string }>
  | Readonly<{ status: "foreign"; roundId: string }>
  | Readonly<{
      status: "available";
      round: Readonly<Round>;
      href: string;
    }>;

export type KnowledgeMessageSourceStatus =
  | "available"
  | "dangling"
  | "foreign"
  | "duplicate"
  | "ambiguous"
  | "unverifiable";

export type KnowledgeMessageSource = Readonly<{
  messageId: string;
  occurrenceCount: number;
  status: KnowledgeMessageSourceStatus;
  message?: Readonly<Message>;
  href?: string;
  containingRound?: Readonly<{
    round: Readonly<Round>;
    href: string;
  }>;
}>;

export type KnowledgeProvenance = Readonly<{
  isLegacy: boolean;
  savedEvidence: Readonly<{
    sourceFile: string;
    sourceMessageCount?: number;
    sourceEvidenceExcerpt?: string;
  }>;
  current: Readonly<{
    conversation: KnowledgeConversationSource;
    round: KnowledgeRoundSource;
    messagesStatus: "not-recorded" | "recorded";
    messages: readonly KnowledgeMessageSource[];
  }>;
}>;

function groupById<T extends { id: string }>(items: readonly Readonly<T>[]) {
  const grouped = new Map<string, Readonly<T>[]>();
  for (const item of items) {
    grouped.set(item.id, [...(grouped.get(item.id) ?? []), item]);
  }
  return grouped;
}

function resolveContainingRound(
  message: Readonly<Message>,
  roundsById: ReadonlyMap<string, readonly Readonly<Round>[]>,
  rounds: readonly Readonly<Round>[],
) {
  const matches = rounds.filter(
    (round) =>
      round.conversationId === message.conversationId &&
      round.messageIds.filter((messageId) => messageId === message.id).length === 1 &&
      roundsById.get(round.id)?.length === 1,
  );
  if (matches.length !== 1) return undefined;
  return {
    round: matches[0],
    href: roundDeepLink(matches[0].conversationId, matches[0].id),
  };
}

/**
 * Resolves only provenance already persisted on the KnowledgeCard. It never
 * consults Proposal data and never infers a source by matching content.
 */
export function resolveKnowledgeProvenance(input: Readonly<{
  card: Readonly<KnowledgeCard>;
  conversations: readonly Readonly<Conversation>[];
  rounds: readonly Readonly<Round>[];
  messages: readonly Readonly<Message>[];
}>): KnowledgeProvenance {
  const { card } = input;
  const conversationsById = groupById(input.conversations);
  const roundsById = groupById(input.rounds);
  const messagesById = groupById(input.messages);

  let conversation: KnowledgeConversationSource = { status: "not-recorded" };
  if (card.sourceConversationId) {
    const matches = conversationsById.get(card.sourceConversationId) ?? [];
    conversation = matches.length === 1
      ? {
          status: "available",
          conversation: matches[0],
          href: `/conversation/${encodeURIComponent(matches[0].id)}`,
        }
      : { status: "unavailable", conversationId: card.sourceConversationId };
  }

  let round: KnowledgeRoundSource = { status: "not-recorded" };
  if (card.sourceRoundId) {
    const matches = roundsById.get(card.sourceRoundId) ?? [];
    if (matches.length !== 1) {
      round = { status: "unavailable", roundId: card.sourceRoundId };
    } else if (
      card.sourceConversationId &&
      matches[0].conversationId !== card.sourceConversationId
    ) {
      round = { status: "foreign", roundId: card.sourceRoundId };
    } else if (
      (conversationsById.get(matches[0].conversationId) ?? []).length !== 1
    ) {
      round = { status: "unavailable", roundId: card.sourceRoundId };
    } else {
      round = {
        status: "available",
        round: matches[0],
        href: roundDeepLink(matches[0].conversationId, matches[0].id),
      };
    }
  }

  const recordedMessageIds = card.sourceMessageIds;
  const messageIdCounts = new Map<string, number>();
  for (const messageId of recordedMessageIds ?? []) {
    messageIdCounts.set(messageId, (messageIdCounts.get(messageId) ?? 0) + 1);
  }

  const messages = [...messageIdCounts].map<KnowledgeMessageSource>(
    ([messageId, occurrenceCount]) => {
      if (occurrenceCount > 1) {
        return { messageId, occurrenceCount, status: "duplicate" };
      }
      const matches = messagesById.get(messageId) ?? [];
      if (matches.length === 0) {
        return { messageId, occurrenceCount, status: "dangling" };
      }
      if (matches.length > 1) {
        return { messageId, occurrenceCount, status: "ambiguous" };
      }
      const message = matches[0];
      if (
        !card.sourceConversationId ||
        conversation.status !== "available"
      ) {
        return { messageId, occurrenceCount, status: "unverifiable", message };
      }
      if (message.conversationId !== card.sourceConversationId) {
        return { messageId, occurrenceCount, status: "foreign", message };
      }
      return {
        messageId,
        occurrenceCount,
        status: "available",
        message,
        href: messageDeepLink(card.sourceConversationId, message.id),
        containingRound: resolveContainingRound(message, roundsById, input.rounds),
      };
    },
  );

  return {
    isLegacy:
      card.sourceConversationId === undefined &&
      card.sourceRoundId === undefined &&
      card.sourceMessageIds === undefined,
    savedEvidence: {
      sourceFile: card.sourceFile,
      sourceMessageCount: card.sourceMessageCount,
      sourceEvidenceExcerpt: card.sourceEvidenceExcerpt,
    },
    current: {
      conversation,
      round,
      messagesStatus:
        recordedMessageIds && recordedMessageIds.length > 0
          ? "recorded"
          : "not-recorded",
      messages,
    },
  };
}
