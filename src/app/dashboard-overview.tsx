"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Conversation } from "@/core/entities/conversation";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";

type DashboardData = {
  conversationCount: number;
  knowledgeCount: number;
  proposalCount: number;
  recentConversations: Conversation[];
  recentKnowledge: KnowledgeCard[];
  latestUpdatedAt: string | null;
  latestOpenedAt: string | null;
};

function formatDashboardTime(timestamp: string | null) {
  if (!timestamp) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function DashboardOverview() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const conversations = new BrowserConversationStorage().getAll();
      const activeKnowledge = new BrowserKnowledgeCardStorage()
        .getAll()
        .filter((card) => card.status === "Active")
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      const recentConversations = [...conversations].sort(
        (left, right) =>
          new Date(right.lastOpenedAt).getTime() -
          new Date(left.lastOpenedAt).getTime(),
      );

      setData({
        conversationCount: conversations.length,
        knowledgeCount: activeKnowledge.length,
        proposalCount: new BrowserProposalStorage().getAll().length,
        recentConversations: recentConversations.slice(0, 4),
        recentKnowledge: activeKnowledge.slice(0, 4),
        latestUpdatedAt:
          conversations
            .map((conversation) => conversation.updatedAt)
            .sort((left, right) => right.localeCompare(left))[0] ?? null,
        latestOpenedAt: recentConversations[0]?.lastOpenedAt ?? null,
      });
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  if (!data) {
    return (
      <p className="mt-10 text-sm text-zinc-500" role="status">
        正在读取工作区…
      </p>
    );
  }

  const stats = [
    { label: "Conversation", value: data.conversationCount },
    { label: "Knowledge", value: data.knowledgeCount },
    { label: "Proposal", value: data.proposalCount },
    { label: "最近更新时间", value: formatDashboardTime(data.latestUpdatedAt) },
    { label: "最后打开时间", value: formatDashboardTime(data.latestOpenedAt) },
  ];

  return (
    <>
      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
            key={stat.label}
          >
            <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
            <p className="mt-3 text-xl font-semibold tracking-tight text-zinc-950 lg:text-2xl">
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Recent</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">
              最近 Conversation
            </h2>
          </div>
          <Link
            className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
            href="/conversation"
          >
            查看全部 →
          </Link>
        </div>

        {data.recentConversations.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
            <p className="text-sm text-zinc-500">
              暂无 Conversation，先创建一个工作区。
            </p>
            <Link
              className="mt-4 inline-block rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white"
              href="/conversation"
            >
              前往 Conversation
            </Link>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {data.recentConversations.map((conversation, index) => (
              <Link
                className={`flex items-center justify-between gap-4 px-5 py-4 hover:bg-zinc-50 ${index > 0 ? "border-t border-zinc-100" : ""}`}
                href={`/conversation/${conversation.id}`}
                key={conversation.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">
                    {conversation.title}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {conversation.sourceType} · 更新 {formatDashboardTime(conversation.updatedAt)} · 打开 {formatDashboardTime(conversation.lastOpenedAt)}
                  </p>
                </div>
                <span className="text-sm text-zinc-400">→</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Knowledge Recent</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">最近知识</h2>
          </div>
          <Link className="text-sm font-medium text-zinc-600 hover:text-zinc-950" href="/knowledge">
            查看全部 →
          </Link>
        </div>

        {data.recentKnowledge.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
            暂无 Active Knowledge。
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {data.recentKnowledge.map((card) => (
              <Link className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-zinc-300 hover:shadow-md" href={`/knowledge/${card.id}`} key={card.id}>
                <h3 className="truncate font-medium text-zinc-950">{card.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">{card.content}</p>
                <p className="mt-4 truncate border-t border-zinc-100 pt-3 text-xs text-zinc-500">{card.sourceFile}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
