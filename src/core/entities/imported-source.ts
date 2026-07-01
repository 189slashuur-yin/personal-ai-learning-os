export type ImportedSource = {
  id: string;
  conversationId?: string;
  kind: "text";
  name: string;
  content: string;
  importedAt: string;
};
