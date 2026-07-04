import type { AssetStorage } from "@/core/contracts/asset-storage";
import {
  assetEntityTypes,
  type Asset,
  type AssetEntityType,
} from "@/core/entities/asset";

const ASSETS_KEY = "ai-learning-os.assets";

export class BrowserAssetStorage implements AssetStorage {
  save(asset: Asset): void {
    const assets = this.getAll();
    const index = assets.findIndex((item) => item.id === asset.id);
    if (index >= 0) assets[index] = asset;
    else assets.push(asset);
    this.write(assets);
  }

  getAll(): Asset[] {
    const stored = window.localStorage.getItem(ASSETS_KEY);
    if (!stored) return [];

    return (JSON.parse(stored) as Asset[])
      .filter(
        (asset) =>
          typeof asset.id === "string" &&
          typeof asset.entityId === "string" &&
          assetEntityTypes.includes(asset.entityType),
      )
      .map((asset) => ({
        ...asset,
        originalName: asset.originalName || asset.filename,
        updatedAt: asset.updatedAt ?? asset.createdAt,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getById(id: string): Asset | null {
    return this.getAll().find((asset) => asset.id === id) ?? null;
  }

  getByEntity(entityType: AssetEntityType, entityId: string): Asset[] {
    return this.getAll().filter(
      (asset) => asset.entityType === entityType && asset.entityId === entityId,
    );
  }

  remove(id: string): void {
    this.write(this.getAll().filter((asset) => asset.id !== id));
  }

  private write(assets: Asset[]): void {
    window.localStorage.setItem(ASSETS_KEY, JSON.stringify(assets));
  }
}

