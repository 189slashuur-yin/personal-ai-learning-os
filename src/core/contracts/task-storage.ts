import type { Task } from "@/core/entities/task";

export interface TaskStorage {
  save(task: Task): void;
  getAll(): Task[];
  getById(id: string): Task | null;
  remove(id: string): void;
}
