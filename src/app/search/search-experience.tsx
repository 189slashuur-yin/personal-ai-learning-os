"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProviderConfiguration } from "@/core/entities/provider-configuration";
import type { SearchEntityType } from "@/core/entities/search-filter";
import type { SearchResult } from "@/core/entities/search-result";
import type { Tag } from "@/core/entities/tag";
import {
  taskPriorities,
  taskStatuses,
  taskTypes,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "@/core/entities/task";
import type { Workspace } from "@/core/entities/workspace";
import {
  searchLearningOS,
  type SearchData,
} from "@/core/services/global-search";
import { ProviderConfigurationService } from "@/core/services/provider-configuration-service";
import { WorkspaceService } from "@/core/services/workspace-service";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserProviderConfigurationStorage } from "@/infrastructure/storage/browser-provider-configuration-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserTagStorage } from "@/infrastructure/storage/browser-tag-storage";
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";

type SearchCatalog = {
  data: SearchData;
  providers: ProviderConfiguration[];
  tags: Tag[];
  workspaces: Workspace[];
};

type SearchTypeFilter = "all" | SearchEntityType;

const groups: { type: SearchEntityType; label: string }[] = [
  { type: "conversation", label: "Conversations" },
  { type: "proposal", label: "Proposals" },
  { type: "knowledge", label: "Knowledge" },
  { type: "tag", label: "Tags" },
  { type: "workspace", label: "Workspaces" },
  { type: "task", label: "Tasks" },
];

const resultTypeLabels: Record<SearchEntityType, string> = {
  conversation: "Conversation",
  proposal: "Proposal",
  knowledge: "Knowledge",
  tag: "Tag",
  workspace: "Workspace",
  task: "Task",
};

const statusOptions = [
  "Pending",
  "Accepted",
  "Rejected",
  "Applied",
  "Active",
  "Archived",
];

function loadSearchCatalog(): SearchCatalog {
  const conversationStorage = new BrowserConversationStorage();
  const tags = new BrowserTagStorage().getAll();
  const workspaces = new WorkspaceService(
    new BrowserWorkspaceStorage(),
    conversationStorage,
  ).listWorkspaces();

  return {
    data: {
      conversations: conversationStorage.getAll(),
      sources: new BrowserSourceStorage().getAll(),
      proposals: new BrowserProposalStorage().getAll(),
      knowledgeCards: new BrowserKnowledgeCardStorage().getAll(),
      tags,
      workspaces,
      tasks: new BrowserTaskStorage().getAll(),
    },
    providers: new ProviderConfigurationService(
      new BrowserProviderConfigurationStorage(),
    ).listConfigurations(),
    tags,
    workspaces,
  };
}

