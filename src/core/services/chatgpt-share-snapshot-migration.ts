import {
  isLegacyChatGPTShareSnapshotMetadata,
  type ImportedSource,
} from "@/core/entities/imported-source";
import { identifyChatGPTShareUrl } from "@/core/services/chatgpt-share-snapshot-url";

export type LegacyShareSnapshotMigrationResult =
  | Readonly<{
      status: "ready";
      source: ImportedSource;
    }>
  | Readonly<{
      status: "invalid";
      error: string;
    }>;

export async function migrateLegacyMutableShareSnapshotSource(
  source: Readonly<ImportedSource>,
): Promise<LegacyShareSnapshotMigrationResult> {
  const metadata = source.shareSnapshot;
  if (!isLegacyChatGPTShareSnapshotMetadata(metadata)) {
    return {
      status: "invalid",
      error: `Source ${source.id} is not a legacy Share Snapshot.`,
    };
  }

  try {
    const identity = await identifyChatGPTShareUrl(
      metadata.normalizedShareUrl,
    );
    return {
      status: "ready",
      source: {
        ...source,
        shareSnapshot: {
          schemaVersion: 2,
          resourceHash: identity.resourceHash,
          snapshotHash: metadata.snapshotHash,
          snapshotMessageCount: metadata.snapshotMessageCount,
          capturedAt: metadata.capturedAt,
          parserVersion: metadata.parserVersion,
          inputKind: metadata.inputKind,
          hashAlgorithm: metadata.hashAlgorithm,
          snapshotSequence: 1,
        },
      },
    };
  } catch {
    return {
      status: "invalid",
      error: `Source ${source.id} contains an invalid legacy Share URL.`,
    };
  }
}
