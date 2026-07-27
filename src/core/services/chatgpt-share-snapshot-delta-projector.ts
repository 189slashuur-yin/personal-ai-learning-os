import type {
  ParsedMessageDraft,
  ParsedRoundDraft,
} from "@/core/entities/import-parser";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import type { ChatGPTShareSnapshotComparison } from "@/core/services/chatgpt-share-snapshot-comparator";
import { deriveRoundDrafts } from "@/core/services/import-parser-pipeline";

export const chatGPTShareSnapshotDeltaBlockedReasons = [
  "no-unanswered-tail-round",
  "tail-round-mismatch",
  "message-order-mismatch",
  "ownership-mismatch",
  "projection-divergence",
] as const;

export type ChatGPTShareSnapshotDeltaBlockedReason =
  (typeof chatGPTShareSnapshotDeltaBlockedReasons)[number];

export type ChatGPTShareSnapshotDeltaProjection =
  | Readonly<{
      status: "projected";
      roundToExtend: Readonly<Round> | null;
      messagesToAppend: readonly Readonly<Message>[];
      roundsToCreate: readonly Readonly<ParsedRoundDraft>[];
    }>
  | Readonly<{
      status: "blocked";
      reason: ChatGPTShareSnapshotDeltaBlockedReason;
    }>;

export type ProjectChatGPTShareSnapshotDeltaInput = Readonly<{
  existingCanonicalMessages: readonly Readonly<Message>[];
  existingRounds: readonly Readonly<Round>[];
  appendSuffixMessages: readonly Readonly<Message>[];
  comparisonBaseline: Readonly<ChatGPTShareSnapshotComparison>;
}>;

function blocked(
  reason: ChatGPTShareSnapshotDeltaBlockedReason,
): ChatGPTShareSnapshotDeltaProjection {
  return { status: "blocked", reason };
}

function orderedMessages(
  messages: readonly Readonly<Message>[],
): readonly Readonly<Message>[] {
  return [...messages].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}

function hasUniqueMessageIdentity(
  existingMessages: readonly Readonly<Message>[],
  suffixMessages: readonly Readonly<Message>[],
): boolean {
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const message of [...existingMessages, ...suffixMessages]) {
    if (ids.has(message.id) || orders.has(message.order)) return false;
    ids.add(message.id);
    orders.add(message.order);
  }
  return true;
}

function hasValidMessageSequence(
  existingMessages: readonly Readonly<Message>[],
  suffixMessages: readonly Readonly<Message>[],
  existingMessageCount: number,
): boolean {
  if (!hasUniqueMessageIdentity(existingMessages, suffixMessages)) return false;

  for (const [index, message] of existingMessages.entries()) {
    if (message.sourceOrdinal !== index) return false;
    if (index > 0 && message.order !== existingMessages[index - 1].order + 1) {
      return false;
    }
  }

  const firstSuffixOrder =
    (existingMessages.at(-1)?.order ?? -1) + 1;
  return suffixMessages.every(
    (message, index) =>
      message.order === firstSuffixOrder + index &&
      message.sourceOrdinal === existingMessageCount + index,
  );
}

function baselineMatches(
  baseline: Readonly<ChatGPTShareSnapshotComparison>,
  existingMessageCount: number,
  suffixMessages: readonly Readonly<Message>[],
): boolean {
  if (
    baseline.status !== "append" ||
    baseline.existingMessageCount !== existingMessageCount ||
    baseline.commonPrefixCount !== existingMessageCount ||
    baseline.newMessageCount !== suffixMessages.length ||
    baseline.suffixMessages.length !== suffixMessages.length
  ) {
    return false;
  }

  return suffixMessages.every((message, index) => {
    const expected = baseline.suffixMessages[index];
    return (
      expected?.ordinal === message.sourceOrdinal &&
      expected.role === message.role &&
      expected.content === message.content
    );
  });
}

