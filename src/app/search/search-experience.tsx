"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  searchLearningOS,
  type SearchResult,
  type SearchResultType,
} from "@/core/services/global-search";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";

const groups: { type: SearchResultType; label: string }[] = [
  { type: "conversation", label: "Conversation" },
  { type: "proposal", label: "Proposal" },
  { type: "knowledge", label: "Knowledge" },
];

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

function excerpt(text: string, query: string, length = 180) {
  if (!text) return "暂无内容摘要";
  const matchIndex = text.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase());
  const start = Math.max(0, matchIndex >= 0 ? matchIndex - 55 : 0);
  const value = text.slice(start, start + length).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${value}${start + length < text.length ? "…" : ""}`;
}

function ResultCard({ result, query }: { result: SearchResult; query: string }) {
  return (
    <Link
      className="group block border-t border-zinc-100 px-5 py-4 first:border-t-0 hover:bg-zinc-50"
      href={result.href}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-950">
            <Highlight query={query} text={result.title} />
          </h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">
            <Highlight query={query} text={excerpt(result.content, query)} />
          </p>
          <p className="mt-2 truncate text-xs text-zinc-500">
            来源：<Highlight query={query} text={result.source || "未标注"} />
          </p>
        </div>
        <span className="mt-1 text-zinc-400 transition group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

export function SearchExperience({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQuery = query.trim();
      setDebouncedQuery(nextQuery);
      setResults(
        nextQuery
          ? searchLearningOS(
              {
                conversations: new BrowserConversationStorage().getAll(),
                sources: new BrowserSourceStorage().getAll(),
                proposals: new BrowserProposalStorage().getAll(),
                knowledgeCards: new BrowserKnowledgeCardStorage().getAll(),
              },
              nextQuery,
            )
          : [],
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <>
      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-100">
        <label className="flex items-center gap-3">
          <span aria-hidden="true" className="pl-1 text-lg text-zinc-400">⌕</span>
          <span className="sr-only">全局搜索</span>
          <input
            autoFocus
            className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、内容或来源…"
            type="search"
            value={query}
          />
          {query ? (
            <button
              className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              onClick={() => setQuery("")}
              type="button"
            >
              清除
            </button>
          ) : null}
        </label>
      </div>

      {!debouncedQuery ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <p className="font-medium text-zinc-900">搜索整个 Learning OS</p>
          <p className="mt-2 text-sm text-zinc-500">Conversation、Proposal 和 Knowledge 都在这里。</p>
        </div>
      ) : results.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <p className="font-medium text-zinc-900">没有找到匹配结果</p>
          <p className="mt-2 text-sm text-zinc-500">试试更短的关键词，或按来源名称搜索。</p>
        </div>
      ) : (
        <div className="mt-8 space-y-8" aria-live="polite">
          <p className="text-sm text-zinc-500">找到 {results.length} 条结果</p>
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
                    <ResultCard key={`${result.type}-${result.id}`} query={debouncedQuery} result={result} />
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
