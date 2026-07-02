export type Proposal = {
  id: string;
  sourceId?: string;
  conversationId?: string;
  sourceMessageIds?: string[];
  title: string;
  summary: string;
  sourceEvidence: {
    sourceName: string;
    excerpt: string;
  };
  generatedBy: "Demo Analyzer Generated";
  status: "Pending" | "Accepted" | "Rejected" | "Applied";
  createdAt: string;
};
