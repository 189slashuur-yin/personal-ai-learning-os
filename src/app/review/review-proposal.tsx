"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Proposal } from "@/core/entities/proposal";
import { KnowledgeReuseAudit } from "@/app/knowledge-reuse-audit";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Conversation } from "@/core/entities/conversation";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";
import { createKnowledgeCard } from "@/core/services/knowledge-card-creation";
import { RoundKnowledgeService } from "@/core/services/round-knowledge-service";
import {
  acceptProposal,
  applyProposal,
  rejectProposal,
} from "@/core/services/proposal-review";
import { resolveProposalReviewLookup } from "@/core/services/proposal-review-lookup";
import { BrowserAppEventLogStorage } from "@/infrastructure/storage/browser-feedback-storage";
import {
  createStorageInstances,
  ensureIndexedDBLoaded,
  getStorageMode,
} from "@/infrastructure/storage/storage-factory";
import { CapabilityBadges } from "@/app/capability-badges";
import { persistIndexedDBReviewDecision } from "./review-persistence";

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
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      async function load() {
        if (getStorageMode() === "indexedDB") {
          await ensureIndexedDBLoaded();
        }
        const storages = createStorageInstances();
        const proposal = proposalId
          ? storages.proposals.getById(proposalId)
          : storages.proposals.getCurrent();
        const conversation = proposal?.conversationId
          ? storages.conversations.getById(proposal.conversationId)
          : null;
        const sourceMessageIdSet = new Set(proposal?.sourceMessageIds ?? []);
        const round = proposal?.sourceRoundId
          ? storages.rounds.getById(proposal.sourceRoundId)
          : null;
        const sourceMessages = proposal?.conversationId
          ? storages.messages
              .getByConversationId(proposal.conversationId)
              .filter((message) => sourceMessageIdSet.has(message.id))
          : [];

        const reviewLookup = resolveProposalReviewLookup(proposal);
        setState(
          reviewLookup.status === "ready"
            ? {
                status: "ready",
                proposal: reviewLookup.proposal,
                conversation,
                round,
                sourceMessages,
              }
            : reviewLookup,
        );
      }
      void load().catch(() => setState({ status: "missing-proposal" }));
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [proposalId]);

  if (state.status === "loading") {
    return (
      <p className="mt-8 text-sm text-zinc-500" role="status">
        正在读取 AI 整理建议…
      </p>
    );
  }

  if (state.status === "missing-proposal") {
    return (
      <section className="mt-8 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-medium text-amber-950">Proposal 不存在或已删除</p>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          该链接不会回退到缓存或旧指针。你可以返回 Search 或重新生成整理建议。
        </p>
        <Link
          className="mt-5 inline-block rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white"
          href="/search?type=proposal"
        >
          返回 Proposal Search
        </Link>
      </section>
    );
  }

  async function persistReviewDecision(
    expectedProposal: Proposal,
    proposal: Proposal,
    card?: KnowledgeCard,
    expectedCard?: KnowledgeCard,
  ) {
    const storages = createStorageInstances();
    if (getStorageMode() === "indexedDB") {
      await persistIndexedDBReviewDecision(
        expectedProposal,
        proposal,
        card,
        expectedCard,
      );
      return;
    }
    if (card) {
      const existing = storages.knowledgeCards.getById(card.id);
      if (existing) storages.knowledgeCards.update(card);
      else storages.knowledgeCards.save(card);
    }
    storages.proposals.saveCurrent(proposal);
  }

  async function handleAccept() {
    if (state.status !== "ready" || state.proposal.status !== "Pending") {
      return;
    }

    const storages = createStorageInstances();
    const proposalStorage = storages.proposals;
    const knowledgeStorage = storages.knowledgeCards;
    setReviewError(null);
    if (state.proposal.purpose === "knowledge-update") {
      const targetCard = state.proposal.targetKnowledgeId
        ? knowledgeStorage.getById(state.proposal.targetKnowledgeId)
        : null;
      const updated = new RoundKnowledgeService(
        knowledgeStorage,
        proposalStorage,
      ).prepareUpdate(state.proposal);
      if (!targetCard || !updated) {
        setReviewError(
          "目标 Knowledge 已不存在，更新建议未接受，也不会错误创建新的 Knowledge。",
        );
        return;
      }
      const appliedProposal = applyProposal(acceptProposal(state.proposal));
      try {
        await persistReviewDecision(
          state.proposal,
          appliedProposal,
          updated,
          targetCard,
        );
        router.push(`/knowledge/${updated.id}`);
      } catch (error) {
        setReviewError(
          error instanceof Error
            ? `接受失败：${error.message}`
            : "接受失败，持久化状态未确认。",
        );
      }
      return;
    }
    const existingCard = knowledgeStorage.getByProposalId(state.proposal.id);

    if (existingCard) {
      const appliedProposal = applyProposal(state.proposal);
      try {
        await persistReviewDecision(state.proposal, appliedProposal);
        setState({ ...state, proposal: appliedProposal });
        router.push(`/knowledge/${existingCard.id}`);
      } catch (error) {
        setReviewError(
          error instanceof Error
            ? `接受失败：${error.message}`
            : "接受失败，持久化状态未确认。",
        );
      }
      return;
    }

    const acceptedProposal = acceptProposal(state.proposal);
    new BrowserAppEventLogStorage().record("proposal accepted", state.proposal.id);
    const knowledgeCard = createKnowledgeCard(acceptedProposal);

    if (knowledgeCard) {
      try {
        await persistReviewDecision(
          state.proposal,
          applyProposal(acceptedProposal),
          knowledgeCard,
        );
        new BrowserAppEventLogStorage().record("knowledge created", knowledgeCard.id);
        router.push(`/knowledge/${knowledgeCard.id}`);
      } catch (error) {
        setReviewError(
          error instanceof Error
            ? `接受失败：${error.message}`
            : "接受失败，持久化状态未确认。",
        );
      }
      return;
    }

    router.push("/knowledge");
  }

  async function handleReject() {
    if (state.status !== "ready" || state.proposal.status !== "Pending") {
      return;
    }

    const rejectedProposal = rejectProposal(state.proposal);
    setReviewError(null);
    try {
      await persistReviewDecision(state.proposal, rejectedProposal);
      setState({ ...state, proposal: rejectedProposal });
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? `拒绝失败：${error.message}`
          : "拒绝失败，持久化状态未确认。",
      );
    }
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
      {reviewError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {reviewError}
        </p>
      ) : null}
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
        <KnowledgeReuseAudit items={state.proposal.knowledgeReuseAudit} showUnrecorded />
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
          {isPending ? "确认加入知识库" : `已处理：${state.proposal.status}`}
        </button>
        <button
          className="rounded-lg border border-red-200 px-5 py-3 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!isPending}
          onClick={handleReject}
          type="button"
        >
          拒绝整理建议
        </button>
      </div>
    </article>
  );
}
