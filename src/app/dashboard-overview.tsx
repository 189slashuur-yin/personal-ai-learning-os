"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Conversation } from "@/core/entities/conversation";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";

type DashboardData = {
  conversationCount: number;
  knowledgeCount: number;
  proposalCount: number;
  recentConversations: Conversation[];
};

export function DashboardOverview() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const conversations = new BrowserConversationStorage().getAll();

      setData({
        conversationCount: conversations.length,
        knowledgeCount: new BrowserKnowledgeCardStorage().getAll().length,
        proposalCount: new BrowserProposalStorage().getCurrent() ? 1 : 0,
        recentConversations: conversations.slice(0, 4),
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
  ];

  return (
    <>
      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
            key={stat.label}
          >
            <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
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
                    {conversation.sourceType}
                  </p>
                </div>
                <span className="text-sm text-zinc-400">→</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
