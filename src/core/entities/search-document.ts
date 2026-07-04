export const searchDocumentEntityTypes = [
  "workspace",
  "conversation",
  "source",
  "message",
  "qa-pair",
  "proposal",
  "knowledge",
  "task",
  "tag",
] as const;

export type SearchDocumentEntityType =
  (typeof searchDocumentEntityTypes)[number];

export type SearchDocumentMetadataValue =
  | string
  | number
  | boolean
  | string[]
  | undefined;

export type SearchDocument = {
  id: string;
  entityType: SearchDocumentEntityType;
  entityId: string;
  workspaceId?: string;
  workspaceName?: string;
  title: string;
  body: string;
  snippets?: string[];
  sourceLabel?: string;
  sourcePath?: string;
  tags?: string[];
  updatedAt?: string;
  metadata?: Record<string, SearchDocumentMetadataValue>;
  href: string;
  fields: Record<string, string>;
};

export type SearchDocumentMatch = SearchDocument & {
  snippet: string;
  matchedFields: string[];
  matchMode: "exact" | "contains" | "fuzzy";
  score: number;
};

export type SearchDocumentFilters = {
  entityTypes?: SearchDocumentEntityType[];
  workspaceId?: string;
};
