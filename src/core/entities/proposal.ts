export type Proposal = {
  id: string;
  sourceId: string;
  title: string;
  summary: string;
  sourceEvidence: {
    sourceName: string;
    excerpt: string;
  };
  generatedBy: "Demo Analyzer Generated";
  createdAt: string;
};
