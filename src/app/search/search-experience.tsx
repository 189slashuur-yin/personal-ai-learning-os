"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  SearchDocumentEntityType,
  SearchDocumentMatch,
} from "@/core/entities/search-document";
import type { Workspace } from "@/core/entities/workspace";
import { SearchIndexService } from "@/core/services/search-index-service";
import { WorkspaceService } from "@/core/services/workspace-service";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserTagStorage } from "@/infrastructure/storage/browser-tag-storage";
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { BrowserAssetStorage } from "@/infrastructure/storage/browser-asset-storage";

type SearchCatalog = {
  service: SearchIndexService;
  workspaces: Workspace[];
};

type SearchTypeFilter = "all" | SearchDocumentEntityType;

const groups: { type: SearchDocumentEntityType; label: string }[] = [
  { type: "conversation", label: "Conversations" },
  { type: "knowledge", label: "已确认知识" },
  { type: "round", label: "Rounds" },
  { type: "proposal", label: "AI 整理建议" },
  { type: "asset", label: "Assets" },
  { type: "task", label: "Tasks" },
  { type: "message", label: "Raw Messages (advanced)" },
];

const defaultSearchTypes: SearchDocumentEntityType[] = [
  "conversation",
  "knowledge",
  "round",
  "proposal",
  "asset",
  "task",
];

const resultTypeLabels: Record<SearchDocumentEntityType, string> = {
  workspace: "Workspace",
  conversation: "Conversation",
  round: "Round",
  source: "Source",
  message: "Message",
  "qa-pair": "Q&A Pair",
  proposal: "AI 整理建议 · 未确认",
  knowledge: "已确认知识",
  task: "Task",
  asset: "Asset",
  tag: "Tag",
};

