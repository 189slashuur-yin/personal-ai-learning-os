import type { SourceStorage } from "@/core/contracts/source-storage";
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

export function assertShareSnapshotTranscriptMutable(
  sources: SourceStorage,
  conversationId: string,
  operation: string,
): void {
  if (isShareSnapshotOwnedConversation(sources, conversationId)) {
    throw new ShareSnapshotMutationBlockedError(conversationId, operation);
  }
}
