import type { SearchEntityType } from "@/core/entities/search-filter";

export type SearchResult = {
  id: string;
  type: SearchEntityType;
  title: string;
  excerpt: string;
  matchedFields: string[];
  workspaceName?: string;
  tags?: string[];
  providerName?: string;
  updatedAt?: string;
  href: string;
};