function loadSearchCatalog(): SearchCatalog {
  const conversationStorage = new BrowserConversationStorage();
  const workspaces = new WorkspaceService(
    new BrowserWorkspaceStorage(),
    conversationStorage,
  ).listWorkspaces();
  const service = new SearchIndexService({
    workspaces,
    conversations: conversationStorage.getAll(),
    sources: new BrowserSourceStorage().getAll(),
    messages: new BrowserMessageStorage().getAll(),
    rounds: new BrowserRoundStorage().getAll(),
    proposals: new BrowserProposalStorage().getAll(),
    knowledgeCards: new BrowserKnowledgeCardStorage().getAll(),
    tasks: new BrowserTaskStorage().getAll(),
    tags: new BrowserTagStorage().getAll(),
    assets: new BrowserAssetStorage().getAll(),
  });
  service.buildDocuments();
  return { service, workspaces };
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

function ResultCard({ result, query }: { result: SearchDocumentMatch; query: string }) {
  return (
    <article
      className="group block border-t border-zinc-100 px-5 py-5 first:border-t-0 hover:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-white">
              {resultTypeLabels[result.entityType]}
            </span>
            {result.workspaceName ? (
              <span className="text-xs font-medium text-zinc-500">
                Workspace · {result.workspaceName}
              </span>
            ) : null}
            <span className="text-xs text-zinc-400">Score · {result.score}</span>
            {query ? (
              <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-zinc-500">
                {result.matchMode}
              </span>
            ) : null}
          </div>
          <Link className="mt-2 block font-semibold text-zinc-950" href={result.href}>
            <Highlight query={query} text={result.title} />
          </Link>
          {result.sourcePath ? (
            <p className="mt-1 text-xs font-medium text-sky-700">{result.sourcePath}</p>
          ) : null}
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-600">
            <Highlight query={query} text={result.snippet} />
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
            {result.sourceLabel ? <span>来源 · {result.sourceLabel}</span> : null}
            {result.tags?.map((tag) => <span key={tag}>#{tag}</span>)}
            {result.updatedAt ? <span>更新 · {formatDate(result.updatedAt)}</span> : null}
            {result.matchedFields.length ? (
              <span>匹配字段 · {result.matchedFields.join("、")}</span>
            ) : null}
          </div>
          {result.entityType === "knowledge" && typeof result.metadata?.sourceRoundId === "string" && typeof result.metadata?.conversationId === "string" ? <Link className="mt-3 inline-block text-xs font-semibold text-sky-700" href={`/conversation/${result.metadata.conversationId}?mode=workspace&round=${encodeURIComponent(result.metadata.sourceRoundId)}`}>查看来源 Round →</Link> : null}
        </div>
        <Link aria-label={`打开 ${result.title}`} className="mt-1 text-zinc-400 transition group-hover:translate-x-0.5" href={result.href}>→</Link>
      </div>
    </article>
  );
}

export function SearchExperience({
  initialQuery = "",
  initialType,
  initialWorkspaceId = "",
}: {
  initialQuery?: string;
  initialType?: SearchDocumentEntityType;
  initialWorkspaceId?: string;
}) {
  const [catalog, setCatalog] = useState<SearchCatalog | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery.trim());
  const [typeFilter, setTypeFilter] = useState<SearchTypeFilter>(initialType ?? "all");
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [results, setResults] = useState<SearchDocumentMatch[]>([]);
  const [advancedMode, setAdvancedMode] = useState(initialType === "message");

  useEffect(() => {
    const timer = window.setTimeout(() => setCatalog(loadSearchCatalog()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!catalog) return;
    const timer = window.setTimeout(() => {
      const nextQuery = query.trim();
      const nextResults = catalog.service.searchDocuments(nextQuery, {
        entityTypes:
          typeFilter === "all"
            ? advancedMode
              ? [...defaultSearchTypes, "message"]
              : defaultSearchTypes
            : [typeFilter],
        workspaceId: workspaceId || undefined,
      });
      setDebouncedQuery(nextQuery);
      setResults(nextQuery ? nextResults : nextResults.slice(0, 12));

      const params = new URLSearchParams();
      if (nextQuery) params.set("q", nextQuery);
      if (workspaceId) params.set("workspaceId", workspaceId);
      if (typeFilter !== "all") params.set("type", typeFilter);
      window.history.replaceState(
        null,
        "",
        params.size ? `/search?${params.toString()}` : "/search",
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [advancedMode, catalog, query, typeFilter, workspaceId]);

  const groupedResults = useMemo(
    () => groups.map((group) => ({
      ...group,
      results: results.filter((result) => result.entityType === group.type),
    })),
    [results],
  );
  const hasFilters = typeFilter !== "all" || Boolean(workspaceId);

  function clearSearch() {
    setQuery("");
    setTypeFilter("all");
    setWorkspaceId("");
  }

  return (
    <>
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-3 rounded-xl border border-zinc-200 px-3 focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-100">
          <span aria-hidden="true" className="pl-1 text-lg text-zinc-400">⌕</span>
          <span className="sr-only">全文搜索</span>
          <input
            autoFocus
            className="min-w-0 flex-1 border-0 bg-transparent px-1 py-3 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 Conversation、已确认知识、Round、AI 整理建议、Asset…"
            type="search"
            value={query}
          />
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-zinc-500">
            Entity Type
            <select
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal text-zinc-700"
              onChange={(event) => setTypeFilter(event.target.value as SearchTypeFilter)}
              value={typeFilter}
            >
              <option value="all">全部类型</option>
              {defaultSearchTypes.concat(advancedMode ? ["message"] : []).map((type) => (
                <option key={type} value={type}>{resultTypeLabels[type]}</option>
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
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
          <input checked={advancedMode} onChange={(event) => { setAdvancedMode(event.target.checked); if (!event.target.checked && typeFilter === "message") setTypeFilter("all"); }} type="checkbox" />
          高级模式：包含 Raw Message
        </label>
        <p className="mt-2 text-xs text-zinc-500">Fuzzy 是字符子序列匹配，不是语义搜索、Embedding 或 RAG。</p>
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
        <p className="mt-8 text-sm text-zinc-500" role="status">正在构建本地全文索引…</p>
      ) : results.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <p className="font-medium text-zinc-900">没有找到匹配结果</p>
          <p className="mt-2 text-sm text-zinc-500">试试更完整的关键词，或减少筛选条件。</p>
        </div>
      ) : (
        <div className="mt-8 space-y-8" aria-live="polite">
          <div>
            <h2 className="font-semibold text-zinc-950">
              {debouncedQuery || hasFilters ? "按相关度排序的搜索结果" : "最近更新"}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {debouncedQuery || hasFilters
                ? `找到 ${results.length} 个具体文本单元`
                : "按更新时间展示最近 12 个本地文本单元"}
            </p>
          </div>
          {groupedResults.map((group) => group.results.length ? (
            <section key={group.type}>
              <div className="mb-3 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-zinc-950">{group.label}</h2>
                <span className="rounded-full bg-zinc-200/70 px-2.5 py-1 text-xs font-semibold text-zinc-600">
                  {group.results.length}
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                {group.results.map((result) => (
                  <ResultCard key={result.id} query={debouncedQuery} result={result} />
                ))}
              </div>
            </section>
          ) : null)}
        </div>
      )}
    </>
  );
}
