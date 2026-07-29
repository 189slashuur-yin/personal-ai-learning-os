import type { ShareSnapshotBaseline } from "@/core/models/share-snapshot-baseline";
import type { ChatGPTShareSnapshotCanonicalPlan } from "@/core/services/chatgpt-share-snapshot-service";

export type ShareSnapshotCanonicalWriteSuccess = Readonly<{
  status: "written";
  conversationId: string;
  sourceId: string;
  writtenMessageCount: number;
  writtenRoundCount: number;
  verifiedMessageCount: number;
  verifiedRoundCount: number;
  pendingWriteCount: 0;
}>;

export type ShareSnapshotCanonicalWriteStale = Readonly<{
  status: "stale";
  expectedFingerprint: string;
  actualFingerprint: string;
}>;

export type ShareSnapshotCanonicalWriteReceipt =
  | ShareSnapshotCanonicalWriteSuccess
  | ShareSnapshotCanonicalWriteStale;

export type ShareSnapshotCanonicalWriteCommand = Readonly<{
  plan: ChatGPTShareSnapshotCanonicalPlan;
  expectedBaseline: ShareSnapshotBaseline;
}>;

export interface ShareSnapshotCanonicalWriter {
  execute(
    command: ShareSnapshotCanonicalWriteCommand,
  ): Promise<ShareSnapshotCanonicalWriteReceipt>;
}
