import type { Conversation } from "@/core/entities/conversation";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";
import type {
  SearchEntityType,
  SearchFilter,
} from "@/core/entities/search-filter";
import type { SearchResult } from "@/core/entities/search-result";
import type { Tag } from "@/core/entities/tag";
import type { Task } from "@/core/entities/task";
import { DEFAULT_WORKSPACE_ID, type Workspace } from "@/core/entities/workspace";

export type { SearchFilter, SearchEntityType as SearchResultType, SearchResult };

export type SearchData = {
  conversations: Conversation[];
  sources: ImportedSource[];
  proposals: Proposal[];
  knowledgeCards: KnowledgeCard[];
  tags?: Tag[];
  workspaces: Workspace[];
  tasks?: Task[];
};

type SearchDocument = SearchResult & {
  fields: Record<string, string>;
  workspaceIds: string[];
  tagIds: string[];
  providerId?: string;
  status?: string;
  searchableAt?: string;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function createExcerpt(value: string, query: string, length = 180) {
  const compactValue = value.replace(/\s+/g, " ").trim();
  if (!compactValue) return "暂无内容摘要";

  const matchIndex = normalize(query)
    ? compactValue.toLocaleLowerCase().indexOf(normalize(query))
    : -1;
  const start = Math.max(0, matchIndex >= 0 ? matchIndex - 55 : 0);
  const excerpt = compactValue.slice(start, start + length);
  return `${start > 0 ? "…" : ""}${excerpt}${
    start + length < compactValue.length ? "…" : ""
  }`;
}

function matchesDateRange(timestamp: string | undefined, filter: SearchFilter) {
  if (!filter.dateRange?.from && !filter.dateRange?.to) return true;
  if (!timestamp) return false;

  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) return false;

  const from = filter.dateRange.from
    ? new Date(filter.dateRange.from).getTime()
    : null;
  const to = filter.dateRange.to ? new Date(filter.dateRange.to).getTime() : null;

  return !(
    (from !== null && !Number.isNaN(from) && value < from) ||
    (to !== null && !Number.isNaN(to) && value > to)
  );
}

