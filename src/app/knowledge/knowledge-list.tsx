"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Tag } from "@/core/entities/tag";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserTagStorage } from "@/infrastructure/storage/browser-tag-storage";

const PAGE_SIZE = 6;

type Filter = "All" | KnowledgeCard["status"];
type TagFilter = "All" | "Untagged" | string;
type Sort = "newest" | "oldest" | "title";

const filters: Filter[] = ["All", "Active", "Archived"];

type KnowledgeListItem = KnowledgeCard & {
  sourceConversationTitle?: string;
  missingSourceMessageCount: number;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function KnowledgeList() {
  const [cards, setCards] = useState<KnowledgeListItem[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Active");
  const [tagFilter, setTagFilter] = useState<TagFilter>("All");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const proposalStorage = new BrowserProposalStorage();
      const conversationStorage = new BrowserConversationStorage();
      setTags(new BrowserTagStorage().getAll());
      const availableMessageIds = new Set(
        new BrowserMessageStorage().getAll().map((message) => message.id),
      );
      setCards(
        new BrowserKnowledgeCardStorage().getAll().map((card) => {
          const proposal = proposalStorage.getById(card.proposalId);
          const conversationId =
            card.sourceConversationId ?? proposal?.conversationId;
          const conversation = conversationId
            ? conversationStorage.getById(conversationId)
            : null;

          return {
            ...card,
            sourceConversationId: conversationId,
            sourceMessageCount:
              card.sourceMessageCount ?? proposal?.sourceMessageIds?.length,
            sourceConversationTitle: conversation?.title,
            missingSourceMessageCount: (
              card.sourceMessageIds ?? proposal?.sourceMessageIds ?? []
            ).filter((messageId) => !availableMessageIds.has(messageId)).length,
          };
        }),
      );
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  const visibleCards = useMemo(() => {
    if (!cards) return [];

    const normalizedQuery = query.trim().toLocaleLowerCase();
    return cards
      .filter((card) => filter === "All" || card.status === filter)
      .filter((card) => {
        if (tagFilter === "All") return true;
        if (tagFilter === "Untagged") return card.tagIds.length === 0;
        return card.tagIds.includes(tagFilter);
      })
      .filter((card) =>
        [card.title, card.summary, card.content, card.sourceFile].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        ),
      )
      .sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title, "zh-CN");
        const direction = sort === "newest" ? -1 : 1;
        return direction * (Date.parse(a.createdAt) - Date.parse(b.createdAt));
      });
  }, [cards, filter, query, sort, tagFilter]);

  const tagsById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags],
  );

  if (!cards) {
    return <p className="mt-8 text-sm text-zinc-500" role="status">正在读取知识库…</p>;
  }

  const pageCount = Math.max(1, Math.ceil(visibleCards.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageCards = visibleCards.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <section className="mt-8">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label>
            <span className="sr-only">搜索知识</span>
            <input
              className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="搜索标题、内容或来源"
              type="search"
              value={query}
            />
          </label>
          <label>
            <span className="sr-only">排序</span>
            <select
              className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-700 outline-none focus:border-zinc-400"
              onChange={(event) => {
                setSort(event.target.value as Sort);
                setPage(1);
              }}
              value={sort}
            >
              <option value="newest">最新创建</option>
              <option value="oldest">最早创建</option>
              <option value="title">标题 A–Z</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
          <div className="flex rounded-lg bg-zinc-100 p-1">
            {filters.map((item) => (
              <button
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === item ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
                key={item}
                onClick={() => {
                  setFilter(item);
                  setPage(1);
                }}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          <p className="text-sm text-zinc-500">{visibleCards.length} 条知识</p>
        </div>
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Tags</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[{ id: "All", name: "All" }, { id: "Untagged", name: "Untagged" }, ...tags].map((tag) => (
              <button
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${tagFilter === tag.id ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"}`}
                key={tag.id}
                onClick={() => {
                  setTagFilter(tag.id);
                  setPage(1);
                }}
                type="button"
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pageCards.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <h2 className="font-semibold text-zinc-950">没有匹配的知识</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {cards.length === 0
              ? "接受 Proposal 后，知识会沉淀在这里。"
              : "试试调整搜索词或筛选条件。"}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {pageCards.map((card) => (
            <Link
              className="group flex min-h-52 flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
              href={`/knowledge/${card.id}`}
              key={card.id}
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="line-clamp-2 font-semibold leading-6 text-zinc-950">{card.title}</h2>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${card.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
                  {card.status}
                </span>
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-600">
                {card.summary}
              </p>
              {card.tagIds.length ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {card.tagIds.flatMap((tagId) => {
                    const tag = tagsById.get(tagId);
                    return tag ? (
                      <span
                        className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600"
                        key={tag.id}
                        style={tag.color ? { borderColor: tag.color, borderWidth: 1 } : undefined}
                      >
                        {tag.name}
                      </span>
                    ) : [];
                  })}
                </div>
              ) : null}
              <div className="mt-auto flex items-end justify-between gap-4 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
                <div className="min-w-0">
                  <p className="truncate">Source：{card.sourceFile}</p>
                  {card.sourceConversationTitle ? (
                    <p className="mt-1 truncate">
                      Conversation：{card.sourceConversationTitle}
                    </p>
                  ) : null}
                  {card.sourceMessageCount ? (
                    <p className="mt-1">来源 Messages：{card.sourceMessageCount} 条</p>
                  ) : null}
                  {card.missingSourceMessageCount > 0 ? (
                    <p className="mt-1 text-amber-700">原 Message 不可用，Evidence 快照仍可用</p>
                  ) : null}
                  <p className="mt-1">更新：{formatDate(card.updatedAt)}</p>
                </div>
                <span className="text-sm transition group-hover:translate-x-0.5">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <nav aria-label="知识分页" className="mt-6 flex items-center justify-center gap-3">
          <button
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            type="button"
          >
            上一页
          </button>
          <span className="text-sm text-zinc-500">{currentPage} / {pageCount}</span>
          <button
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            type="button"
          >
            下一页
          </button>
        </nav>
      ) : null}
    </section>
  );
}
