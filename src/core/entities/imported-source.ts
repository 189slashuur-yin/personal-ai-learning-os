export type LegacyChatGPTShareSnapshotMetadata = {
  schemaVersion: 1;
  shareId: string;
  normalizedShareUrl: string;
  snapshotHash: string;
  snapshotMessageCount: number;
  capturedAt: string;
  parserVersion: string;
  inputKind: "saved-html" | "pasted-text";
  hashAlgorithm: "sha256-json-role-content-v1";
};

export type ChatGPTShareSnapshotMetadata = {
  schemaVersion: 2;
  resourceHash: string;
  snapshotHash: string;
  snapshotMessageCount: number;
  capturedAt: string;
  parserVersion: string;
  inputKind: "saved-html" | "pasted-text";
  hashAlgorithm: "sha256-json-role-content-v1";
  previousSnapshotSourceId?: string;
  snapshotSequence: number;
};

export type AnyChatGPTShareSnapshotMetadata =
  | LegacyChatGPTShareSnapshotMetadata
  | ChatGPTShareSnapshotMetadata;

export type ImportedSource = {
  id: string;
  conversationId?: string;
  kind: "text";
  name: string;
  content: string;
  importedAt: string;
  updatedAt: string;
  shareSnapshot?: AnyChatGPTShareSnapshotMetadata;
};

export function isChatGPTShareSnapshotMetadata(
  metadata: AnyChatGPTShareSnapshotMetadata | undefined,
): metadata is ChatGPTShareSnapshotMetadata {
  return metadata?.schemaVersion === 2;
}

export function isLegacyChatGPTShareSnapshotMetadata(
  metadata: AnyChatGPTShareSnapshotMetadata | undefined,
): metadata is LegacyChatGPTShareSnapshotMetadata {
  return metadata?.schemaVersion === 1;
}