function toSearchDocuments(data: SearchData): SearchDocument[] {
  const tags = data.tags ?? [];
  const sourceByConversationId = new Map(
    data.sources
      .filter((source) => source.conversationId)
      .map((source) => [source.conversationId as string, source]),
  );
  const sourceById = new Map(data.sources.map((source) => [source.id, source]));
  const conversationById = new Map(
    data.conversations.map((conversation) => [conversation.id, conversation]),
  );
  const proposalById = new Map(
    data.proposals.map((proposal) => [proposal.id, proposal]),
  );
  const knowledgeByProposalId = new Map(
    data.knowledgeCards.map((card) => [card.proposalId, card]),
  );
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const workspaceById = new Map(
    data.workspaces.map((workspace) => [workspace.id, workspace]),
  );

  const getConversationId = (proposal: Proposal) =>
    proposal.conversationId ??
    (proposal.sourceId
      ? sourceById.get(proposal.sourceId)?.conversationId
      : undefined);
  const getWorkspace = (conversationId?: string) => {
    const workspaceId = conversationId
      ? conversationById.get(conversationId)?.workspaceId ?? DEFAULT_WORKSPACE_ID
      : undefined;
    return {
      id: workspaceId,
      name: workspaceId ? workspaceById.get(workspaceId)?.name ?? "Inbox" : undefined,
    };
  };
  const getKnowledgeWorkspace = (card: KnowledgeCard) => {
    const proposal = proposalById.get(card.proposalId);
    return getWorkspace(card.sourceConversationId ?? proposal?.conversationId);
  };

  const conversations: SearchDocument[] = data.conversations.map((conversation) => {
    const source = sourceByConversationId.get(conversation.id);
    const workspace = getWorkspace(conversation.id);
    const sourceLabel = [conversation.sourceType, source?.name]
      .filter(Boolean)
      .join(" · ");
    const content = source?.content ?? "";

    return {
      id: conversation.id,
      type: "conversation",
      title: conversation.title,
      excerpt: createExcerpt(content || sourceLabel, ""),
      matchedFields: [],
      workspaceName: workspace.name,
      updatedAt: conversation.updatedAt,
      href: `/conversation/${conversation.id}`,
      fields: {
        title: conversation.title,
        note: conversation.note ?? "",
        content,
        source: sourceLabel,
        workspace: workspace.name ?? "",
      },
      workspaceIds: workspace.id ? [workspace.id] : [],
      tagIds: [],
      searchableAt: conversation.updatedAt,
    };
  });

  const proposals: SearchDocument[] = data.proposals.map((proposal) => {
    const workspace = getWorkspace(getConversationId(proposal));
    const knowledgeCard = knowledgeByProposalId.get(proposal.id);
    const proposalTags = (knowledgeCard?.tagIds ?? []).flatMap((tagId) => {
      const tag = tagById.get(tagId);
      return tag ? [tag.name] : [];
    });
    const content = [proposal.summary, proposal.sourceEvidence?.excerpt]
      .filter(Boolean)
      .join(" ");
    const providerName = proposal.providerName ?? proposal.generatedBy;

    return {
      id: proposal.id,
      type: "proposal",
      title: proposal.title,
      excerpt: createExcerpt(content, ""),
      matchedFields: [],
      workspaceName: workspace.name,
      tags: proposalTags.length ? proposalTags : undefined,
      providerName,
      updatedAt: proposal.generatedAt ?? proposal.createdAt,
      href: `/review?proposal=${encodeURIComponent(proposal.id)}`,
      fields: {
        title: proposal.title,
        summary: proposal.summary,
        source: proposal.sourceEvidence?.sourceName ?? "",
        evidence: proposal.sourceEvidence?.excerpt ?? "",
        workspace: workspace.name ?? "",
        tags: proposalTags.join(" "),
        provider: providerName,
        status: proposal.status,
      },
      workspaceIds: workspace.id ? [workspace.id] : [],
      tagIds: knowledgeCard?.tagIds ?? [],
      providerId: proposal.providerId,
      status: proposal.status,
      searchableAt: proposal.generatedAt ?? proposal.createdAt,
    };
  });

  const knowledge: SearchDocument[] = data.knowledgeCards.map((card) => {
    const proposal = proposalById.get(card.proposalId);
    const workspace = getKnowledgeWorkspace(card);
    const cardTags = card.tagIds.flatMap((tagId) => {
      const tag = tagById.get(tagId);
      return tag ? [tag.name] : [];
    });
    const content = [card.summary, card.content].filter(Boolean).join(" ");
    const providerName = card.providerName ?? proposal?.providerName;

    return {
      id: card.id,
      type: "knowledge",
      title: card.title,
      excerpt: createExcerpt(content, ""),
      matchedFields: [],
      workspaceName: workspace.name,
      tags: cardTags.length ? cardTags : undefined,
      providerName,
      updatedAt: card.updatedAt,
      href: `/knowledge/${card.id}`,
      fields: {
        title: card.title,
        summary: card.summary,
        content: card.content,
        source: card.sourceFile,
        workspace: workspace.name ?? "",
        tags: cardTags.join(" "),
        provider: providerName ?? "",
        status: card.status,
      },
      workspaceIds: workspace.id ? [workspace.id] : [],
      tagIds: card.tagIds,
      providerId: proposal?.providerId,
      status: card.status,
      searchableAt: card.updatedAt,
    };
  });

  const tagDocuments: SearchDocument[] = tags.map((tag) => {
    const taggedCards = data.knowledgeCards.filter((card) => card.tagIds.includes(tag.id));
    const workspaceIds = taggedCards.flatMap((card) => {
      const workspaceId = getKnowledgeWorkspace(card).id;
      return workspaceId ? [workspaceId] : [];
    });

    return {
      id: tag.id,
      type: "tag",
      title: tag.name,
      excerpt: `${taggedCards.length} 条关联知识`,
      matchedFields: [],
      tags: [tag.name],
      updatedAt: tag.updatedAt,
      href: "/tags",
      fields: { title: tag.name },
      workspaceIds: [...new Set(workspaceIds)],
      tagIds: [tag.id],
      searchableAt: tag.updatedAt,
    };
  });

  const workspaces: SearchDocument[] = data.workspaces.map((workspace) => ({
    id: workspace.id,
    type: "workspace",
    title: workspace.name,
    excerpt: createExcerpt(workspace.description ?? "Workspace", ""),
    matchedFields: [],
    updatedAt: workspace.updatedAt,
    href: "/workspace",
    fields: {
      title: workspace.name,
      description: workspace.description ?? "",
      status: workspace.archivedAt ? "Archived" : "Active",
    },
    workspaceIds: [workspace.id],
    tagIds: [],
    status: workspace.archivedAt ? "Archived" : "Active",
    searchableAt: workspace.updatedAt,
  }));

  const tasks: SearchDocument[] = (data.tasks ?? []).map((task) => {
    const workspaceId = task.workspaceId ?? DEFAULT_WORKSPACE_ID;
    const workspaceName = workspaceById.get(workspaceId)?.name ?? "Inbox";
    const sourceTitle = task.sourceRef?.titleSnapshot ?? "";
    const sourceSummary = task.sourceRef?.summarySnapshot ?? "";
    const content = [task.description, sourceTitle, sourceSummary]
      .filter(Boolean)
      .join(" ");

    return {
      id: task.id,
      type: "task",
      title: task.title,
      excerpt: createExcerpt(content || task.title, ""),
      matchedFields: [],
      workspaceName,
      taskStatus: task.status,
      taskPriority: task.priority,
      taskType: task.type,
      dueDate: task.dueDate,
      sourceRef: task.sourceRef,
      updatedAt: task.updatedAt,
      href: `/tasks?q=${encodeURIComponent(task.title)}`,
      fields: {
        title: task.title,
        description: task.description ?? "",
        sourceTitle,
        sourceSummary,
        workspace: workspaceName,
      },
      workspaceIds: [workspaceId],
      tagIds: [],
      status: task.status,
      searchableAt: task.updatedAt,
    };
  });

  return [
    ...conversations,
    ...proposals,
    ...knowledge,
    ...tagDocuments,
    ...workspaces,
    ...tasks,
  ];
}

