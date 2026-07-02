export type KnowledgeCard = {
  id: string;
  proposalId: string;
  title: string;
  content: string;
  sourceFile: string;
  sourceConversationId?: string;
  sourceMessageCount?: number;
  createdAt: string;
  status: "Active" | "Archived";
};