function deriveRoundsToCreate(
  suffixMessages: readonly Readonly<Message>[],
  firstNewRoundMessageIndex: number,
): ParsedRoundDraft[] {
  const drafts: ParsedMessageDraft[] = suffixMessages
    .slice(firstNewRoundMessageIndex)
    .map(({ role, content }) => ({ role, content }));
  return deriveRoundDrafts(drafts).map((round) => ({
    ...round,
    messageIndexes: round.messageIndexes.map(
      (index) => index + firstNewRoundMessageIndex,
    ),
  }));
}

function messageIdsMatch(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((messageId, index) => messageId === expected[index])
  );
}

export function projectChatGPTShareSnapshotDelta(
  input: ProjectChatGPTShareSnapshotDeltaInput,
): ChatGPTShareSnapshotDeltaProjection {
  const existingMessages = orderedMessages(input.existingCanonicalMessages);
  const suffixMessages = [...input.appendSuffixMessages];
  const conversationIds = new Set(
    [...existingMessages, ...suffixMessages, ...input.existingRounds].map(
      ({ conversationId }) => conversationId,
    ),
  );
  if (
    conversationIds.size !== 1 ||
    [...conversationIds].some((conversationId) => !conversationId.trim())
  ) {
    return blocked("ownership-mismatch");
  }

  if (
    !hasValidMessageSequence(
      existingMessages,
      suffixMessages,
      existingMessages.length,
    )
  ) {
    return blocked("message-order-mismatch");
  }
  if (
    !baselineMatches(
      input.comparisonBaseline,
      existingMessages.length,
      suffixMessages,
    )
  ) {
    return blocked("projection-divergence");
  }

  const firstMessage = suffixMessages[0];
  if (!firstMessage) {
    return blocked("projection-divergence");
  }
  if (firstMessage.role !== "assistant") {
    return {
      status: "projected",
      roundToExtend: null,
      messagesToAppend: suffixMessages.map((message) => ({ ...message })),
      roundsToCreate: deriveRoundsToCreate(suffixMessages, 0),
    };
  }

  if (input.existingRounds.length === 0) {
    return blocked("no-unanswered-tail-round");
  }
  const rounds = [...input.existingRounds].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
  const tailRound = rounds.at(-1);
  const previousRound = rounds.at(-2);
  if (
    !tailRound ||
    (previousRound && previousRound.order === tailRound.order)
  ) {
    return blocked("tail-round-mismatch");
  }

  const existingDrafts: ParsedMessageDraft[] = existingMessages.map(
    ({ role, content }) => ({ role, content }),
  );
  const expectedTail = deriveRoundDrafts(existingDrafts).at(-1);
  if (!expectedTail) {
    return blocked("no-unanswered-tail-round");
  }
  const expectedMessageIds = expectedTail.messageIndexes.map(
    (index) => existingMessages[index]?.id ?? "",
  );
  if (
    expectedMessageIds.some((id) => !id) ||
    !messageIdsMatch(tailRound.messageIds, expectedMessageIds)
  ) {
    return blocked("tail-round-mismatch");
  }
  if (expectedTail.answer.trim() || tailRound.answer.trim()) {
    return blocked("no-unanswered-tail-round");
  }
  if (tailRound.question !== expectedTail.question) {
    return blocked("projection-divergence");
  }

  const assistantPrefixLength = suffixMessages.findIndex(
    ({ role }) => role !== "assistant",
  );
  const extensionMessageCount =
    assistantPrefixLength < 0 ? suffixMessages.length : assistantPrefixLength;
  const extensionMessages = suffixMessages.slice(0, extensionMessageCount);
  const roundToExtend: Round = {
    ...tailRound,
    answer: extensionMessages.map(({ content }) => content).join("\n\n"),
    messageIds: [
      ...tailRound.messageIds,
      ...extensionMessages.map(({ id }) => id),
    ],
    updatedAt: extensionMessages.at(-1)?.updatedAt ?? tailRound.updatedAt,
  };

  return {
    status: "projected",
    roundToExtend,
    messagesToAppend: suffixMessages.map((message) => ({ ...message })),
    roundsToCreate: deriveRoundsToCreate(
      suffixMessages,
      extensionMessageCount,
    ),
  };
}
