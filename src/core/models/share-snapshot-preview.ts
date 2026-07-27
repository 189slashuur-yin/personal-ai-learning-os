import type { Conversation } from "@/core/entities/conversation";
import type { ChatGPTShareSnapshotInput } from "@/core/services/chatgpt-share-snapshot-parser";

export type ShareSnapshotWorkflowStatus =
  | "new"
  | "append"
  | "same"
  | "ambiguous"
  | "invalid"
  | "blocked";

export type ShareSnapshotCaptureRequest = Readonly<{
  shareUrl: string;
  snapshot: ChatGPTShareSnapshotInput;
  newConversation: Readonly<Conversation>;
}>;

export type ShareSnapshotResolvedTarget = Readonly<{
  kind: "new" | "existing";
  conversationId: string;
  conversationTitle: string;
  sourceId?: string;
}>;

export type ShareSnapshotPreviewSummary = Readonly<{
  existingMessageCount: number;
  snapshotMessageCount: number;
  newMessageCount: number;
  existingRoundCount: number;
  newRoundCount: number;
}>;

export type ShareSnapshotPreview = Readonly<{
  previewId: string;
  resourceFingerprint?: string;
  status: ShareSnapshotWorkflowStatus;
  target?: ShareSnapshotResolvedTarget;
  summary: ShareSnapshotPreviewSummary;
  baselineFingerprint?: string;
  confirmable: boolean;
  warnings: readonly string[];
  errors: readonly string[];
}>;

export type ShareSnapshotPreviewConfirmation = Readonly<{
  previewId: string;
  baselineFingerprint: string;
}>;
