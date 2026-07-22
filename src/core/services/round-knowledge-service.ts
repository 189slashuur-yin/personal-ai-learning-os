import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { Conversation } from "@/core/entities/conversation";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";
import type { Round } from "@/core/entities/round";

export type ManualKnowledgeResult = {
  card: KnowledgeCard;
  created: boolean;
};

function normalizeManualContent(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

export class RoundKnowledgeService {
  constructor(private readonly knowledge: KnowledgeCardStorage, private readonly proposals: ProposalStorage) {}

  createManual(round: Round, title: string, content: string) {
    return this.createManualWithResult(round, title, content).card;
  }

  createManualWithResult(
    round: Round,
    title: string,
    content: string,
  ): ManualKnowledgeResult {
    const normalizedContent = normalizeManualContent(content);
    const existing = this.knowledge
      .getAll()
      .find(
        (card) =>
          card.sourceRoundId === round.id &&
          card.sourceConversationId === round.conversationId &&
          normalizeManualContent(card.content) === normalizedContent,
      );

    if (existing) return { card: existing, created: false };

    const timestamp = new Date().toISOString();
    const proposal: Proposal = {
      id: crypto.randomUUID(),
      sourceType: "round",
      sourceRoundId: round.id,
      conversationId: round.conversationId,
      sourceMessageIds: [...round.messageIds],
      title: title.trim() || round.title,
      summary: normalizedContent,
      sourceEvidence: { sourceName: `Round ${round.order}: ${round.title}`, excerpt: [round.question, round.answer].filter(Boolean).join("\n").slice(0, 600) },
      generatedBy: "Demo Analyzer Generated",
      providerId: "manual",
      providerName: "Manual",
      status: "Applied",
      purpose: "knowledge-create",
      createdAt: timestamp,
    };
    const card: KnowledgeCard = {
      id: crypto.randomUUID(), proposalId: proposal.id, title: proposal.title,
      content: proposal.summary, summary: proposal.summary, sourceFile: proposal.sourceEvidence.sourceName,
      sourceConversationId: round.conversationId, sourceRoundId: round.id, sourceMessageIds: [...round.messageIds],
      sourceMessageCount: round.messageIds.length, sourceEvidenceExcerpt: proposal.sourceEvidence.excerpt,
      providerName: "Manual", tagIds: [], createdAt: timestamp, updatedAt: timestamp, status: "Active", previousContentSnapshots: [],
    };
    this.proposals.save(proposal);
    this.knowledge.save(card);
    return { card, created: true };
  }

  createConversationManual(
    conversation: Conversation,
    title: string,
    content: string,
  ) {
    return this.createConversationManualWithResult(
      conversation,
      title,
      content,
    ).card;
  }

  createConversationManualWithResult(
    conversation: Conversation,
    title: string,
    content: string,
  ): ManualKnowledgeResult {
    const timestamp = new Date().toISOString();
    const normalizedTitle = title.trim() || `${conversation.title} · 总览`;
    const normalizedContent = normalizeManualContent(content);
    const existing = this.knowledge
      .getAll()
      .find(
        (card) =>
          !card.sourceRoundId &&
          card.sourceConversationId === conversation.id &&
          normalizeManualContent(card.content) === normalizedContent,
      );

    if (existing) return { card: existing, created: false };

    const proposal: Proposal = {
      id: crypto.randomUUID(),
      sourceType: "conversation",
      conversationId: conversation.id,
      title: normalizedTitle,
      summary: normalizedContent,
      sourceEvidence: {
        sourceName: `Conversation Overview: ${conversation.title}`,
        excerpt: normalizedContent.slice(0, 600),
      },
      generatedBy: "Demo Analyzer Generated",
      providerId: "manual",
      providerName: "Manual",
      status: "Applied",
      purpose: "knowledge-create",
      createdAt: timestamp,
    };
    const card: KnowledgeCard = {
      id: crypto.randomUUID(),
      proposalId: proposal.id,
      title: normalizedTitle,
      content: normalizedContent,
      summary: normalizedContent,
      sourceFile: proposal.sourceEvidence.sourceName,
      sourceConversationId: conversation.id,
      sourceMessageIds: [],
      sourceMessageCount: 0,
      sourceEvidenceExcerpt: proposal.sourceEvidence.excerpt,
      providerName: "Manual",
      tagIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "Active",
      previousContentSnapshots: [],
    };

    this.proposals.save(proposal);
    this.knowledge.save(card);
    return { card, created: true };
  }

  duplicate(card: KnowledgeCard) {
    const timestamp = new Date().toISOString();
    const proposalId = crypto.randomUUID();
    const proposal: Proposal = {
      id: proposalId, sourceType: card.sourceRoundId ? "round" : "conversation", sourceRoundId: card.sourceRoundId,
      conversationId: card.sourceConversationId, sourceMessageIds: card.sourceMessageIds, title: `${card.title} (copy)`, summary: card.content,
      sourceEvidence: { sourceName: card.sourceFile, excerpt: card.sourceEvidenceExcerpt ?? card.summary }, generatedBy: "Demo Analyzer Generated",
      providerId: "manual", providerName: "Manual duplicate", status: "Applied", purpose: "knowledge-create", createdAt: timestamp,
    };
    const copy: KnowledgeCard = { ...card, id: crypto.randomUUID(), proposalId, title: proposal.title, createdAt: timestamp, updatedAt: timestamp, previousContentSnapshots: [] };
    this.proposals.save(proposal);
    this.knowledge.save(copy);
    return copy;
  }

  createUpdateDraft(round: Round, card: KnowledgeCard) {
    const timestamp = new Date().toISOString();
    const content = round.summary || round.answer || round.note || card.content;
    const proposal: Proposal = {
      id: crypto.randomUUID(), sourceType: "round", sourceRoundId: round.id, conversationId: round.conversationId,
      sourceMessageIds: [...round.messageIds], title: `更新建议 · ${card.title}`, summary: content,
      sourceEvidence: { sourceName: `Round ${round.order}: ${round.title}`, excerpt: [round.question, round.answer].filter(Boolean).join("\n").slice(0, 600) },
      generatedBy: "Demo Analyzer Generated", providerId: "demo", providerName: "Demo Provider", status: "Pending",
      purpose: "knowledge-update", targetKnowledgeId: card.id, createdAt: timestamp,
    };
    this.proposals.save(proposal);
    return proposal;
  }

  applyUpdate(proposal: Proposal) {
    if (!proposal.targetKnowledgeId) return null;
    const card = this.knowledge.getById(proposal.targetKnowledgeId);
    if (!card) return null;
    const timestamp = new Date().toISOString();
    const updated: KnowledgeCard = {
      ...card, content: proposal.summary, summary: proposal.summary, updatedAt: timestamp,
      previousContentSnapshots: [...(card.previousContentSnapshots ?? []), { content: card.content, summary: card.summary, capturedAt: timestamp }],
    };
    this.knowledge.update(updated);
    return updated;
  }
}
