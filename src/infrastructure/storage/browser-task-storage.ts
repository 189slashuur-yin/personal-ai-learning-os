import type { TaskStorage } from "@/core/contracts/task-storage";
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

const TASKS_KEY = "ai-learning-os.tasks";
const FALLBACK_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

function includesValue<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function normalizeStatus(value: unknown, record: Record<string, unknown>) {
  if (includesValue(taskStatuses, value)) {
    return value;
  }

  if (value === "completed" || optionalString(record.completedAt)) {
    return "completed";
  }

  if (optionalString(record.archivedAt)) {
    return "archived";
  }

  const dueDate = optionalString(record.dueDate ?? record.scheduledDate);
  return dueDate ? "upcoming" : "inbox";
}

function normalizeType(value: unknown): TaskType {
  if (includesValue(taskTypes, value)) {
    return value;
  }

  if (value === "knowledge_review") {
    return "review";
  }

  if (value === "action") {
    return "todo";
  }

  return "other";
}

function normalizePriority(value: unknown): TaskPriority {
  return includesValue(taskPriorities, value) ? value : "medium";
}

function normalizeSourceRef(value: unknown): SourceRef | undefined {
  if (!isRecord(value) || !includesValue(sourceRefTypes, value.type)) {
    return undefined;
  }

  return {
    type: value.type,
    entityId: optionalString(value.entityId ?? value.id),
    titleSnapshot:
      optionalString(value.titleSnapshot) ?? "Source snapshot unavailable",
    summarySnapshot: optionalString(value.summarySnapshot),
  };
}

function normalizeTask(value: unknown): Task | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = optionalString(value.id);
  const title = optionalString(value.title);

  if (!id || !title) {
    return null;
  }

  const createdAt =
    optionalString(value.createdAt) ??
    optionalString(value.updatedAt) ??
    FALLBACK_TIMESTAMP;
  const status = normalizeStatus(value.status, value) as TaskStatus;

  return {
    id,
    title,
    description: optionalString(value.description ?? value.notes),
    status,
    type: normalizeType(value.type),
    priority: normalizePriority(value.priority),
    workspaceId: optionalString(value.workspaceId) ?? DEFAULT_WORKSPACE_ID,
    sourceRef: normalizeSourceRef(value.sourceRef),
    dueDate: optionalString(value.dueDate ?? value.scheduledDate),
    createdAt,
    updatedAt: optionalString(value.updatedAt) ?? createdAt,
    completedAt:
      status === "completed" ? optionalString(value.completedAt) : undefined,
    archivedAt:
      status === "archived" ? optionalString(value.archivedAt) : undefined,
  };
}

function parseStoredTasks(storedTasks: string | null) {
  if (!storedTasks) {
    return [];
  }

  const parsed: unknown = JSON.parse(storedTasks);

  if (!Array.isArray(parsed)) {
    throw new Error("Stored Task data is not a collection.");
  }

  return parsed;
}

function normalizeCollection(values: unknown[], requireEveryTask: boolean) {
  const tasks = values.map(normalizeTask);

  if (requireEveryTask && tasks.some((task) => task === null)) {
    throw new Error("Stored Task data contains an invalid record.");
  }

  return tasks.filter((task): task is Task => task !== null);
}

export class BrowserTaskStorage implements TaskStorage {
  save(task: Task) {
    const tasks = normalizeCollection(
      parseStoredTasks(window.localStorage.getItem(TASKS_KEY)),
      true,
    );
    const existingIndex = tasks.findIndex(
      (storedTask) => storedTask.id === task.id,
    );
    const normalizedTask = normalizeTask(task);

    if (!normalizedTask) {
      throw new Error("Task is invalid and was not saved.");
    }

    if (existingIndex >= 0) {
      tasks[existingIndex] = normalizedTask;
    } else {
      tasks.push(normalizedTask);
    }

    window.localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  }

  getAll() {
    try {
      return normalizeCollection(
        parseStoredTasks(window.localStorage.getItem(TASKS_KEY)),
        false,
      ).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    } catch {
      return [];
    }
  }

  getById(id: string) {
    return this.getAll().find((task) => task.id === id) ?? null;
  }

  remove(id: string) {
    const tasks = normalizeCollection(
      parseStoredTasks(window.localStorage.getItem(TASKS_KEY)),
      true,
    ).filter((task) => task.id !== id);
    window.localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  }
}
