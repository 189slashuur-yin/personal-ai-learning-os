import type { Conversation } from "@/core/entities/conversation";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";

export type SearchResultType = "conversation" | "proposal" | "knowledge";

export type SearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  content: string;
  source: string;
  href: string;
};

type SearchData = {
  conversations: Conversation[];
  sources: ImportedSource[];
  proposals: Proposal[];
  knowledgeCards: KnowledgeCard[];
};

function includesQuery(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query);
}

export function searchLearningOS(data: SearchData, rawQuery: string) {
  const query = rawQuery.trim().toLocaleLowerCase();

  if (!query) return [];

  const sourceByConversationId = new Map(
    data.sources
      .filter((source) => source.conversationId)
      .map((source) => [source.conversationId, source]),
  );

  const conversations: SearchResult[] = data.conversations
    .map((conversation) => {
      const source = sourceByConversationId.get(conversation.id);
      return {
        id: conversation.id,
        type: "conversation" as const,
        title: conversation.title,
        content: source?.content ?? "",
        source: [conversation.sourceType, source?.name].filter(Boolean).join(" · "),
        href: `/conversation/${conversation.id}`,
      };
    })
    .filter((result) =>
      [result.title, result.content, result.source].some((value) =>
        includesQuery(value, query),
      ),
    );

  const proposals: SearchResult[] = data.proposals
    .map((proposal) => ({
      id: proposal.id,
      type: "proposal" as const,
      title: proposal.title,
      content: [proposal.summary, proposal.sourceEvidence.excerpt]
        .filter(Boolean)
        .join(" "),
      source: proposal.sourceEvidence.sourceName,
      href: `/review?proposal=${encodeURIComponent(proposal.id)}`,
    }))
    .filter((result) =>
      [result.title, result.content, result.source].some((value) =>
        includesQuery(value, query),
      ),
    );

  const knowledge: SearchResult[] = data.knowledgeCards
    .map((card) => ({
      id: card.id,
      type: "knowledge" as const,
      title: card.title,
      content: card.content,
      source: card.sourceFile,
      href: `/knowledge/${card.id}`,
    }))
    .filter((result) =>
      [result.title, result.content, result.source].some((value) =>
        includesQuery(value, query),
      ),
    );

  return [...conversations, ...proposals, ...knowledge];
}
