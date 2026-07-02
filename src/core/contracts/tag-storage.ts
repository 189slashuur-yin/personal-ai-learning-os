import type { Tag } from "@/core/entities/tag";

export interface TagStorage {
  save(tag: Tag): void;
  getAll(): Tag[];
  getById(id: string): Tag | null;
  remove(id: string): void;
}
