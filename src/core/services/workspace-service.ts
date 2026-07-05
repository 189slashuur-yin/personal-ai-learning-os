import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { TaskStorage } from "@/core/contracts/task-storage";
import type { WorkspaceStorage } from "@/core/contracts/workspace-storage";
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  type Workspace,
} from "@/core/entities/workspace";

export type CreateWorkspaceInput = {
  name: string;
  parentId?: string;
  type?: Workspace["type"];
  description?: string;
  color?: string;
};

export type UpdateWorkspaceInput = Partial<CreateWorkspaceInput> & {
  collapsed?: boolean;
};

export class WorkspaceService {
  constructor(
    private readonly workspaces: WorkspaceStorage,
    private readonly conversations: ConversationStorage,
    private readonly tasks?: TaskStorage,
  ) {}

  listWorkspaces() {
    this.ensureDefaultWorkspace();
    return this.workspaces.getAll();
  }

  createWorkspace(input: CreateWorkspaceInput) {
    const name = this.requireName(input.name);
    const parent = input.parentId ? this.workspaces.getById(input.parentId) : null;
    if (input.parentId && !parent) throw new Error("Parent folder does not exist.");
    const timestamp = new Date().toISOString();
    const siblings = this.workspaces.getAll().filter(
      (workspace) => workspace.parentId === input.parentId,
    );
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name,
      parentId: input.parentId,
      order: siblings.length + 1,
      type: input.type ?? (input.parentId ? "folder" : "workspace"),
      collapsed: false,
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
      collapsed: input.collapsed ?? workspace.collapsed,
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

  moveWorkspace(id: string, parentId?: string) {
    const workspace = this.workspaces.getById(id);
    if (!workspace || id === DEFAULT_WORKSPACE_ID || id === parentId) return null;
    if (parentId && !this.workspaces.getById(parentId)) return null;
    const descendants = new Set(this.getDescendantIds(id));
    if (parentId && descendants.has(parentId)) return null;
    const siblings = this.workspaces.getAll().filter(
      (item) => item.id !== id && item.parentId === parentId,
    );
    const moved = {
      ...workspace,
      parentId,
      order: siblings.length + 1,
      updatedAt: new Date().toISOString(),
    };
    this.workspaces.save(moved);
    this.normalizeSiblingOrder(workspace.parentId);
    return moved;
  }

  reorderWorkspace(id: string, direction: "up" | "down") {
    const workspace = this.workspaces.getById(id);
    if (!workspace) return null;
    const siblings = this.workspaces.getAll()
      .filter((item) => item.parentId === workspace.parentId)
      .sort((left, right) => left.order - right.order);
    const index = siblings.findIndex((item) => item.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return workspace;
    [siblings[index], siblings[targetIndex]] = [siblings[targetIndex], siblings[index]];
    const timestamp = new Date().toISOString();
    siblings.forEach((item, itemIndex) => this.workspaces.save({
      ...item,
      order: itemIndex + 1,
      updatedAt: timestamp,
    }));
    return this.workspaces.getById(id);
  }

  moveConversation(conversationId: string, workspaceId: string) {
    const conversation = this.conversations.getById(conversationId);
    if (!conversation || !this.workspaces.getById(workspaceId)) return null;
    const moved = { ...conversation, workspaceId, updatedAt: new Date().toISOString() };
    this.conversations.save(moved);
    return moved;
  }

  deleteWorkspace(id: string) {
    const deletedWorkspace = this.workspaces.getById(id);
    if (id === DEFAULT_WORKSPACE_ID || !deletedWorkspace) {
      return false;
    }

    if (!this.tasks) {
      throw new Error("Task storage is required to delete a Workspace safely.");
    }

    const taskStorage = this.tasks;

    const timestamp = new Date().toISOString();
    const fallbackId = this.workspaces.getById(deletedWorkspace.parentId ?? "")
      ? deletedWorkspace.parentId ?? DEFAULT_WORKSPACE_ID
      : DEFAULT_WORKSPACE_ID;
    this.conversations.getAll().forEach((conversation) => {
      if (conversation.workspaceId === id) {
        this.conversations.save({
          ...conversation,
          workspaceId: fallbackId,
          updatedAt: timestamp,
        });
      }
    });
    taskStorage.getAll().forEach((task) => {
      if (task.workspaceId === id) {
        taskStorage.save({
          ...task,
          workspaceId: DEFAULT_WORKSPACE_ID,
          updatedAt: timestamp,
        });
      }
    });
    this.workspaces.getAll().forEach((workspace) => {
      if (workspace.parentId === id) {
        this.workspaces.save({
          ...workspace,
          parentId: fallbackId === DEFAULT_WORKSPACE_ID ? undefined : fallbackId,
          updatedAt: timestamp,
        });
      }
    });
    this.workspaces.remove(id);
    this.normalizeSiblingOrder(deletedWorkspace.parentId);
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
      order: 0,
      type: "workspace",
      collapsed: false,
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

  private getDescendantIds(id: string) {
    const all = this.workspaces.getAll();
    const descendants: string[] = [];
    const visit = (parentId: string) => {
      all.filter((item) => item.parentId === parentId).forEach((item) => {
        descendants.push(item.id);
        visit(item.id);
      });
    };
    visit(id);
    return descendants;
  }

  private normalizeSiblingOrder(parentId?: string) {
    const timestamp = new Date().toISOString();
    this.workspaces.getAll()
      .filter((workspace) => workspace.parentId === parentId)
      .sort((left, right) => left.order - right.order)
      .forEach((workspace, index) => {
        if (workspace.order !== index + 1 && workspace.id !== DEFAULT_WORKSPACE_ID) {
          this.workspaces.save({ ...workspace, order: index + 1, updatedAt: timestamp });
        }
      });
  }
}
