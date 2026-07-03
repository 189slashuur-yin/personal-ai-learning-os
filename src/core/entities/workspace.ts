export const DEFAULT_WORKSPACE_ID = "inbox";
export const DEFAULT_WORKSPACE_NAME = "Inbox";

export type Workspace = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};
