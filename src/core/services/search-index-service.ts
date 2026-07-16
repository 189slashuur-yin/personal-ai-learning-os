import type { Conversation } from "@/core/entities/conversation";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import type { Asset } from "@/core/entities/asset";
import type { Proposal } from "@/core/entities/proposal";
import type {
  SearchDocument,
  SearchDocumentFilters,
  SearchDocumentMatch,
} from "@/core/entities/search-document";
import type { Tag } from "@/core/entities/tag";
import type { Task } from "@/core/entities/task";
import { DEFAULT_WORKSPACE_ID, type Workspace } from "@/core/entities/workspace";
import { deriveQAPairs } from "@/core/services/qa-pair-service";

export type SearchIndexData = {
  workspaces: Workspace[];
  conversations: Conversation[];
  sources: ImportedSource[];
  messages: Message[];
  rounds: Round[];
  proposals: Proposal[];
  knowledgeCards: KnowledgeCard[];
  tasks: Task[];
  tags: Tag[];
  assets: Asset[];
};

type MatchCandidate = {
  field: string;
  value: string;
  mode: "exact" | "contains" | "fuzzy";
  score: number;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isSubsequence(query: string, value: string) {
  if (!query || query.length > value.length) return false;
  let queryIndex = 0;
  for (const character of value) {
    if (character === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return true;
  }
  return false;
}

function createSnippet(value: string, query: string, length = 220) {
  const text = compact(value);
  if (!text) return "暂无可搜索文字";

  const normalizedQuery = normalize(query);
  const matchIndex = normalizedQuery
    ? text.toLocaleLowerCase().indexOf(normalizedQuery)
    : -1;
  const start = Math.max(0, matchIndex >= 0 ? matchIndex - 70 : 0);
  const excerpt = text.slice(start, start + length);
  return `${start > 0 ? "…" : ""}${excerpt}${
    start + length < text.length ? "…" : ""
  }`;
}

function timestampValue(timestamp?: string) {
  if (!timestamp) return 0;
  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function documentId(type: SearchDocument["entityType"], entityId: string) {
  return `${type}:${entityId}`;
}

export class SearchIndexService {
  private documents: SearchDocument[] = [];

  constructor(private readonly data: SearchIndexData) {}

  buildDocuments(): SearchDocument[] {
    const workspaceById = new Map(
      this.data.workspaces.map((workspace) => [workspace.id, workspace]),
    );
    const conversationById = new Map(
      this.data.conversations.map((conversation) => [conversation.id, conversation]),
    );
    const roundById = new Map(
      this.data.rounds.map((round) => [round.id, round]),
    );
    const sourceById = new Map(
      this.data.sources.map((source) => [source.id, source]),
    );
    const proposalById = new Map(
      this.data.proposals.map((proposal) => [proposal.id, proposal]),
    );
    const tagById = new Map(this.data.tags.map((tag) => [tag.id, tag]));
    const workspacePath = (workspaceId?: string) => {
      const parts: string[] = [];
      let current = workspaceId ? workspaceById.get(workspaceId) : undefined;
      while (current && parts.length < 12) {
        parts.unshift(current.name);
        current = current.parentId ? workspaceById.get(current.parentId) : undefined;
      }
      return parts.join(" > ");
    };

    const getWorkspace = (conversationId?: string) => {
      const conversation = conversationId
        ? conversationById.get(conversationId)
        : undefined;
      const workspaceId = conversation
        ? conversation.workspaceId ?? DEFAULT_WORKSPACE_ID
        : undefined;
      return {
        id: workspaceId,
        name: workspaceId
          ? workspaceById.get(workspaceId)?.name ?? "Inbox"
          : undefined,
      };
    };
    const getProposalConversationId = (proposal: Proposal) =>
      proposal.conversationId ??
      (proposal.sourceId
        ? sourceById.get(proposal.sourceId)?.conversationId
        : undefined);

    const workspaces: SearchDocument[] = this.data.workspaces.map((workspace) => ({
      id: documentId("workspace", workspace.id),
      entityType: "workspace",
      entityId: workspace.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      title: workspace.name,
      body: workspace.description ?? "",
      sourceLabel: "Workspace",
      sourcePath: workspace.name,
      updatedAt: workspace.updatedAt,
      href: "/workspace",
      fields: {
        title: workspace.name,
        description: workspace.description ?? "",
        status: workspace.archivedAt ? "Archived" : "Active",
      },
      metadata: { archived: Boolean(workspace.archivedAt) },
    }));

    const conversations: SearchDocument[] = this.data.conversations.map(
      (conversation) => {
        const workspace = getWorkspace(conversation.id);
        return {
          id: documentId("conversation", conversation.id),
          entityType: "conversation",
          entityId: conversation.id,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          title: conversation.title,
          body: [conversation.note, conversation.summary, conversation.conclusion, conversation.pendingQuestions].filter(Boolean).join("\n"),
          sourceLabel: conversation.sourceType,
          sourcePath: [workspacePath(workspace.id), conversation.title].filter(Boolean).join(" > "),
          updatedAt: conversation.updatedAt,
          href: `/conversation/${conversation.id}`,
          fields: {
            title: conversation.title,
            note: conversation.note ?? "",
            summary: conversation.summary ?? "",
            conclusion: conversation.conclusion ?? "",
            pendingQuestions: conversation.pendingQuestions ?? "",
            sourceType: conversation.sourceType,
            workspace: workspace.name ?? "",
          },
          metadata: { importProfileId: conversation.importProfileId },
        };
      },
    );

    const sources: SearchDocument[] = this.data.sources.map((source) => {
      const conversation = source.conversationId
        ? conversationById.get(source.conversationId)
        : undefined;
      const workspace = getWorkspace(source.conversationId);
      return {
        id: documentId("source", source.id),
        entityType: "source",
        entityId: source.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        title: source.name,
        body: source.content,
        sourceLabel: "Imported Source",
        sourcePath: conversation
          ? `${conversation.title} > Source`
          : "Imported Source",
        updatedAt: source.updatedAt,
        href: source.conversationId
          ? `/conversation/${source.conversationId}`
          : "/analysis",
        fields: {
          title: source.name,
          content: source.content,
          conversation: conversation?.title ?? "",
          workspace: workspace.name ?? "",
        },
        metadata: { conversationId: source.conversationId },
      };
    });

    const messages: SearchDocument[] = this.data.messages.map((message) => {
      const conversation = conversationById.get(message.conversationId);
      const workspace = getWorkspace(message.conversationId);
      return {
        id: documentId("message", message.id),
        entityType: "message",
        entityId: message.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        title: `${conversation?.title ?? "Conversation"} · Message #${message.order}`,
        body: message.content,
        sourceLabel: message.role,
        sourcePath: `${conversation?.title ?? "Conversation"} > Message #${message.order}`,
        updatedAt: message.updatedAt ?? message.createdAt,
        href: `/conversation/${message.conversationId}`,
        fields: {
          content: message.content,
          role: message.role,
          conversation: conversation?.title ?? "",
          workspace: workspace.name ?? "",
        },
        metadata: {
          conversationId: message.conversationId,
          order: message.order,
          role: message.role,
        },
      };
    });

    const rounds: SearchDocument[] = this.data.rounds.map((round) => {
      const conversation = conversationById.get(round.conversationId);
      const workspace = getWorkspace(round.conversationId);
      return {
        id: documentId("round", round.id),
        entityType: "round",
        entityId: round.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        title: round.title || `${conversation?.title ?? "Conversation"} · Round ${round.order}`,
        body: [round.question, round.answer, round.note, round.summary].filter(Boolean).join("\n"),
        sourceLabel: "Round",
        sourcePath: `${workspacePath(workspace.id)}${workspace.id ? " > " : ""}${conversation?.title ?? "Conversation"} > Round ${round.order}`,
        updatedAt: round.updatedAt,
        href: `/conversation/${round.conversationId}?mode=workspace&round=${encodeURIComponent(round.id)}#round-${round.id}`,
        fields: {
          title: round.title,
          question: round.question,
          answer: round.answer,
          note: round.note ?? "",
          summary: round.summary ?? "",
          conversation: conversation?.title ?? "",
          workspace: workspace.name ?? "",
        },
        metadata: {
          conversationId: round.conversationId,
          order: round.order,
          messageIds: round.messageIds,
        },
      };
    });

    const qaPairs: SearchDocument[] = this.data.conversations.flatMap(
      (conversation) => {
        const workspace = getWorkspace(conversation.id);
        const conversationMessages = this.data.messages.filter(
          (message) => message.conversationId === conversation.id,
        );
        return deriveQAPairs(conversationMessages).map((pair) => ({
          id: documentId("qa-pair", `${conversation.id}:${pair.id}`),
          entityType: "qa-pair" as const,
          entityId: pair.id,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          title:
            pair.questionText ||
            `${conversation.title} · Q&A Pair #${pair.order}`,
          body: [pair.questionText, pair.answerText].filter(Boolean).join("\n"),
          sourceLabel: pair.kind,
          sourcePath: `${conversation.title} > Q&A Pair #${pair.order}`,
          updatedAt: pair.updatedAt ?? pair.createdAt,
          href: `/conversation/${conversation.id}`,
          fields: {
            question: pair.questionText,
            answer: pair.answerText,
            conversation: conversation.title,
            workspace: workspace.name ?? "",
          },
          metadata: {
            conversationId: conversation.id,
            messageIds: pair.messageIds,
            order: pair.order,
            kind: pair.kind,
          },
        }));
      },
    );

    const proposals: SearchDocument[] = this.data.proposals.map((proposal) => {
      const conversationId = getProposalConversationId(proposal);
      const conversation = conversationId
        ? conversationById.get(conversationId)
        : undefined;
      const workspace = getWorkspace(conversationId);
      return {
        id: documentId("proposal", proposal.id),
        entityType: "proposal",
        entityId: proposal.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        title: proposal.title,
        body: [proposal.summary, proposal.sourceEvidence.excerpt]
          .filter(Boolean)
          .join("\n"),
        sourceLabel: proposal.sourceEvidence.sourceName,
        sourcePath: `${conversation?.title ?? "Conversation"} > Proposal`,
        updatedAt: proposal.generatedAt ?? proposal.createdAt,
        href: `/review?proposal=${encodeURIComponent(proposal.id)}`,
        fields: {
          title: proposal.title,
          summary: proposal.summary,
          evidence: proposal.sourceEvidence.excerpt,
          source: proposal.sourceEvidence.sourceName,
          provider: proposal.providerName ?? proposal.generatedBy,
          status: proposal.status,
          workspace: workspace.name ?? "",
        },
        metadata: {
          conversationId,
          sourceRoundId: proposal.sourceRoundId,
          sourceId: proposal.sourceId,
          sourceMessageIds: proposal.sourceMessageIds,
          status: proposal.status,
          providerId: proposal.providerId,
        },
      };
    });

    const knowledge: SearchDocument[] = this.data.knowledgeCards.map((card) => {
      const proposal = proposalById.get(card.proposalId);
      const referencedConversationId =
        card.sourceConversationId ??
        (proposal ? getProposalConversationId(proposal) : undefined);
      const conversation = referencedConversationId
        ? conversationById.get(referencedConversationId)
        : undefined;
      const conversationId = conversation?.id;
      const sourceRound = card.sourceRoundId
        ? roundById.get(card.sourceRoundId)
        : undefined;
      const sourceRoundId =
        sourceRound &&
        conversationId &&
        sourceRound.conversationId === conversationId
          ? sourceRound.id
          : undefined;
      const workspace = getWorkspace(conversationId);
      const tags = card.tagIds.flatMap((tagId) => {
        const tag = tagById.get(tagId);
        return tag ? [tag.name] : [];
      });
      return {
        id: documentId("knowledge", card.id),
        entityType: "knowledge",
        entityId: card.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        title: card.title,
        body: [card.summary, card.content, card.sourceEvidenceExcerpt]
          .filter(Boolean)
          .join("\n"),
        sourceLabel: card.sourceFile,
        sourcePath: conversation
          ? `${conversation.title} > Knowledge`
          : "来源已删除 > Knowledge",
        tags,
        updatedAt: card.updatedAt,
        href: `/knowledge/${card.id}`,
        fields: {
          title: card.title,
          summary: card.summary,
          content: card.content,
          evidence: card.sourceEvidenceExcerpt ?? "",
          source: card.sourceFile,
          tags: tags.join(" "),
          status: card.status,
          workspace: workspace.name ?? "",
        },
        metadata: {
          proposalId: card.proposalId,
          conversationId,
          sourceRoundId,
          sourceReferenceMissing: Boolean(
            referencedConversationId && !conversation,
          ),
          status: card.status,
        },
      };
    });

    const tasks: SearchDocument[] = this.data.tasks.map((task) => {
      const workspaceId = task.workspaceId ?? DEFAULT_WORKSPACE_ID;
      const workspaceName = workspaceById.get(workspaceId)?.name ?? "Inbox";
      const sourceTitle = task.sourceRef?.titleSnapshot ?? "";
      const sourceSummary = task.sourceRef?.summarySnapshot ?? "";
      return {
        id: documentId("task", task.id),
        entityType: "task",
        entityId: task.id,
        workspaceId,
        workspaceName,
        title: task.title,
        body: [task.description, sourceTitle, sourceSummary]
          .filter(Boolean)
          .join("\n"),
        sourceLabel: task.sourceRef?.type ?? "Manual Task",
        sourcePath: task.sourceRef
          ? `Task > ${task.sourceRef.type} > ${sourceTitle}`
          : "Task",
        updatedAt: task.updatedAt,
        href: `/tasks?q=${encodeURIComponent(task.title)}`,
        fields: {
          title: task.title,
          description: task.description ?? "",
          sourceTitle,
          sourceSummary,
          status: task.status,
          priority: task.priority,
          type: task.type,
          workspace: workspaceName,
        },
        metadata: {
          status: task.status,
          priority: task.priority,
          type: task.type,
          dueDate: task.dueDate,
          sourceType: task.sourceRef?.type,
        },
      };
    });

    const tags: SearchDocument[] = this.data.tags.map((tag) => ({
      id: documentId("tag", tag.id),
      entityType: "tag",
      entityId: tag.id,
      title: tag.name,
      body: tag.name,
      sourceLabel: "Tag",
      sourcePath: `Tag > ${tag.name}`,
      tags: [tag.name],
      updatedAt: tag.updatedAt,
      href: "/tags",
      fields: { title: tag.name },
      metadata: {
        knowledgeCount: this.data.knowledgeCards.filter((card) =>
          card.tagIds.includes(tag.id),
        ).length,
      },
    }));

    const assets: SearchDocument[] = this.data.assets.map((asset) => {
      let conversationId: string | undefined;
      let workspaceId: string | undefined;
      let href = "/search";
      if (asset.entityType === "conversation") {
        conversationId = asset.entityId;
        href = `/conversation/${asset.entityId}`;
      } else if (asset.entityType === "knowledge") {
        const card = this.data.knowledgeCards.find((item) => item.id === asset.entityId);
        conversationId = card?.sourceConversationId;
        href = `/knowledge/${asset.entityId}`;
      } else if (asset.entityType === "task") {
        const task = this.data.tasks.find((item) => item.id === asset.entityId);
        workspaceId = task?.workspaceId;
        href = "/tasks";
      } else if (asset.entityType === "workspace") {
        workspaceId = asset.entityId;
        href = "/workspace";
      }
      const workspace = conversationId
        ? getWorkspace(conversationId)
        : { id: workspaceId, name: workspaceId ? workspaceById.get(workspaceId)?.name : undefined };
      return {
        id: documentId("asset", asset.id),
        entityType: "asset",
        entityId: asset.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        title: asset.originalName || asset.filename,
        body: [asset.filename, asset.note, asset.mimeType, asset.localPath, asset.relativePath].filter(Boolean).join("\n"),
        sourceLabel: `Asset · ${asset.entityType}`,
        sourcePath: `Asset > ${asset.entityType}`,
        updatedAt: asset.updatedAt,
        href,
        fields: {
          title: asset.originalName || asset.filename,
          filename: asset.filename,
          note: asset.note ?? "",
          mimeType: asset.mimeType ?? "",
          path: asset.relativePath ?? asset.localPath ?? "",
        },
        metadata: { ownerType: asset.entityType, ownerId: asset.entityId },
      };
    });

    this.documents = [
      ...workspaces,
      ...conversations,
      ...sources,
      ...messages,
      ...rounds,
      ...qaPairs,
      ...proposals,
      ...knowledge,
      ...tasks,
      ...assets,
      ...tags,
    ];
    return [...this.documents];
  }

  searchDocuments(
    query: string,
    filters: SearchDocumentFilters = {},
  ): SearchDocumentMatch[] {
    if (this.documents.length === 0) {
      this.buildDocuments();
    }

    const normalizedQuery = normalize(query);
    const entityTypes = new Set(filters.entityTypes ?? []);

    return this.documents
      .filter(
        (document) =>
          entityTypes.size === 0 || entityTypes.has(document.entityType),
      )
      .filter(
        (document) =>
          !filters.workspaceId || document.workspaceId === filters.workspaceId,
      )
      .map((document) => {
        const matches = normalizedQuery
          ? Object.entries(document.fields).flatMap<MatchCandidate>(([field, value]) => {
              const normalizedValue = normalize(value);
              const index = normalizedValue.indexOf(normalizedQuery);
              const fieldWeight = field === "title"
                ? 80
                : field === "content" || field === "question" || field === "answer"
                  ? 55
                  : 35;
              if (normalizedValue === normalizedQuery) {
                return [{ field, value, mode: "exact" as const, score: fieldWeight + 55 }];
              }
              if (index >= 0) {
                return [{
                  field,
                  value,
                  mode: "contains" as const,
                  score: fieldWeight + Math.max(0, 20 - index),
                }];
              }
              if (isSubsequence(normalizedQuery, normalizedValue)) {
                const density = normalizedQuery.length / Math.max(normalizedValue.length, 1);
                return [{
                  field,
                  value,
                  mode: "fuzzy" as const,
                  score: Math.round(fieldWeight * 0.35 + density * 20),
                }];
              }
              return [];
            })
          : [];

        if (normalizedQuery && matches.length === 0) return null;

        const bestMatch = [...matches].sort((left, right) => right.score - left.score)[0];
        return {
          ...document,
          snippet: createSnippet(
            bestMatch?.value ?? document.body ?? document.title,
            normalizedQuery,
          ),
          matchedFields: matches.map((match) => match.field),
          matchMode: bestMatch?.mode ?? "contains",
          score: matches.reduce((total, match) => total + match.score, 0),
        } satisfies SearchDocumentMatch;
      })
      .filter((document): document is SearchDocumentMatch => document !== null)
      .sort((left, right) => {
        if (normalizedQuery && right.score !== left.score) {
          return right.score - left.score;
        }
        return timestampValue(right.updatedAt) - timestampValue(left.updatedAt);
      });
  }

  getDocumentById(id: string): SearchDocument | null {
    if (this.documents.length === 0) {
      this.buildDocuments();
    }
    return this.documents.find((document) => document.id === id) ?? null;
  }
}
