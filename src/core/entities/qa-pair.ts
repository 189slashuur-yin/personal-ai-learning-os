export type QAPairKind = "answered" | "unanswered" | "orphan-assistant" | "context";

export type QAPair = {
  id: string;
  order: number;
  questionText: string;
  answerText: string;
  messageIds: string[];
  kind: QAPairKind;
  createdAt?: string;
  updatedAt?: string;
};
