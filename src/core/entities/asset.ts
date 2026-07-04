export const assetEntityTypes = [
  "conversation",
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
  createdAt: string;
  updatedAt: string;
};

