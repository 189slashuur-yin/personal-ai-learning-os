/** Frozen, ordered Conversation selection. A deleted card does not invalidate it. */
export type KnowledgeContextRef = {
  knowledgeCardId: string;
  titleSnapshot: string;
  contentSnapshot: string;
  knowledgeUpdatedAtSnapshot: string;
  order: number;
  originalContentLength: number;
  contentTruncated: boolean;
};

/** The exact bounded supplemental content used for one Analyzer run. */
export type KnowledgeReuseAuditItem = Omit<KnowledgeContextRef, "order"> & {
  sourceStatus?: "current" | "updated" | "archived-warning" | "snapshot-only";
};
