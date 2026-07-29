import {
  isChatGPTShareSnapshotMetadata,
  type ImportedSource,
} from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import {
  parseChatGPTShareSnapshot,
  type ChatGPTShareSnapshotMessageDraft,
} from "@/core/services/chatgpt-share-snapshot-parser";

export const CHATGPT_SHARE_SNAPSHOT_HASH_ALGORITHM =
  "sha256-json-role-content-v1" as const;

export type ChatGPTShareSnapshotComparisonStatus =
  | "same"
  | "append"
  | "blocked-shorter"
  | "blocked-diverged"
  | "blocked-projection-diverged"
  | "invalid";

export type ChatGPTShareSnapshotComparison = {
  status: ChatGPTShareSnapshotComparisonStatus;
  sourceId: string;
  existingMessageCount: number;
  snapshotMessageCount: number;
  commonPrefixCount: number;
  newMessageCount: number;
  estimatedDivergenceOrdinal?: number;
  suffixMessages: ChatGPTShareSnapshotMessageDraft[];
  snapshotHashMatchesIncoming: boolean;
  invalidReason?: string;
};

export type CompareChatGPTShareSnapshotInput = {
  headSource: Readonly<ImportedSource>;
  canonicalMessages: readonly Readonly<Message>[];
  snapshotMessages: readonly ChatGPTShareSnapshotMessageDraft[];
  incomingSnapshotHash: string;
};

function canonicalSnapshotValue(
  messages: readonly Pick<
    ChatGPTShareSnapshotMessageDraft,
    "role" | "content"
  >[],
): string {
  return JSON.stringify(
    messages.map((message) => [message.role, message.content]),
  );
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashChatGPTShareSnapshot(
  messages: readonly Pick<
    ChatGPTShareSnapshotMessageDraft,
    "role" | "content"
  >[],
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSnapshotValue(messages));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(digest);
}

function messagesEqual(
  left: Pick<Message, "role" | "content">,
  right: Pick<ChatGPTShareSnapshotMessageDraft, "role" | "content">,
): boolean {
  return left.role === right.role && left.content === right.content;
}

function invalidComparison(
  sourceId: string,
  snapshotMessageCount: number,
  incomingSnapshotHash: string,
  storedSnapshotHash: string | undefined,
  invalidReason: string,
): ChatGPTShareSnapshotComparison {
  return {
    status: "invalid",
    sourceId,
    existingMessageCount: 0,
    snapshotMessageCount,
    commonPrefixCount: 0,
    newMessageCount: 0,
    suffixMessages: [],
    snapshotHashMatchesIncoming:
      storedSnapshotHash === incomingSnapshotHash,
    invalidReason,
  };
}

function validateIncomingOrdinals(
  messages: readonly ChatGPTShareSnapshotMessageDraft[],
): string | null {
  for (const [index, message] of messages.entries()) {
    if (message.ordinal !== index) {
      return `Snapshot message ordinal ${message.ordinal} is invalid; expected ${index}.`;
    }
  }
  return null;
}

