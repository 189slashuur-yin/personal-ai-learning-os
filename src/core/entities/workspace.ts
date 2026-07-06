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
  // v1.3 reserved — Folder UI not yet implemented
  folderId?: string;
  parentFolderId?: string;
};
