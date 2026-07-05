export const DEFAULT_WORKSPACE_ID = "inbox";
export const DEFAULT_WORKSPACE_NAME = "Inbox";

export type Workspace = {
  id: string;
  name: string;
  parentId?: string;
  order: number;
  type: "workspace" | "folder";
  collapsed?: boolean;
  description?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};
