import type { AssetStorage } from "@/core/contracts/asset-storage";
import type { Asset, AssetEntityType } from "@/core/entities/asset";

export type CreateAssetMetadataInput = {
  entityType: AssetEntityType;
  entityId: string;
  filename: string;
  localPath?: string;
  relativePath?: string;
  note?: string;
  mimeType?: string;
  size?: number;
  hash?: string;
};

export class AssetService {
  constructor(private readonly storage: AssetStorage) {}

  listForEntity(entityType: AssetEntityType, entityId: string): Asset[] {
    return this.storage.getByEntity(entityType, entityId);
  }

  addMetadata(input: CreateAssetMetadataInput): Asset {
    const filename = input.filename.trim();
    if (!filename) throw new Error("文件名不能为空。");
    if (!input.entityId.trim()) throw new Error("Asset 必须关联有效实体。");

    const timestamp = new Date().toISOString();
    const asset: Asset = {
      id: `asset-${crypto.randomUUID()}`,
      entityType: input.entityType,
      entityId: input.entityId,
      filename,
      originalName: filename,
      localPath: input.localPath?.trim() || undefined,
      relativePath: input.relativePath?.trim() || undefined,
      note: input.note?.trim() || undefined,
      mimeType: input.mimeType?.trim() || undefined,
      size: input.size,
      hash: input.hash?.trim() || undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.storage.save(asset);
    return asset;
  }

  removeMetadata(id: string): void {
    this.storage.remove(id);
  }
}

