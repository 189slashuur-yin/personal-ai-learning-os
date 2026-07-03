import type { Conversation } from "@/core/entities/conversation";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";
import { DEFAULT_WORKSPACE_ID, type Workspace } from "@/core/entities/workspace";

export type SearchResultType = "conversation" | "proposal" | "knowledge";

export type SearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  content: string;
  source: string;
  workspace: string;
  href: string;
};

type SearchData = {
  conversations: Conversation[];
  sources: ImportedSource[];
  proposals: Proposal[];
  knowledgeCards: KnowledgeCard[];
  workspaces: Workspace[];
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
  const sourceById = new Map(data.sources.map((source) => [source.id, source]));
  const conversationById = new Map(
    data.conversations.map((conversation) => [conversation.id, conversation]),
  );
  const proposalById = new Map(
    data.proposals.map((proposal) => [proposal.id, proposal]),
  );
  const workspaceById = new Map(
    data.workspaces.map((workspace) => [workspace.id, workspace]),
  );
  const getWorkspaceName = (conversationId?: string) => {
    const workspaceId = conversationId
      ? conversationById.get(conversationId)?.workspaceId
      : undefined;
    return workspaceById.get(workspaceId ?? DEFAULT_WORKSPACE_ID)?.name ?? "Inbox";
  };

  const conversations: SearchResult[] = data.conversations
    .map((conversation) => {
      const source = sourceByConversationId.get(conversation.id);
      return {
        id: conversation.id,
        type: "conversation" as const,
        title: conversation.title,
        content: source?.content ?? "",
        source: [conversation.sourceType, source?.name].filter(Boolean).join(" · "),
        workspace: getWorkspaceName(conversation.id),
        href: `/conversation/${conversation.id}`,
      };
    })
    .filter((result) =>
      [result.title, result.content, result.source].some((value) =>
        includesQuery(value, query),
      ),
    );

  const proposals: SearchResult[] = data.proposals
    .map((proposal) => {
      const conversationId =
        proposal.conversationId ??
        (proposal.sourceId ? sourceById.get(proposal.sourceId)?.conversationId : undefined);
      return {
        id: proposal.id,
        type: "proposal" as const,
        title: proposal.title,
        content: [proposal.summary, proposal.sourceEvidence.excerpt]
          .filter(Boolean)
          .join(" "),
        source: proposal.sourceEvidence.sourceName,
        workspace: getWorkspaceName(conversationId),
        href: `/review?proposal=${encodeURIComponent(proposal.id)}`,
      };
    })
    .filter((result) =>
      [result.title, result.content, result.source].some((value) =>
        includesQuery(value, query),
      ),
    );

  const knowledge: SearchResult[] = data.knowledgeCards
    .map((card) => {
      const proposal = proposalById.get(card.proposalId);
      return {
        id: card.id,
        type: "knowledge" as const,
        title: card.title,
        content: [card.summary, card.content].filter(Boolean).join(" "),
        source: card.sourceFile,
        workspace: getWorkspaceName(
          card.sourceConversationId ?? proposal?.conversationId,
        ),
        href: `/knowledge/${card.id}`,
      };
    })
    .filter((result) =>
      [result.title, result.content, result.source].some((value) =>
        includesQuery(value, query),
      ),
    );

  return [...conversations, ...proposals, ...knowledge];
}
