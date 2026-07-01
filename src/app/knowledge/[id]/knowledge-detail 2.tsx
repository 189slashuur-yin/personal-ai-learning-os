"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";

type KnowledgeDetailState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; card: KnowledgeCard };

export function KnowledgeDetail({ cardId }: { cardId: string }) {
  const [state, setState] = useState<KnowledgeDetailState>({ status: "loading" });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const card = new BrowserKnowledgeCardStorage().getById(cardId);
      setState(card ? { status: "ready", card } : { status: "missing" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cardId]);

  if (state.status === "loading") {
    return <p className="workspace-shell text-sm text-zinc-500" role="status">正在读取 Knowledge…</p>;
  }

  if (state.status === "missing") {
    return (
      <main className="workspace-shell">
        <p className="eyebrow">Not found</p>
        <h1 className="workspace-title">Knowledge 不存在</h1>
        <Link className="mt-6 inline-block rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white" href="/knowledge">
          返回知识库
        </Link>
      </main>
    );
  }

  const createdAt = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(state.card.createdAt));

  return (
    <main className="workspace-shell pb-24">
      <Link className="text-sm font-medium text-zinc-500 hover:text-zinc-900" href="/knowledge">← 知识库</Link>
      <article className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Knowledge</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">{state.card.title}</h1>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${state.card.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
            {state.card.status}
          </span>
        </div>
        <section className="mt-8 border-t border-zinc-100 pt-6">
          <h2 className="text-sm font-semibold text-zinc-900">内容</h2>
          <p className="mt-3 whitespace-pre-wrap leading-8 text-zinc-700">{state.card.content}</p>
        </section>
        <dl className="mt-8 grid gap-4 border-t border-zinc-100 pt-6 text-sm sm:grid-cols-2">
          <div><dt className="text-zinc-500">来源</dt><dd className="mt-1 font-medium text-zinc-900">{state.card.sourceFile}</dd></div>
          <div><dt className="text-zinc-500">创建时间</dt><dd className="mt-1 font-medium text-zinc-900">{createdAt}</dd></div>
        </dl>
      </article>
    </main>
  );
}
