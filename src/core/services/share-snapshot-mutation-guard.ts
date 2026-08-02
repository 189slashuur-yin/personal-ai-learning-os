import type { SourceStorage } from "@/core/contracts/source-storage";
import type { ConversationTranscriptMutationCommand } from "@/core/contracts/conversation-transcript-mutation-writer";
import type { ImportedSource } from "@/core/entities/imported-source";
import {
  isChatGPTShareSnapshotMetadata,
  isLegacyChatGPTShareSnapshotMetadata,
} from "@/core/entities/imported-source";

export class ShareSnapshotMutationBlockedError extends Error {
  constructor(
    readonly conversationId: string,
    readonly operation: string,
  ) {
    super(
      `Cannot ${operation}: this Conversation is owned by an immutable share Snapshot. Use the canonical Snapshot writer.`,
    );
    this.name = "ShareSnapshotMutationBlockedError";
  }
}

export function isShareSnapshotOwnedConversation(
  sources: SourceStorage,
  conversationId: string,
): boolean {
  return sources.getAll().some(
    (source) =>
      source.conversationId === conversationId &&
      (isChatGPTShareSnapshotMetadata(source.shareSnapshot) ||
        isLegacyChatGPTShareSnapshotMetadata(source.shareSnapshot)),
  );
}

export function isShareSnapshotOwnedConversationInSources(
  sources: readonly Readonly<ImportedSource>[],
  conversationId: string,
): boolean {
  return sources.some(
    (source) =>
      source.conversationId === conversationId &&
      (isChatGPTShareSnapshotMetadata(source.shareSnapshot) ||
        isLegacyChatGPTShareSnapshotMetadata(source.shareSnapshot)),
  );
}

export function assertShareSnapshotTranscriptMutableInSources(
  sources: readonly Readonly<ImportedSource>[],
  conversationId: string,
  operation: string,
): void {
  if (isShareSnapshotOwnedConversationInSources(sources, conversationId)) {
    throw new ShareSnapshotMutationBlockedError(conversationId, operation);
  }
}

export function assertShareSnapshotTranscriptMutable(
  sources: SourceStorage,
  conversationId: string,
  operation: string,
): void {
  assertShareSnapshotTranscriptMutableInSources(
    sources.getAll(),
    conversationId,
    operation,
  );
}

export function executeShareSnapshotTranscriptMutation(
  sources: SourceStorage,
  command: ConversationTranscriptMutationCommand,
  fallback: () => void | Promise<void>,
): void | Promise<void> {
  for (const conversationId of new Set(command.conversationIds)) {
    assertShareSnapshotTranscriptMutable(
      sources,
      conversationId,
      command.operation,
    );
  }

  if (sources.executeAuthoritativeTranscriptMutation) {
    return sources.executeAuthoritativeTranscriptMutation(command);
  }

  return fallback();
}
