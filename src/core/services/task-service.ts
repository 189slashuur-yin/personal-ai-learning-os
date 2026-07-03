import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { TaskStorage } from "@/core/contracts/task-storage";
import type { WorkspaceStorage } from "@/core/contracts/workspace-storage";
import {
  sourceRefTypes,
  taskPriorities,
  taskStatuses,
  taskTypes,
  type SourceRef,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "@/core/entities/task";
import { DEFAULT_WORKSPACE_ID } from "@/core/entities/workspace";

export type CreateTaskInput = {
  title: string;
  description?: string;
  status?: TaskStatus;
  type?: TaskType;
  priority?: TaskPriority;
  workspaceId?: string;
  sourceRef?: SourceRef;
  dueDate?: string;
};

export type UpdateTaskInput = Partial<CreateTaskInput>;

export type TaskSourceStorages = {
  conversations: ConversationStorage;
  knowledgeCards: KnowledgeCardStorage;
  messages: MessageStorage;
  proposals: ProposalStorage;
  workspaces: WorkspaceStorage;
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dueDateKey(dueDate?: string) {
  if (!dueDate) {
    return undefined;
  }

  const dateOnlyMatch = /^(\d{4}-\d{2}-\d{2})/.exec(dueDate);
  return dateOnlyMatch?.[1];
}

export class TaskService {
  constructor(
    private readonly tasks: TaskStorage,
    private readonly workspaces: WorkspaceStorage,
  ) {}

  listTasks() {
    return this.tasks.getAll().map((task) => ({
      ...task,
      workspaceId: this.normalizeWorkspaceId(task.workspaceId),
    }));
  }

  createTask(input: CreateTaskInput) {
    const timestamp = new Date().toISOString();
    const dueDate = this.normalizeOptional(input.dueDate);
    const status = input.status ?? this.activeStatusForDueDate(dueDate);
    const task: Task = {
      id: crypto.randomUUID(),
      title: this.requireTitle(input.title),
      description: this.normalizeOptional(input.description),
      status: this.requireStatus(status),
      type: this.requireType(input.type ?? "todo"),
      priority: this.requirePriority(input.priority ?? "medium"),
      workspaceId: this.normalizeWorkspaceId(input.workspaceId),
      sourceRef: this.normalizeSourceRef(input.sourceRef),
      dueDate,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: status === "completed" ? timestamp : undefined,
      archivedAt: status === "archived" ? timestamp : undefined,
    };

    this.tasks.save(task);
    return task;
  }

  updateTask(id: string, input: UpdateTaskInput) {
    const task = this.tasks.getById(id);

    if (!task) {
      return null;
    }

    const dueDate =
      input.dueDate === undefined
        ? task.dueDate
        : this.normalizeOptional(input.dueDate);
    const requestedStatus =
      input.status ??
      (input.dueDate !== undefined &&
      task.status !== "completed" &&
      task.status !== "archived"
        ? this.activeStatusForDueDate(dueDate)
        : task.status);
    const status = this.requireStatus(requestedStatus);
    const timestamp = new Date().toISOString();
    const updatedTask: Task = {
      ...task,
      title:
        input.title === undefined ? task.title : this.requireTitle(input.title),
      description:
        input.description === undefined
          ? task.description
          : this.normalizeOptional(input.description),
      status,
      type:
        input.type === undefined ? task.type : this.requireType(input.type),
      priority:
        input.priority === undefined
          ? task.priority
          : this.requirePriority(input.priority),
      workspaceId:
        input.workspaceId === undefined
          ? this.normalizeWorkspaceId(task.workspaceId)
          : this.normalizeWorkspaceId(input.workspaceId),
      sourceRef:
        input.sourceRef === undefined
          ? task.sourceRef
          : this.normalizeSourceRef(input.sourceRef),
      dueDate,
      updatedAt: timestamp,
      completedAt:
        status === "completed" ? task.completedAt ?? timestamp : undefined,
      archivedAt:
        status === "archived" ? task.archivedAt ?? timestamp : undefined,
    };

    this.tasks.save(updatedTask);
    return updatedTask;
  }

  completeTask(id: string) {
    return this.updateTask(id, { status: "completed" });
  }

  reopenTask(id: string) {
    const task = this.tasks.getById(id);
    return task
      ? this.updateTask(id, {
          status: this.activeStatusForDueDate(task.dueDate),
        })
      : null;
  }

  archiveTask(id: string) {
    return this.updateTask(id, { status: "archived" });
  }

  restoreTask(id: string) {
    const task = this.tasks.getById(id);

    if (!task) {
      return null;
    }

    return this.updateTask(id, {
      status: task.completedAt
        ? "completed"
        : this.activeStatusForDueDate(task.dueDate),
    });
  }

  deleteTask(id: string) {
    if (!this.tasks.getById(id)) {
      return false;
    }

    this.tasks.remove(id);
    return true;
  }

  listByWorkspace(workspaceId: string) {
    const normalizedWorkspaceId = this.normalizeWorkspaceId(workspaceId);
    return this.listTasks().filter(
      (task) => task.workspaceId === normalizedWorkspaceId,
    );
  }

  listByStatus(status: TaskStatus) {
    const validStatus = this.requireStatus(status);
    return this.listTasks().filter((task) => task.status === validStatus);
  }

  listToday(referenceDate = new Date()) {
    const today = localDateKey(referenceDate);
    return this.listTasks().filter((task) => {
      if (task.status === "completed" || task.status === "archived") {
        return false;
      }

      const due = dueDateKey(task.dueDate);
      return task.status === "today" || (due !== undefined && due <= today);
    });
  }

  listUpcoming(referenceDate = new Date()) {
    const today = localDateKey(referenceDate);
    return this.listTasks()
      .filter((task) => {
        if (task.status === "completed" || task.status === "archived") {
          return false;
        }

        const due = dueDateKey(task.dueDate);
        return due ? due > today : task.status === "upcoming";
      })
      .sort((left, right) =>
        (dueDateKey(left.dueDate) ?? "").localeCompare(
          dueDateKey(right.dueDate) ?? "",
        ),
      );
  }

  isSourceMissing(task: Task, storages: TaskSourceStorages) {
    const sourceRef = task.sourceRef;

    if (!sourceRef || sourceRef.type === "manual") {
      return false;
    }

    if (!sourceRef.entityId) {
      return true;
    }

    switch (sourceRef.type) {
      case "conversation":
        return !storages.conversations.getById(sourceRef.entityId);
      case "knowledge":
        return !storages.knowledgeCards.getById(sourceRef.entityId);
      case "proposal":
        return !storages.proposals.getById(sourceRef.entityId);
      case "message":
        return !storages.messages
          .getAll()
          .some((message) => message.id === sourceRef.entityId);
      case "workspace":
        return !storages.workspaces.getById(sourceRef.entityId);
    }
  }

  private activeStatusForDueDate(dueDate?: string): TaskStatus {
    const due = dueDateKey(dueDate);

    if (!due) {
      return "inbox";
    }

    return due <= localDateKey(new Date()) ? "today" : "upcoming";
  }

  private normalizeWorkspaceId(workspaceId?: string) {
    const normalizedId = this.normalizeOptional(workspaceId);
    return normalizedId && this.workspaces.getById(normalizedId)
      ? normalizedId
      : DEFAULT_WORKSPACE_ID;
  }

  private normalizeSourceRef(sourceRef?: SourceRef) {
    if (!sourceRef) {
      return undefined;
    }

    if (!sourceRefTypes.includes(sourceRef.type)) {
      throw new Error("Task source type is invalid.");
    }

    const titleSnapshot = sourceRef.titleSnapshot.trim();

    if (!titleSnapshot) {
      throw new Error("Task source title snapshot is required.");
    }

    return {
      type: sourceRef.type,
      entityId: this.normalizeOptional(sourceRef.entityId),
      titleSnapshot,
      summarySnapshot: this.normalizeOptional(sourceRef.summarySnapshot),
    };
  }

  private requireTitle(title: string) {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      throw new Error("Task title is required.");
    }

    return normalizedTitle;
  }

  private requireStatus(status: TaskStatus) {
    if (!taskStatuses.includes(status)) {
      throw new Error("Task status is invalid.");
    }

    return status;
  }

  private requireType(type: TaskType) {
    if (!taskTypes.includes(type)) {
      throw new Error("Task type is invalid.");
    }

    return type;
  }

  private requirePriority(priority: TaskPriority) {
    if (!taskPriorities.includes(priority)) {
      throw new Error("Task priority is invalid.");
    }

    return priority;
  }

  private normalizeOptional(value?: string) {
    return value?.trim() || undefined;
  }
}
