import type {
  AnyChatGPTShareSnapshotMetadata,
  ImportedSource,
} from "@/core/entities/imported-source";

export type ShareSnapshotSourceTimestamps = Readonly<{
  capturedAt: number;
  importedAt: number;
  updatedAt: number;
}>;

function requireNonFutureTimestamp(
  value: unknown,
  label: string,
  validationTime: number,
): number {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty timestamp.`);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  if (timestamp > validationTime) {
    throw new Error(`${label} cannot be in the future.`);
  }
  return timestamp;
}

// capturedAt is the content capture time; importedAt is the first PALOS import;
// updatedAt is the latest PALOS Source metadata update. They are distinct
// events, but every persisted Snapshot Source must preserve this chronology.
export function requireShareSnapshotTimestampSemantics(
  source: Readonly<ImportedSource>,
  metadata: AnyChatGPTShareSnapshotMetadata,
  validationTime: number,
): ShareSnapshotSourceTimestamps {
  const timestamps = {
    capturedAt: requireNonFutureTimestamp(
      metadata.capturedAt,
      `Snapshot Source ${source.id} capturedAt`,
      validationTime,
    ),
    importedAt: requireNonFutureTimestamp(
      source.importedAt,
      `Snapshot Source ${source.id} importedAt`,
      validationTime,
    ),
    updatedAt: requireNonFutureTimestamp(
      source.updatedAt,
      `Snapshot Source ${source.id} updatedAt`,
      validationTime,
    ),
  };
  if (timestamps.capturedAt > timestamps.importedAt) {
    throw new Error(
      `Snapshot Source ${source.id} capturedAt cannot be later than importedAt.`,
    );
  }
  if (timestamps.importedAt > timestamps.updatedAt) {
    throw new Error(
      `Snapshot Source ${source.id} importedAt cannot be later than updatedAt.`,
    );
  }
  return timestamps;
}
