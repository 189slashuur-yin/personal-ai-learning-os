export const taskStatuses = [
  "inbox",
  "today",
  "upcoming",
  "completed",
  "archived",
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export const taskTypes = [
  "learning",
  "work",
  "reading",
  "review",
  "idea",
  "todo",
  "other",
] as const;

export type TaskType = (typeof taskTypes)[number];

export const taskPriorities = ["low", "medium", "high"] as const;

export type TaskPriority = (typeof taskPriorities)[number];

export const sourceRefTypes = [
  "conversation",
  "knowledge",
  "proposal",
  "message",
  "workspace",
  "manual",
] as const;

export type SourceRefType = (typeof sourceRefTypes)[number];

export type SourceRef = {
  type: SourceRefType;
  entityId?: string;
  titleSnapshot: string;
  summarySnapshot?: string;
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  type: TaskType;
  priority: TaskPriority;
  workspaceId?: string;
  sourceRef?: SourceRef;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archivedAt?: string;
};
