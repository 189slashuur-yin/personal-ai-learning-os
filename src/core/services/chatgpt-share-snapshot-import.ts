import type { ChatGPTShareSnapshotMetadata } from "@/core/entities/imported-source";
import type {
  ParsedMessageDraft,
  ParsedRoundDraft,
} from "@/core/entities/import-parser";
import type { ChatGPTShareIdentity } from "@/core/services/chatgpt-share-snapshot-url";
import type {
  ChatGPTShareSnapshotComparison,
  ChatGPTShareSnapshotComparisonStatus,
} from "@/core/services/chatgpt-share-snapshot-comparator";
import {
  CHATGPT_SHARE_SNAPSHOT_HASH_ALGORITHM,
  hashChatGPTShareSnapshot,
} from "@/core/services/chatgpt-share-snapshot-comparator";
import {
  CHATGPT_SHARE_SNAPSHOT_PARSER_VERSION,
  type ChatGPTShareSnapshotInputKind,
  type ChatGPTShareSnapshotMessageDraft,
  type ChatGPTShareSnapshotParseResult,
} from "@/core/services/chatgpt-share-snapshot-parser";
import type { ChatGPTShareSnapshotDeltaBlockedReason } from "@/core/services/chatgpt-share-snapshot-delta-projector";
import { deriveRoundDrafts } from "@/core/services/import-parser-pipeline";

export type ChatGPTShareSnapshotPlanKind =
  | "new"
  | "same"
  | "append"
  | "blocked";

export type ChatGPTShareSnapshotImportPlan = {
  kind: ChatGPTShareSnapshotPlanKind;
  comparisonStatus?: ChatGPTShareSnapshotComparisonStatus;
  messagesToWrite: ChatGPTShareSnapshotMessageDraft[];
  roundsToWrite: ParsedRoundDraft[];
  importedMessageCount: number;
  importedRoundCount: number;
  blockedReason?: "diverged" | "shorter" | "projection-diverged";
  deltaProjectionBlockedReason?: ChatGPTShareSnapshotDeltaBlockedReason;
};

function cloneMessages(
  messages: readonly ChatGPTShareSnapshotMessageDraft[],
): ChatGPTShareSnapshotMessageDraft[] {
  return messages.map((message) => ({ ...message }));
}

function deriveRounds(
  messages: readonly ChatGPTShareSnapshotMessageDraft[],
): ParsedRoundDraft[] {
  const drafts: ParsedMessageDraft[] = messages.map(({ role, content }) => ({
    role,
    content,
  }));
  return deriveRoundDrafts(drafts).map((round) => ({
    ...round,
    messageIndexes: [...round.messageIndexes],
  }));
}

export function buildNewChatGPTShareSnapshotImportPlan(
  parsed: ChatGPTShareSnapshotParseResult,
): ChatGPTShareSnapshotImportPlan {
  if (parsed.errors.length > 0 || parsed.messages.length === 0) {
    throw new Error("Share Snapshot parser result cannot be imported.");
  }
  const messagesToWrite = cloneMessages(parsed.messages);
  const roundsToWrite = deriveRounds(messagesToWrite);
  return {
    kind: "new",
    messagesToWrite,
    roundsToWrite,
    importedMessageCount: messagesToWrite.length,
    importedRoundCount: roundsToWrite.length,
  };
}

export function buildExistingChatGPTShareSnapshotImportPlan(
  comparison: ChatGPTShareSnapshotComparison,
): ChatGPTShareSnapshotImportPlan {
  if (comparison.status === "same") {
    return {
      kind: "same",
      comparisonStatus: "same",
      messagesToWrite: [],
      roundsToWrite: [],
      importedMessageCount: 0,
      importedRoundCount: 0,
    };
  }
  if (
    comparison.status === "blocked-diverged" ||
    comparison.status === "blocked-shorter" ||
    comparison.status === "blocked-projection-diverged"
  ) {
    const blockedReason =
      comparison.status === "blocked-diverged"
        ? "diverged"
        : comparison.status === "blocked-shorter"
          ? "shorter"
          : "projection-diverged";
    return {
      kind: "blocked",
      comparisonStatus: comparison.status,
      messagesToWrite: [],
      roundsToWrite: [],
      importedMessageCount: 0,
      importedRoundCount: 0,
      blockedReason,
    };
  }
  if (comparison.status === "invalid") {
    throw new Error(
      comparison.invalidReason ?? "Share Snapshot comparison is invalid.",
    );
  }

  const messagesToWrite = cloneMessages(comparison.suffixMessages);
  const roundsToWrite = deriveRounds(messagesToWrite);
  return {
    kind: "append",
    comparisonStatus: "append",
    messagesToWrite,
    roundsToWrite,
    importedMessageCount: messagesToWrite.length,
    importedRoundCount: roundsToWrite.length,
  };
}

export async function buildChatGPTShareSnapshotMetadata(input: {
  identity: ChatGPTShareIdentity;
  messages: readonly ChatGPTShareSnapshotMessageDraft[];
  capturedAt: string;
  inputKind: ChatGPTShareSnapshotInputKind;
  parserVersion?: string;
  previousSnapshotSourceId?: string;
  snapshotSequence: number;
}): Promise<ChatGPTShareSnapshotMetadata> {
  return {
    schemaVersion: 2,
    resourceHash: input.identity.resourceHash,
    snapshotHash: await hashChatGPTShareSnapshot(input.messages),
    snapshotMessageCount: input.messages.length,
    capturedAt: input.capturedAt,
    parserVersion:
      input.parserVersion ?? CHATGPT_SHARE_SNAPSHOT_PARSER_VERSION,
    inputKind: input.inputKind,
    hashAlgorithm: CHATGPT_SHARE_SNAPSHOT_HASH_ALGORITHM,
    previousSnapshotSourceId: input.previousSnapshotSourceId,
    snapshotSequence: input.snapshotSequence,
  };
}

export function renderChatGPTShareSnapshotTranscript(
  messages: readonly ChatGPTShareSnapshotMessageDraft[],
): string {
  return messages
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}:\n${message.content}`,
    )
    .join("\n\n");
}
