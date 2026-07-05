export type Round = {
  id: string;
  conversationId: string;
  order: number;
  title: string;
  question: string;
  answer: string;
  messageIds: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
};
