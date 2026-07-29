import type { ShareSnapshotCanonicalWriteSuccess } from "@/core/contracts/share-snapshot-canonical-writer";

export type ShareSnapshotWorkflowResult =
  | Readonly<{
      status: "success";
      mode: "new" | "append";
      previewId: string;
      receipt: ShareSnapshotCanonicalWriteSuccess;
    }>
  | Readonly<{
      status: "noop";
      reason: "same";
      previewId: string;
    }>
  | Readonly<{
      status: "ambiguous" | "invalid" | "blocked";
      previewId: string;
      errors: readonly string[];
    }>
  | Readonly<{
      status: "stale";
      previewId: string;
      message: string;
    }>
  | Readonly<{
      status: "write-failed";
      previewId: string;
      message: string;
    }>;
