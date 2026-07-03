import type { SearchEntityType } from "@/core/entities/search-filter";
import type {
  SourceRef,
  TaskPriority,
  TaskStatus,
  TaskType,
} from "@/core/entities/task";

export type SearchResult = {
  id: string;
  type: SearchEntityType;
  title: string;
  excerpt: string;
  matchedFields: string[];
  workspaceName?: string;
  tags?: string[];
  providerName?: string;
  taskStatus?: TaskStatus;
  taskPriority?: TaskPriority;
  taskType?: TaskType;
  dueDate?: string;
  sourceRef?: SourceRef;
  updatedAt?: string;
  href: string;
};
