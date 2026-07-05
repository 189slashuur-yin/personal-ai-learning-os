export const assetEntityTypes = [
  "conversation",
  "round",
  "knowledge",
  "task",
  "workspace",
] as const;

export type AssetEntityType = (typeof assetEntityTypes)[number];

export type Asset = {
  id: string;
  entityType: AssetEntityType;
  entityId: string;
  filename: string;
  originalName: string;
  mimeType?: string;
  size?: number;
  hash?: string;
  localPath?: string;
  relativePath?: string;
  note?: string;
  status?: "ok" | "missing" | "unknown";
  createdAt: string;
  updatedAt: string;
};
