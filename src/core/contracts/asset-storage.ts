import type { Asset, AssetEntityType } from "@/core/entities/asset";

export interface AssetStorage {
  save(asset: Asset): void;
  getAll(): Asset[];
  getById(id: string): Asset | null;
  getByEntity(entityType: AssetEntityType, entityId: string): Asset[];
  remove(id: string): void;
}

