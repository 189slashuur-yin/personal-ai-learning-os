import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message, MessageRole } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";

const SUMMARY_LENGTH = 120;
const EVIDENCE_LENGTH = 200;

const messageRoleLabels: Record<MessageRole, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  unknown: "Unknown",
};

function normalizeText(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function excerpt(content: string, length: number) {
  return content.length > length ? `${content.slice(0, length)}…` : content;
}

export function analyzeSource(source: ImportedSource): Proposal {
  const content = normalizeText(source.content);
  const sourceTitle = source.name.replace(/\.txt$/i, "");

  return {
    id: `demo-proposal-${source.id}`,
    sourceId: source.id,
    conversationId: source.conversationId,
    title: `关于「${sourceTitle}」的内容提炼`,
    summary: excerpt(content, SUMMARY_LENGTH),
    sourceEvidence: {
      sourceName: source.name,
      excerpt: excerpt(content, EVIDENCE_LENGTH),
    },
    generatedBy: "Demo Analyzer Generated",
    status: "Pending",
    createdAt: new Date().toISOString(),
  };
}

export function analyzeMessages(
  conversationId: string,
  selectedMessages: Message[],
): Proposal {
  if (selectedMessages.length === 0) {
    throw new Error("Demo Analyzer 至少需要一条 Message。");
  }

  const orderedMessages = [...selectedMessages].sort(
    (left, right) => left.order - right.order,
  );
  const evidence = orderedMessages
    .map(
      (message) =>
        `${messageRoleLabels[message.role]}：${message.content.trim()}`,
    )
    .join("\n\n");
  const normalizedEvidence = normalizeText(evidence);

  return {
    id: `message-proposal-${crypto.randomUUID()}`,
    conversationId,
    sourceMessageIds: orderedMessages.map((message) => message.id),
    title: `基于 ${orderedMessages.length} 条 Message 的内容提炼`,
    summary: excerpt(normalizedEvidence, SUMMARY_LENGTH),
    sourceEvidence: {
      sourceName: `Conversation Messages（${orderedMessages.length} 条）`,
      excerpt: evidence,
    },
    generatedBy: "Demo Analyzer Generated",
    status: "Pending",
    createdAt: new Date().toISOString(),
  };
}