function Highlight({ text, query }: { text: string; query: string }) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  const normalizedText = text.toLocaleLowerCase();
  let cursor = 0;
  let matchIndex = normalizedText.indexOf(normalizedQuery);

  while (matchIndex !== -1) {
    parts.push(text.slice(cursor, matchIndex));
    parts.push(
      <mark
        className="rounded-sm bg-amber-200 px-0.5 text-inherit"
        key={`${matchIndex}-${normalizedQuery}`}
      >
        {text.slice(matchIndex, matchIndex + normalizedQuery.length)}
      </mark>,
    );
    cursor = matchIndex + normalizedQuery.length;
    matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
  }

  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function formatDate(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "时间未知";

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ResultCard({ result, query }: { result: SearchResult; query: string }) {
  return (
    <Link
      className="group block border-t border-zinc-100 px-5 py-5 first:border-t-0 hover:bg-zinc-50"
      href={result.href}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-white">
              {resultTypeLabels[result.type]}
            </span>
            {result.workspaceName ? (
              <span className="truncate text-xs font-medium text-zinc-500">
                Workspace · {result.workspaceName}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 font-semibold text-zinc-950">
            <Highlight query={query} text={result.title} />
          </h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">
            <Highlight query={query} text={result.excerpt} />
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
            {result.tags?.map((tag) => (
              <span
                className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-medium text-zinc-600"
                key={tag}
              >
                #{tag}
              </span>
            ))}
            {result.providerName ? <span>Provider · {result.providerName}</span> : null}
            {result.taskStatus ? <span>Status · {result.taskStatus}</span> : null}
            {result.taskPriority ? <span>Priority · {result.taskPriority}</span> : null}
            {result.taskType ? <span>Type · {result.taskType}</span> : null}
            {result.dueDate ? <span>Due · {result.dueDate}</span> : null}
            {result.sourceRef ? <span>Source · {result.sourceRef.type}</span> : null}
            {result.updatedAt ? <span>更新 · {formatDate(result.updatedAt)}</span> : null}
            {result.matchedFields.length ? (
              <span>匹配 · {result.matchedFields.join("、")}</span>
            ) : null}
          </div>
        </div>
        <span className="mt-1 text-zinc-400 transition group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

export function SearchExperience({
  initialQuery = "",
  initialType,
  initialWorkspaceId = "",
}: {
  initialQuery?: string;
  initialType?: SearchEntityType;
  initialWorkspaceId?: string;
}) {
  const [catalog, setCatalog] = useState<SearchCatalog | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery.trim());
  const [typeFilter, setTypeFilter] = useState<SearchTypeFilter>(initialType ?? "all");
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [tagId, setTagId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [status, setStatus] = useState("");
  const [taskStatus, setTaskStatus] = useState<"" | TaskStatus>("");
  const [taskPriority, setTaskPriority] = useState<"" | TaskPriority>("");
  const [taskType, setTaskType] = useState<"" | TaskType>("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => setCatalog(loadSearchCatalog()), 0);
    return () => window.clearTimeout(loadTimer);
  }, []);

  useEffect(() => {
    if (!catalog) return;

    const timer = window.setTimeout(() => {
      const nextQuery = query.trim();
      const nextResults = searchLearningOS(catalog.data, {
        query: nextQuery,
        entityTypes: typeFilter === "all" ? [] : [typeFilter],
        workspaceId: workspaceId || undefined,
        tagId: tagId || undefined,
        providerId: providerId || undefined,
        status: status || undefined,
        taskStatus: taskStatus || undefined,
        taskPriority: taskPriority || undefined,
        taskType: taskType || undefined,
      });

      setDebouncedQuery(nextQuery);
      setResults(nextQuery ? nextResults : nextResults.slice(0, 12));

      const urlParams = new URLSearchParams();
      if (nextQuery) urlParams.set("q", nextQuery);
      if (workspaceId) urlParams.set("workspaceId", workspaceId);
      if (typeFilter !== "all") urlParams.set("type", typeFilter);
      const nextUrl = urlParams.size ? `/search?${urlParams.toString()}` : "/search";
      window.history.replaceState(null, "", nextUrl);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    catalog,
    providerId,
    query,
    status,
    tagId,
    taskPriority,
    taskStatus,
    taskType,
    typeFilter,
    workspaceId,
  ]);

  const hasFilters = Boolean(
    typeFilter !== "all" ||
      workspaceId ||
      tagId ||
      providerId ||
      status ||
      taskStatus ||
      taskPriority ||
      taskType,
  );

  function clearSearch() {
    setQuery("");
    setTypeFilter("all");
    setWorkspaceId("");
    setTagId("");
    setProviderId("");
    setStatus("");
    setTaskStatus("");
    setTaskPriority("");
    setTaskType("");
  }

  return (
    <>
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-3 rounded-xl border border-zinc-200 px-3 focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-100">
          <span aria-hidden="true" className="pl-1 text-lg text-zinc-400">⌕</span>
          <span className="sr-only">全局搜索</span>
          <input
            autoFocus
            className="min-w-0 flex-1 border-0 bg-transparent px-1 py-3 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、内容、来源、Task、Tag 或 Workspace…"
            type="search"
            value={query}
          />
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-semibold text-zinc-500">
            类型
            <select
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-700"
              onChange={(event) => setTypeFilter(event.target.value as SearchTypeFilter)}
              value={typeFilter}
            >
              <option value="all">全部类型</option>
              {groups.map((group) => (
                <option key={group.type} value={group.type}>{group.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-500">
            Workspace
            <select
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-700"
              onChange={(event) => setWorkspaceId(event.target.value)}
              value={workspaceId}
            >
              <option value="">全部 Workspace</option>
              {catalog?.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}{workspace.archivedAt ? " (Archived)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-500">
            Tag
            <select
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-700"
              onChange={(event) => setTagId(event.target.value)}
              value={tagId}
            >
              <option value="">全部 Tag</option>
              {catalog?.tags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-500">
            Provider
            <select
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-700"
              onChange={(event) => setProviderId(event.target.value)}
              value={providerId}
            >
              <option value="">全部 Provider</option>
              {catalog?.providers.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-500">
            状态
            <select
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-700"
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="">全部状态</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Task 筛选</p>
            <p className="mt-1 text-xs text-zinc-500">仅过滤 Task；其它类型结果会继续保留。</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-zinc-500">
              Status
              <select
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-700"
                onChange={(event) => setTaskStatus(event.target.value as "" | TaskStatus)}
                value={taskStatus}
              >
                <option value="">全部 Task Status</option>
                {taskStatuses.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-zinc-500">
              Priority
              <select
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-700"
                onChange={(event) => setTaskPriority(event.target.value as "" | TaskPriority)}
                value={taskPriority}
              >
                <option value="">全部 Priority</option>
                {taskPriorities.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-zinc-500">
              Type
              <select
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-700"
                onChange={(event) => setTaskType(event.target.value as "" | TaskType)}
                value={taskType}
              >
                <option value="">全部 Task Type</option>
                {taskTypes.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {query || hasFilters ? (
          <button
            className="mt-4 rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            onClick={clearSearch}
            type="button"
          >
            清除搜索与筛选
          </button>
        ) : null}
      </div>

      {!catalog ? (
        <p className="mt-8 text-sm text-zinc-500" role="status">正在读取本地搜索数据…</p>
      ) : results.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <p className="font-medium text-zinc-900">没有找到匹配结果</p>
          <p className="mt-2 text-sm text-zinc-500">试试更短的关键词，或减少筛选条件。</p>
        </div>
      ) : (
        <div className="mt-8 space-y-8" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-zinc-950">
                {debouncedQuery || hasFilters ? "搜索结果" : "最近更新"}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {debouncedQuery || hasFilters
                  ? `找到 ${results.length} 条结果`
                  : "按更新时间展示最近 12 条本地内容"}
              </p>
            </div>
          </div>

          {groups.map((group) => {
            const groupResults = results.filter((result) => result.type === group.type);
            if (groupResults.length === 0) return null;

            return (
              <section key={group.type}>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-zinc-950">{group.label}</h2>
                  <span className="rounded-full bg-zinc-200/70 px-2.5 py-1 text-xs font-semibold text-zinc-600">
                    {groupResults.length}
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                  {groupResults.map((result) => (
                    <ResultCard
                      key={`${result.type}-${result.id}`}
                      query={debouncedQuery}
                      result={result}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
