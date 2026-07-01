"use client";

import { useEffect, useState } from "react";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";

type KnowledgeState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; card: KnowledgeCard };

export function KnowledgeCardView() {
  const [state, setState] = useState<KnowledgeState>({ status: "loading" });

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const card = new BrowserKnowledgeCardStorage().getFirst();
      setState(card ? { status: "ready", card } : { status: "empty" });
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  if (state.status === "loading") {
    return (
      <p className="mt-8 text-sm text-zinc-500" role="status">
        正在读取 KnowledgeCard…
      </p>
    );
  }

  if (state.status === "empty") {
    return (
      <section className="mt-8 max-w-2xl rounded-xl border border-zinc-200 bg-white p-6">
        <p className="font-medium text-zinc-950">还没有 KnowledgeCard</p>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          接受一条 Proposal 后，第一张知识卡会显示在这里。
        </p>
      </section>
    );
  }

  const createdAt = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(state.card.createdAt));

  return (
    <article className="mt-8 max-w-2xl space-y-6 rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
          {state.card.title}
        </h2>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          {state.card.status}
        </span>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-zinc-900">内容</h3>
        <p className="mt-2 leading-7 text-zinc-700">{state.card.content}</p>
      </section>

      <dl className="grid gap-4 border-t border-zinc-200 pt-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-zinc-500">来源文件</dt>
          <dd className="mt-1 text-zinc-900">{state.card.sourceFile}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">创建时间</dt>
          <dd className="mt-1 text-zinc-900">{createdAt}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">当前状态</dt>
          <dd className="mt-1 text-zinc-900">{state.card.status}</dd>
        </div>
      </dl>
    </article>
  );
}
