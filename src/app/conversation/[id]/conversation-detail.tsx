"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Conversation } from "@/core/entities/conversation";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";
import { analyzeSource } from "@/core/services/demo-analyzer";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";

type ConversationDetailProps = {
  conversationId: string;
};

type DetailState =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "ready";
      conversation: Conversation;
      source: ImportedSource | null;
      proposal: Proposal | null;
      knowledgeCard: KnowledgeCard | null;
    };

export function ConversationDetail({ conversationId }: ConversationDetailProps) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const conversation = new BrowserConversationStorage().getById(
        conversationId,
      );

      if (!conversation) {
        setState({ status: "missing" });
        return;
      }

      const source = new BrowserSourceStorage().getByConversationId(
        conversationId,
      );
      const currentProposal = new BrowserProposalStorage().getCurrent();
      const proposal =
        source && currentProposal?.sourceId === source.id
          ? currentProposal
          : null;
      const knowledgeCard = proposal
        ? new BrowserKnowledgeCardStorage().getByProposalId(proposal.id)
        : null;

      setDraft(source?.content ?? "");
      setState({
        status: "ready",
        conversation,
        source,
        proposal,
        knowledgeCard,
      });
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [conversationId]);

  if (state.status === "loading") {
    return (
      <p className="workspace-shell text-sm text-zinc-500" role="status">
        正在打开 Conversation…
      </p>
    );
  }

  if (state.status === "missing") {
    return (
      <main className="workspace-shell">
        <p className="eyebrow">Not found</p>
        <h1 className="workspace-title">Conversation 不存在</h1>
        <Link
          className="mt-6 inline-block rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white"
          href="/conversation"
        >
          返回 Conversation
        </Link>
      </main>
    );
  }

  const { conversation, source, proposal, knowledgeCard } = state;
  const updatedAt = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(conversation.updatedAt));

  function saveRawText() {
    if (state.status !== "ready" || !draft.trim()) {
      setFeedback("请先粘贴或输入原始文本。");
      return;
    }

    const timestamp = new Date().toISOString();
    const nextSource: ImportedSource = {
      id: state.source?.id ?? crypto.randomUUID(),
      conversationId: state.conversation.id,
      kind: "text",
      name:
        state.source?.name ??
        `${state.conversation.title}-${state.conversation.sourceType}.txt`,
      content: draft.trim(),
      importedAt: state.source?.importedAt ?? timestamp,
    };
    const nextConversation: Conversation = {
      ...state.conversation,
      updatedAt: timestamp,
    };

    new BrowserSourceStorage().save(nextSource);
    new BrowserConversationStorage().save(nextConversation);
    setState({
      ...state,
      conversation: nextConversation,
      source: nextSource,
      proposal: null,
      knowledgeCard: null,
    });
    setFeedback("原始文本已保存。现在可以运行 Demo Analyzer。");
  }

  function runDemoAnalyzer() {
    if (state.status !== "ready" || !state.source) {
      return;
    }

    const nextProposal = analyzeSource(state.source);
    new BrowserProposalStorage().saveCurrent(nextProposal);
    setState({
      ...state,
      proposal: nextProposal,
      knowledgeCard: null,
    });
    setFeedback("已生成 1 条 Proposal。");
  }

  return (
    <main className="workspace-shell pb-24">
      <Link
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
        href="/conversation"
      >
        ← Conversation
      </Link>

      <header className="mt-8 border-b border-zinc-200 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="eyebrow">Conversation workspace</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              {conversation.title}
            </h1>
          </div>
          <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 shadow-sm">
            {conversation.sourceType}
          </span>
        </div>
      </header>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">01 · Context</p>
          <h2 className="detail-title">Conversation 信息</h2>
        </div>
        <dl className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">来源</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {conversation.sourceType}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">更新时间</dt>
            <dd className="mt-1 font-medium text-zinc-900">{updatedAt}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">原始文本</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {source ? `${source.content.length} 字符` : "尚未保存"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">02 · Source</p>
          <h2 className="detail-title">原始文本 Preview</h2>
          <p className="detail-description">
            可直接使用 Ctrl+V 粘贴完整文本；Sprint2 暂不拆分 Message。
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <textarea
            className="min-h-64 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-sm leading-7 text-zinc-800 outline-none focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-100"
            onChange={(event) => {
              setDraft(event.target.value);
              setFeedback(null);
            }}
            placeholder="在这里粘贴 ChatGPT、Claude、DeepSeek、Markdown 或其他原始文本…"
            value={draft}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-500" role="status">
              {feedback ?? `${draft.length} 字符`}
            </p>
            <button
              className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
              onClick={saveRawText}
              type="button"
            >
              保存原始文本
            </button>
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">03 · Distill</p>
          <h2 className="detail-title">AI 提炼</h2>
          <p className="detail-description">
            当前继续使用 Sprint1 的 Demo Analyzer，不调用任何 AI。
          </p>
        </div>
        {proposal ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {proposal.generatedBy}
            </p>
            <h3 className="mt-2 font-semibold text-zinc-950">
              {proposal.title}
            </h3>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-600">
              {proposal.summary}
            </p>
            <Link
              className="mt-5 inline-block rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              href="/review"
            >
              前往整理建议
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5">
            <p className="text-sm text-zinc-600">
              {source ? "原始文本已就绪。" : "请先保存原始文本。"}
            </p>
            <button
              className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
              disabled={!source}
              onClick={runDemoAnalyzer}
              type="button"
            >
              运行 Demo Analyzer
            </button>
          </div>
        )}
      </section>

      <section className="detail-section">
        <div className="detail-section-heading">
          <p className="detail-kicker">04 · Knowledge</p>
          <h2 className="detail-title">KnowledgeCard</h2>
        </div>
        {knowledgeCard ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-semibold text-zinc-950">
                {knowledgeCard.title}
              </h3>
              <span className="text-xs font-semibold text-emerald-700">
                {knowledgeCard.status}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-700">
              {knowledgeCard.content}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-500">
            接受 Proposal 后，KnowledgeCard 会显示在这里。
          </div>
        )}
      </section>
    </main>
  );
}
