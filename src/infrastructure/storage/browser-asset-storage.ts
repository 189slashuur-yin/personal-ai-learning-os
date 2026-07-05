import type { AssetStorage } from "@/core/contracts/asset-storage";
import {
  assetEntityTypes,
  type Asset,
  type AssetEntityType,
} from "@/core/entities/asset";

const ASSETS_KEY = "ai-learning-os.assets";

function normalizeAsset(value: unknown): Asset | null {
  if (!value || typeof value !== "object") return null;

  const asset = value as Partial<Asset>;
  if (
    typeof asset.id !== "string" ||
    typeof asset.entityId !== "string" ||
    typeof asset.filename !== "string" ||
    typeof asset.entityType !== "string" ||
    !assetEntityTypes.includes(asset.entityType as AssetEntityType)
  ) {
    return null;
  }

  const createdAt =
    typeof asset.createdAt === "string" ? asset.createdAt : "";

  return {
    ...asset,
    id: asset.id,
    entityType: asset.entityType as AssetEntityType,
    entityId: asset.entityId,
    filename: asset.filename,
    originalName:
      typeof asset.originalName === "string" && asset.originalName
        ? asset.originalName
        : asset.filename,
    status: asset.status === "ok" || asset.status === "missing" ? asset.status : "unknown",
    createdAt,
    updatedAt:
      typeof asset.updatedAt === "string" ? asset.updatedAt : createdAt,
  };
}

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

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeAsset)
      .filter((asset): asset is Asset => asset !== null)
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
