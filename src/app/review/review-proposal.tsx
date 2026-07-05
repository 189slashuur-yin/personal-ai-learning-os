"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Proposal } from "@/core/entities/proposal";
import type { Conversation } from "@/core/entities/conversation";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { createKnowledgeCard } from "@/core/services/knowledge-card-creation";
import {
  acceptProposal,
  applyProposal,
  rejectProposal,
} from "@/core/services/proposal-review";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { CapabilityBadges } from "@/app/capability-badges";

type ReviewState =
  | { status: "loading" }
  | { status: "missing-proposal" }
  | {
      status: "ready";
      proposal: Proposal;
      conversation: Conversation | null;
      round: Round | null;
      sourceMessages: Message[];
    };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ReviewProposal({ proposalId }: { proposalId?: string }) {
  const router = useRouter();
  const [state, setState] = useState<ReviewState>({ status: "loading" });

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const storage = new BrowserProposalStorage();
      const proposal = proposalId
        ? storage.getById(proposalId)
        : storage.getCurrent();

      const conversation = proposal?.conversationId
        ? new BrowserConversationStorage().getById(proposal.conversationId)
        : null;
      const sourceMessageIdSet = new Set(proposal?.sourceMessageIds ?? []);
      const round = proposal?.sourceRoundId
        ? new BrowserRoundStorage().getById(proposal.sourceRoundId)
        : null;
      const sourceMessages = proposal?.conversationId
        ? new BrowserMessageStorage()
            .getByConversationId(proposal.conversationId)
            .filter((message) => sourceMessageIdSet.has(message.id))
        : [];

      setState(
        proposal
          ? { status: "ready", proposal, conversation, round, sourceMessages }
          : { status: "missing-proposal" },
      );
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [proposalId]);

  if (state.status === "loading") {
    return (
      <p className="mt-8 text-sm text-zinc-500" role="status">
        正在读取 Proposal…
      </p>
    );
  }

  if (state.status === "missing-proposal") {
    return (
      <section className="mt-8 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-medium text-amber-950">尚未找到 Proposal</p>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          请先完成 TXT 导入和 Demo Analyzer 分析，再回来审核。
        </p>
        <Link
          className="mt-5 inline-block rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white"
          href="/analysis"
        >
          返回 Analysis 页面
        </Link>
      </section>
    );
  }

  function handleAccept() {
    if (state.status !== "ready" || state.proposal.status !== "Pending") {
      return;
    }

    const proposalStorage = new BrowserProposalStorage();
    const knowledgeStorage = new BrowserKnowledgeCardStorage();
    const existingCard = knowledgeStorage.getByProposalId(state.proposal.id);

    if (existingCard) {
      const appliedProposal = applyProposal(state.proposal);
      proposalStorage.saveCurrent(appliedProposal);
      setState({ ...state, proposal: appliedProposal });
      router.push(`/knowledge/${existingCard.id}`);
      return;
    }

    const acceptedProposal = acceptProposal(state.proposal);
    const knowledgeCard = createKnowledgeCard(acceptedProposal);

    if (knowledgeCard) {
      knowledgeStorage.save(knowledgeCard);
      proposalStorage.saveCurrent(applyProposal(acceptedProposal));
      router.push(`/knowledge/${knowledgeCard.id}`);
      return;
    }

    router.push("/knowledge");
  }

  function handleReject() {
    if (state.status !== "ready" || state.proposal.status !== "Pending") {
      return;
    }

    const rejectedProposal = rejectProposal(state.proposal);
    new BrowserProposalStorage().saveCurrent(rejectedProposal);
    setState({ ...state, proposal: rejectedProposal });
  }

  const isPending = state.proposal.status === "Pending";
  const missingMessageCount = Math.max(
    0,
    (state.proposal.sourceMessageIds?.length ?? 0) - state.sourceMessages.length,
  );
  const analysisMode =
    state.proposal.sourceType ?? state.proposal.analysisMode ??
    (state.proposal.sourceMessageIds?.length ? "messages" : "source");

  return (
    <article className="mt-8 max-w-2xl space-y-6 rounded-xl border border-zinc-200 bg-white p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {state.proposal.generatedBy}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
          {state.proposal.title}
        </h2>
        {state.conversation ? (
          <p className="mt-2 text-sm text-zinc-500">
            所属 Conversation：
            <Link
              className="font-medium text-zinc-800 hover:underline"
              href={`/conversation/${state.conversation.id}`}
            >
              {state.conversation.title}
            </Link>
          </p>
        ) : null}
        {state.round ? (
          <p className="mt-2 text-sm text-zinc-500">
            来源 Round：<Link className="font-medium text-zinc-800 hover:underline" href={`/conversation/${state.round.conversationId}?round=${encodeURIComponent(state.round.id)}#round-${state.round.id}`}>{state.round.title}</Link>
          </p>
        ) : state.proposal.sourceRoundId ? (
          <p className="mt-2 text-sm text-amber-700">来源 Round 已不可用；Evidence 快照仍保留。</p>
        ) : null}
      </div>

      <dl className="grid gap-4 rounded-lg bg-zinc-50 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Generated by</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            {state.proposal.generatedBy}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Provider</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            {state.proposal.providerName ?? "Unknown Provider (legacy)"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-zinc-500">Generated using · Capability</dt>
          <dd className="mt-2">
            <CapabilityBadges
              capabilities={state.proposal.providerCapabilities}
            />
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Generated at</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            {formatDate(
              state.proposal.generatedAt ?? state.proposal.createdAt,
            )}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Source type</dt>
          <dd className="mt-1 font-medium capitalize text-zinc-900">
            {analysisMode}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Confidence</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            {state.proposal.confidence === undefined
              ? "unknown"
              : `${Math.round(state.proposal.confidence * 100)}%`}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Risk level</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            {state.proposal.riskLevel ?? "legacy"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Suggested action</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            {state.proposal.suggestedAction ?? "legacy"}
          </dd>
        </div>
        {analysisMode === "messages" || analysisMode === "round" ? (
          <div>
            <dt className="text-zinc-500">Selected message count</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {state.proposal.sourceMessageIds?.length ?? 0}
            </dd>
          </div>
        ) : null}
      </dl>

      <section>
        <h3 className="text-sm font-semibold text-zinc-900">Summary（摘要）</h3>
        <p className="mt-2 leading-7 text-zinc-700">{state.proposal.summary}</p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-zinc-900">来源证据</h3>
        <div className="mt-2 rounded-lg bg-zinc-50 p-4">
          <p className="text-sm font-medium text-zinc-600">
            {state.proposal.sourceEvidence.sourceName}
          </p>
          <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-zinc-300 pl-4 leading-7 text-zinc-700">
            {state.proposal.sourceEvidence.excerpt}
          </blockquote>
          {state.proposal.sourceMessageIds?.length ? (
            <div className="mt-4 border-t border-zinc-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                来源 Messages · {state.proposal.sourceMessageIds.length} 条
              </p>
              {state.sourceMessages.length ? (
                <ol className="mt-3 space-y-3">
                  {state.sourceMessages.map((message) => (
                    <li className="rounded-md border border-zinc-200 bg-white p-3" key={message.id}>
                      <p className="text-xs font-semibold capitalize text-zinc-500">
                        {message.role} · #{message.order + 1}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                        {message.content}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : null}
              {missingMessageCount > 0 ? (
                <p className="mt-2 text-xs text-zinc-500">
                  {missingMessageCount} 条原始 Message 已不可用；Evidence 快照仍可用。
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={!isPending}
          onClick={handleAccept}
          type="button"
        >
          {isPending ? "接受并生成 KnowledgeCard" : `已处理：${state.proposal.status}`}
        </button>
        <button
          className="rounded-lg border border-red-200 px-5 py-3 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!isPending}
          onClick={handleReject}
          type="button"
        >
          拒绝 Proposal
        </button>
      </div>
    </article>
  );
}
