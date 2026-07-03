import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { WorkspaceStorage } from "@/core/contracts/workspace-storage";
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  type Workspace,
} from "@/core/entities/workspace";

export type CreateWorkspaceInput = {
  name: string;
  description?: string;
  color?: string;
};

export type UpdateWorkspaceInput = Partial<CreateWorkspaceInput>;

export class WorkspaceService {
  constructor(
    private readonly workspaces: WorkspaceStorage,
    private readonly conversations: ConversationStorage,
  ) {}

  listWorkspaces() {
    this.ensureDefaultWorkspace();
    return this.workspaces.getAll();
  }

  createWorkspace(input: CreateWorkspaceInput) {
    const name = this.requireName(input.name);
    const timestamp = new Date().toISOString();
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name,
      description: this.normalizeOptional(input.description),
      color: this.normalizeOptional(input.color),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.workspaces.save(workspace);
    return workspace;
  }

  updateWorkspace(id: string, input: UpdateWorkspaceInput) {
    const workspace = this.workspaces.getById(id);

    if (!workspace) {
      return null;
    }

    const updatedWorkspace: Workspace = {
      ...workspace,
      name:
        input.name === undefined ? workspace.name : this.requireName(input.name),
      description:
        input.description === undefined
          ? workspace.description
          : this.normalizeOptional(input.description),
      color:
        input.color === undefined
          ? workspace.color
          : this.normalizeOptional(input.color),
      updatedAt: new Date().toISOString(),
    };

    this.workspaces.save(updatedWorkspace);
    return updatedWorkspace;
  }

  archiveWorkspace(id: string) {
    if (id === DEFAULT_WORKSPACE_ID) {
      return null;
    }

    const workspace = this.workspaces.getById(id);

    if (!workspace) {
      return null;
    }

    const timestamp = new Date().toISOString();
    const archivedWorkspace = {
      ...workspace,
      archivedAt: timestamp,
      updatedAt: timestamp,
    };
    this.workspaces.save(archivedWorkspace);
    return archivedWorkspace;
  }

  restoreWorkspace(id: string) {
    const workspace = this.workspaces.getById(id);

    if (!workspace) {
      return null;
    }

    const restoredWorkspace = {
      ...workspace,
      archivedAt: undefined,
      updatedAt: new Date().toISOString(),
    };
    this.workspaces.save(restoredWorkspace);
    return restoredWorkspace;
  }

  deleteWorkspace(id: string) {
    if (id === DEFAULT_WORKSPACE_ID || !this.workspaces.getById(id)) {
      return false;
    }

    const timestamp = new Date().toISOString();
    this.conversations.getAll().forEach((conversation) => {
      if (conversation.workspaceId === id) {
        this.conversations.save({
          ...conversation,
          workspaceId: DEFAULT_WORKSPACE_ID,
          updatedAt: timestamp,
        });
      }
    });
    this.workspaces.remove(id);
    return true;
  }

  getDefaultWorkspace() {
    return this.ensureDefaultWorkspace();
  }

  ensureDefaultWorkspace() {
    const existingWorkspace = this.workspaces.getById(DEFAULT_WORKSPACE_ID);

    if (existingWorkspace) {
      return existingWorkspace;
    }

    const timestamp = new Date().toISOString();
    const defaultWorkspace: Workspace = {
      id: DEFAULT_WORKSPACE_ID,
      name: DEFAULT_WORKSPACE_NAME,
      description: "未分类与旧 Conversation 的默认归属。",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.workspaces.save(defaultWorkspace);
    return defaultWorkspace;
  }

  private requireName(name: string) {
    const normalizedName = name.trim();

    if (!normalizedName) {
      throw new Error("Workspace name is required.");
    }

    return normalizedName;
  }

  private normalizeOptional(value?: string) {
    return value?.trim() || undefined;
  }
}
