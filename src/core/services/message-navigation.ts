import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import type { ChatGPTShareSnapshotMessageDraft } from "@/core/services/chatgpt-share-snapshot-parser";

export function messageDomId(messageId: string): string {
  return `message-${messageId}`;
}

export function messageDeepLink(conversationId: string, messageId: string): string {
  return `/conversation/${encodeURIComponent(conversationId)}?message=${encodeURIComponent(messageId)}#${encodeURIComponent(messageDomId(messageId))}`;
}

export function roundDeepLink(conversationId: string, roundId: string): string {
  return `/conversation/${encodeURIComponent(conversationId)}?mode=workspace&round=${encodeURIComponent(roundId)}#round-${roundId}`;
}

export function resolveMessageTarget(
  conversationId: string,
  messageId: string | null,
  messages: readonly Readonly<Message>[],
): Readonly<Message> | null {
  if (!messageId) return null;
  const matches = messages.filter(({ id }) => id === messageId);
  return matches.length === 1 && matches[0].conversationId === conversationId
    ? matches[0] : null;
}

export type SnapshotMessageAnchor = Readonly<{
  messageId: string;
  sourceOrdinal: number;
  roundId?: string;
  roundOrder?: number;
}>;

// Build once per comparison; no text search or inferred Round grouping.
export function createSnapshotMessageAnchorResolver(input: Readonly<{
  conversationId: string;
  messages: readonly Readonly<Message>[];
  rounds: readonly Readonly<Round>[];
}>) {
  const ordered = input.messages.filter((m) => m.conversationId === input.conversationId)
    .sort((a, b) => a.order - b.order);
  const byOrdinal = new Map<number, Readonly<Message>[]>();
  const byId = new Map<string, Readonly<Message>[]>();
  for (const message of input.messages) {
    byId.set(message.id, [...(byId.get(message.id) ?? []), message]);
  }
  const validOrdinals = new Set<number>();
  let continuous = true;
  ordered.forEach((message, index) => {
    continuous = continuous && message.sourceOrdinal === index &&
      Number.isInteger(message.order) &&
      (index === 0 || message.order > ordered[index - 1].order);
    if (continuous) validOrdinals.add(index);
    if (typeof message.sourceOrdinal === "number") {
      byOrdinal.set(message.sourceOrdinal, [...(byOrdinal.get(message.sourceOrdinal) ?? []), message]);
    }
  });
  const memberships = new Map<string, Readonly<Round>[]>();
  const roundIdCounts = new Map<string, number>();
  for (const round of input.rounds) {
    roundIdCounts.set(round.id, (roundIdCounts.get(round.id) ?? 0) + 1);
    for (const id of round.messageIds) {
      memberships.set(id, [...(memberships.get(id) ?? []), round]);
    }
  }
  function validRound(round: Readonly<Round>) {
    return round.conversationId === input.conversationId &&
      roundIdCounts.get(round.id) === 1 && Number.isInteger(round.order) &&
      round.messageIds.every((id) => {
        const messages = byId.get(id);
        return messages?.length === 1 && messages[0].conversationId === input.conversationId &&
          memberships.get(id)?.length === 1;
      });
  }
  return (draft: Readonly<ChatGPTShareSnapshotMessageDraft>): SnapshotMessageAnchor | null => {
    const matches = byOrdinal.get(draft.ordinal);
    if (!Number.isInteger(draft.ordinal) || !validOrdinals.has(draft.ordinal) || matches?.length !== 1) return null;
    const message = matches[0];
    if (!message.id || byId.get(message.id)?.length !== 1 ||
      message.role !== draft.role || message.content !== draft.content) return null;
    const rounds = memberships.get(message.id) ?? [];
    if (rounds.length > 1 || (rounds.length === 1 && !validRound(rounds[0]))) return null;
    return {
      messageId: message.id,
      sourceOrdinal: draft.ordinal,
      ...(rounds.length === 1 ? { roundId: rounds[0].id, roundOrder: rounds[0].order } : {}),
    };
  };
}
