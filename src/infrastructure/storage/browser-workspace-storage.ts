import type { WorkspaceStorage } from "@/core/contracts/workspace-storage";
import type { Workspace } from "@/core/entities/workspace";

const WORKSPACES_KEY = "ai-learning-os.workspaces";

function normalizeWorkspace(workspace: Workspace): Workspace {
  return {
    ...workspace,
    description: workspace.description?.trim() || undefined,
    color: workspace.color?.trim() || undefined,
    archivedAt: workspace.archivedAt || undefined,
  };
}

export class BrowserWorkspaceStorage implements WorkspaceStorage {
  save(workspace: Workspace) {
    const workspaces = this.getAll();
    const existingIndex = workspaces.findIndex(
      (storedWorkspace) => storedWorkspace.id === workspace.id,
    );
    const normalizedWorkspace = normalizeWorkspace(workspace);

    if (existingIndex >= 0) {
      workspaces[existingIndex] = normalizedWorkspace;
    } else {
      workspaces.push(normalizedWorkspace);
    }

    window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
  }

  getAll() {
    const storedWorkspaces = window.localStorage.getItem(WORKSPACES_KEY);

    if (!storedWorkspaces) {
      return [];
    }

    return (JSON.parse(storedWorkspaces) as Workspace[])
      .map(normalizeWorkspace)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getById(id: string) {
    return this.getAll().find((workspace) => workspace.id === id) ?? null;
  }

  remove(id: string) {
    const workspaces = this.getAll().filter(
      (workspace) => workspace.id !== id,
    );
    window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
  }
}
