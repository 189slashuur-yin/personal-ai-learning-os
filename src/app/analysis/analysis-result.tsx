"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Proposal } from "@/core/entities/proposal";
import { ProviderService } from "@/core/services/provider-service";
import { BrowserAIProviderStorage } from "@/infrastructure/storage/browser-ai-provider-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";

type AnalysisState =
  | { status: "analyzing" }
  | { status: "complete"; proposal: Proposal }
  | { status: "missing-source" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AnalysisResult() {
  const [state, setState] = useState<AnalysisState>({ status: "analyzing" });
  const [providerName] = useState(() =>
    typeof window === "undefined"
      ? "Demo Provider"
      : new ProviderService(
          new BrowserAIProviderStorage(),
        ).getCurrentProvider().providerInfo.name,
  );

  useEffect(() => {
    const analysisTimer = window.setTimeout(() => {
      const source = new BrowserSourceStorage().getCurrent();

      if (!source) {
        setState({ status: "missing-source" });
        return;
      }

      const provider = new ProviderService(
        new BrowserAIProviderStorage(),
      ).getCurrentProvider();
      const proposal = provider.analyzeSource(source);
      new BrowserProposalStorage().saveCurrent(proposal);
      setState({ status: "complete", proposal });
    }, 0);

    return () => window.clearTimeout(analysisTimer);
  }, []);

  if (state.status === "missing-source") {
    return (
      <section className="mt-8 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-medium text-amber-950">尚未找到可分析的 TXT Source</p>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          请先导入并保存一份 TXT 文件，再运行 Demo Analyzer。
        </p>
        <Link
          className="mt-5 inline-block rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white"
          href="/import"
        >
          返回导入页面
        </Link>
      </section>
    );
  }

  if (state.status === "analyzing") {
    return (
      <section className="mt-8 max-w-2xl rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-900">
          当前 Provider：{providerName}
        </p>
        <p className="mt-3 text-sm text-zinc-500" role="status">
          Demo Analyzer 正在分析已保存的 TXT Source…
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 max-w-2xl space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
      <div>
        <p className="text-sm font-medium text-zinc-500">分析完成</p>
        <p className="mt-2 text-2xl font-semibold text-zinc-950">
          新增 Proposal：1
        </p>
      </div>

      <div className="rounded-lg bg-zinc-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {state.proposal.generatedBy}
        </p>
        <p className="mt-2 font-medium text-zinc-900">{state.proposal.title}</p>
        <dl className="mt-4 grid gap-3 border-t border-zinc-200 pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Provider</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {state.proposal.providerName ?? "Unknown Provider"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">生成时间</dt>
            <dd className="mt-1 font-medium text-zinc-900">
              {formatDate(
                state.proposal.generatedAt ?? state.proposal.createdAt,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Source type</dt>
            <dd className="mt-1 font-medium capitalize text-zinc-900">
              {state.proposal.analysisMode ?? "source"}
            </dd>
          </div>
          {state.proposal.analysisMode === "messages" ? (
            <div>
              <dt className="text-zinc-500">Selected messages</dt>
              <dd className="mt-1 font-medium text-zinc-900">
                {state.proposal.sourceMessageIds?.length ?? 0}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <Link
        className="inline-block rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white"
        href="/review"
      >
        前往 Review 页面
      </Link>
    </section>
  );
}
