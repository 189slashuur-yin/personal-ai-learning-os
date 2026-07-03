export const searchEntityTypes = [
  "conversation",
  "proposal",
  "knowledge",
  "tag",
  "workspace",
] as const;

export type SearchEntityType = (typeof searchEntityTypes)[number];

export type SearchDateRange = {
  from?: string;
  to?: string;
};

export type SearchFilter = {
  query: string;
  entityTypes: SearchEntityType[];
  workspaceId?: string;
  tagId?: string;
  providerId?: string;
  status?: string;
  dateRange?: SearchDateRange;
};
