import type { Conversation } from "@/core/entities/conversation";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import type { ChatGPTShareIdentity } from "@/core/services/chatgpt-share-snapshot-url";
import { isChatGPTShareSnapshotMetadata } from "@/core/entities/imported-source";

export type ShareSnapshotBaselineKind = "new" | "existing";

export type ShareSnapshotBaseline = Readonly<{
  kind: ShareSnapshotBaselineKind;
  conversationId: string;
  sourceId?: string;
  identity: ChatGPTShareIdentity;
  fingerprint: string;
}>;

export type ShareSnapshotBaselineState = Readonly<{
  kind: ShareSnapshotBaselineKind;
  conversationId: string;
  sourceId?: string;
  identity: ChatGPTShareIdentity;
  conversation: Readonly<Conversation> | null;
  source: Readonly<ImportedSource> | null;
  historySources: readonly Readonly<ImportedSource>[];
  messages: readonly Readonly<Message>[];
  rounds: readonly Readonly<Round>[];
  matchingSourceIds: readonly string[];
}>;

export function sourceMatchesShareIdentity(
  source: Readonly<ImportedSource>,
  identity: ChatGPTShareIdentity,
): boolean {
  return (
    isChatGPTShareSnapshotMetadata(source.shareSnapshot) &&
    source.shareSnapshot.resourceHash === identity.resourceHash
  );
}

function conversationProjection(
  conversation: Readonly<Conversation> | null,
): unknown {
  if (!conversation) return null;
  return {
    id: conversation.id,
    title: conversation.title,
    note: conversation.note,
    summary: conversation.summary,
    conclusion: conversation.conclusion,
    pendingQuestions: conversation.pendingQuestions,
    context: conversation.context,
  };
}

function sourceProjection(source: Readonly<ImportedSource> | null): unknown {
  if (!source) return null;
  return {
    id: source.id,
    conversationId: source.conversationId,
    kind: source.kind,
    name: source.name,
    content: source.content,
    shareSnapshot: source.shareSnapshot,
  };
}

function messageProjection(message: Readonly<Message>): unknown {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    order: message.order,
    externalMessageId: message.externalMessageId,
    contentHash: message.contentHash,
    sourceId: message.sourceId,
    sourceOrdinal: message.sourceOrdinal,
  };
}

function roundProjection(round: Readonly<Round>): unknown {
  return {
    id: round.id,
    conversationId: round.conversationId,
    order: round.order,
    title: round.title,
    question: round.question,
    answer: round.answer,
    messageIds: [...round.messageIds],
    note: round.note,
    summary: round.summary,
    context: round.context,
  };
}

function normalizeForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForStableJson);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeForStableJson(entry)]),
  );
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildShareSnapshotBaseline(
  state: ShareSnapshotBaselineState,
): Promise<ShareSnapshotBaseline> {
  const value = normalizeForStableJson({
    kind: state.kind,
    conversationId: state.conversationId,
    sourceId: state.sourceId,
    identity: state.identity,
    matchingSourceIds: [...state.matchingSourceIds].sort(),
    conversation: conversationProjection(state.conversation),
    source: sourceProjection(state.source),
    historySources: [...state.historySources]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(sourceProjection),
    messages: [...state.messages]
      .sort(
        (left, right) =>
          left.order - right.order || left.id.localeCompare(right.id),
      )
      .map(messageProjection),
    rounds: [...state.rounds]
      .sort(
        (left, right) =>
          left.order - right.order || left.id.localeCompare(right.id),
      )
      .map(roundProjection),
  });
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    kind: state.kind,
    conversationId: state.conversationId,
    sourceId: state.sourceId,
    identity: { ...state.identity },
    fingerprint: bytesToHex(digest),
  };
}
