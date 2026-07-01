"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Proposal } from "@/core/entities/proposal";
import { createKnowledgeCard } from "@/core/services/knowledge-card-creation";
import { acceptProposal } from "@/core/services/proposal-review";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";

type ReviewState =
  | { status: "loading" }
  | { status: "missing-proposal" }
  | { status: "ready"; proposal: Proposal };

export function ReviewProposal({ proposalId }: { proposalId?: string }) {
  const router = useRouter();
  const [state, setState] = useState<ReviewState>({ status: "loading" });

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const storage = new BrowserProposalStorage();
      const proposal = proposalId
        ? storage.getById(proposalId)
        : storage.getCurrent();

      setState(
        proposal
          ? { status: "ready", proposal }
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
    if (state.status !== "ready") {
      return;
    }

    const acceptedProposal = acceptProposal(state.proposal);
    new BrowserProposalStorage().saveCurrent(acceptedProposal);

    const knowledgeCard = createKnowledgeCard(acceptedProposal);

    if (knowledgeCard) {
      new BrowserKnowledgeCardStorage().save(knowledgeCard);
      router.push(`/knowledge/${knowledgeCard.id}`);
      return;
    }

    router.push("/knowledge");
  }

  return (
    <article className="mt-8 max-w-2xl space-y-6 rounded-xl border border-zinc-200 bg-white p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {state.proposal.generatedBy}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
          {state.proposal.title}
        </h2>
      </div>

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
          <blockquote className="mt-2 border-l-2 border-zinc-300 pl-4 leading-7 text-zinc-700">
            {state.proposal.sourceEvidence.excerpt}
          </blockquote>
        </div>
      </section>

      <button
        className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white"
        onClick={handleAccept}
        type="button"
      >
        接受 Proposal
      </button>
    </article>
  );
}
