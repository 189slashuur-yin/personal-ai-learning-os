import type { Workspace } from "@/core/entities/workspace";

export interface WorkspaceStorage {
  save(workspace: Workspace): void;
  getAll(): Workspace[];
  getById(id: string): Workspace | null;
  remove(id: string): void;
}