export function compareChatGPTShareSnapshot(
  input: CompareChatGPTShareSnapshotInput,
): ChatGPTShareSnapshotComparison {
  const sourceId = input.headSource.id.trim();
  const metadata = input.headSource.shareSnapshot;
  if (!sourceId) {
    return invalidComparison(
      input.headSource.id,
      input.snapshotMessages.length,
      input.incomingSnapshotHash,
      undefined,
      "A head Snapshot Source ID is required.",
    );
  }
  if (!isChatGPTShareSnapshotMetadata(metadata)) {
    return invalidComparison(
      sourceId,
      input.snapshotMessages.length,
      input.incomingSnapshotHash,
      metadata?.snapshotHash,
      `Source ${sourceId} is not an immutable Share Snapshot.`,
    );
  }

  const incomingOrdinalError = validateIncomingOrdinals(
    input.snapshotMessages,
  );
  if (incomingOrdinalError) {
    return invalidComparison(
      sourceId,
      input.snapshotMessages.length,
      input.incomingSnapshotHash,
      metadata.snapshotHash,
      incomingOrdinalError,
    );
  }

  const parsedHead = parseChatGPTShareSnapshot({
    kind: "pasted-text",
    content: input.headSource.content,
  });
  if (parsedHead.errors.length > 0 || parsedHead.messages.length === 0) {
    return invalidComparison(
      sourceId,
      input.snapshotMessages.length,
      input.incomingSnapshotHash,
      metadata.snapshotHash,
      `Source ${sourceId} does not contain a valid normalized transcript.`,
    );
  }
  if (metadata.snapshotMessageCount !== parsedHead.messages.length) {
    return invalidComparison(
      sourceId,
      input.snapshotMessages.length,
      input.incomingSnapshotHash,
      metadata.snapshotHash,
      `Source ${sourceId} metadata expects ${metadata.snapshotMessageCount} messages, but its transcript contains ${parsedHead.messages.length}.`,
    );
  }

  const conversationId = input.headSource.conversationId;
  if (!conversationId) {
    return invalidComparison(
      sourceId,
      input.snapshotMessages.length,
      input.incomingSnapshotHash,
      metadata.snapshotHash,
      `Source ${sourceId} has no owning Conversation.`,
    );
  }
  const canonicalMessages = input.canonicalMessages
    .filter((message) => message.conversationId === conversationId)
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
  let projectionDivergenceOrdinal: number | undefined;
  if (canonicalMessages.length !== parsedHead.messages.length) {
    projectionDivergenceOrdinal = Math.min(
      canonicalMessages.length,
      parsedHead.messages.length,
    );
  } else {
    for (const [index, message] of canonicalMessages.entries()) {
      if (
        message.sourceOrdinal !== index ||
        !messagesEqual(message, parsedHead.messages[index])
      ) {
        projectionDivergenceOrdinal = index;
        break;
      }
    }
  }
  if (projectionDivergenceOrdinal !== undefined) {
    return {
      status: "blocked-projection-diverged",
      sourceId,
      existingMessageCount: parsedHead.messages.length,
      snapshotMessageCount: input.snapshotMessages.length,
      commonPrefixCount: 0,
      newMessageCount: 0,
      estimatedDivergenceOrdinal: projectionDivergenceOrdinal,
      suffixMessages: [],
      snapshotHashMatchesIncoming:
        metadata.snapshotHash === input.incomingSnapshotHash,
    };
  }

  let commonPrefixCount = 0;
  while (
    commonPrefixCount < parsedHead.messages.length &&
    commonPrefixCount < input.snapshotMessages.length &&
    messagesEqual(
      parsedHead.messages[commonPrefixCount],
      input.snapshotMessages[commonPrefixCount],
    )
  ) {
    commonPrefixCount += 1;
  }

  let status: ChatGPTShareSnapshotComparisonStatus;
  if (
    commonPrefixCount === parsedHead.messages.length &&
    commonPrefixCount === input.snapshotMessages.length
  ) {
    status = "same";
  } else if (
    commonPrefixCount === parsedHead.messages.length &&
    input.snapshotMessages.length > parsedHead.messages.length
  ) {
    status = "append";
  } else if (
    commonPrefixCount === input.snapshotMessages.length &&
    parsedHead.messages.length > input.snapshotMessages.length
  ) {
    status = "blocked-shorter";
  } else {
    status = "blocked-diverged";
  }

  return {
    status,
    sourceId,
    existingMessageCount: parsedHead.messages.length,
    snapshotMessageCount: input.snapshotMessages.length,
    commonPrefixCount,
    newMessageCount:
      status === "append"
        ? input.snapshotMessages.length - parsedHead.messages.length
        : 0,
    ...(status === "blocked-diverged"
      ? { estimatedDivergenceOrdinal: commonPrefixCount }
      : {}),
    suffixMessages:
      status === "append"
        ? input.snapshotMessages
            .slice(parsedHead.messages.length)
            .map((message) => ({ ...message }))
        : [],
    snapshotHashMatchesIncoming:
      metadata.snapshotHash === input.incomingSnapshotHash,
  };
}
