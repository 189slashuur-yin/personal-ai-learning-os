export type KnowledgeCard = {
  id: string;
  proposalId: string;
  title: string;
  content: string;
  sourceFile: string;
  sourceId?: string;
  sourceConversationId?: string;
  sourceMessageIds?: string[];
  sourceMessageCount?: number;
  sourceEvidenceExcerpt?: string;
  tagIds: string[];
  createdAt: string;
  status: "Active" | "Archived";
};