function applySearchFilter(documents: SearchDocument[], filter: SearchFilter) {
  const query = normalize(filter.query);
  const entityTypes = new Set<SearchEntityType>(filter.entityTypes);

  return documents
    .filter((document) => entityTypes.size === 0 || entityTypes.has(document.type))
    .filter(
      (document) =>
        !filter.workspaceId || document.workspaceIds.includes(filter.workspaceId),
    )
    .filter((document) => !filter.tagId || document.tagIds.includes(filter.tagId))
    .filter(
      (document) => !filter.providerId || document.providerId === filter.providerId,
    )
    .filter((document) => !filter.status || document.status === filter.status)
    .filter(
      (document) =>
        document.type !== "task" ||
        !filter.taskStatus ||
        document.taskStatus === filter.taskStatus,
    )
    .filter(
      (document) =>
        document.type !== "task" ||
        !filter.taskPriority ||
        document.taskPriority === filter.taskPriority,
    )
    .filter(
      (document) =>
        document.type !== "task" ||
        !filter.taskType ||
        document.taskType === filter.taskType,
    )
    .filter((document) => matchesDateRange(document.searchableAt, filter))
    .map((document) => {
      const matchedFields = query
        ? Object.entries(document.fields)
            .filter(([, value]) => normalize(value).includes(query))
            .map(([field]) => field)
        : [];

      if (query && matchedFields.length === 0) return null;

      const excerptSource =
        matchedFields
          .filter((field) => field !== "title")
          .map((field) => document.fields[field])
          .find(Boolean) ??
        Object.values(document.fields).find(Boolean) ??
        document.excerpt;

      const { fields: _fields, workspaceIds: _workspaceIds, tagIds: _tagIds, providerId: _providerId, status: _status, searchableAt: _searchableAt, ...result } = document;
      void _fields;
      void _workspaceIds;
      void _tagIds;
      void _providerId;
      void _status;
      void _searchableAt;

      return {
        ...result,
        excerpt: createExcerpt(excerptSource, filter.query),
        matchedFields,
      };
    })
    .filter((result): result is SearchResult => result !== null)
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
}

export function searchLearningOS(data: SearchData, rawQuery: string): SearchResult[];
export function searchLearningOS(data: SearchData, filter: SearchFilter): SearchResult[];
export function searchLearningOS(
  data: SearchData,
  queryOrFilter: string | SearchFilter,
): SearchResult[] {
  if (typeof queryOrFilter === "string") {
    if (!queryOrFilter.trim()) return [];

    return applySearchFilter(toSearchDocuments(data), {
      query: queryOrFilter,
      entityTypes: [],
    });
  }

  return applySearchFilter(toSearchDocuments(data), queryOrFilter);
}
