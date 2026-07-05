"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AnalyzerRun } from "@/core/entities/analyzer-run";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Proposal } from "@/core/entities/proposal";
import type { ProviderCapability } from "@/core/entities/provider-capability";
import { AnalyzerExecutionService } from "@/core/services/analyzer-execution";
import { PromptTemplateService } from "@/core/services/prompt-template-service";
import { ProviderConfigurationService } from "@/core/services/provider-configuration-service";
import { ProviderService } from "@/core/services/provider-service";
import { BrowserAIProviderStorage } from "@/infrastructure/storage/browser-ai-provider-storage";
import { BrowserAnalyzerRunStorage } from "@/infrastructure/storage/browser-analyzer-run-storage";
import { BrowserPromptTemplateStorage } from "@/infrastructure/storage/browser-prompt-template-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserProviderConfigurationStorage } from "@/infrastructure/storage/browser-provider-configuration-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { CapabilityBadges } from "@/app/capability-badges";

type AnalysisState =
  | { status: "analyzing" }
  | { status: "complete"; proposal: Proposal }
  | { status: "error"; message: string }
  | { status: "missing-source" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function runSourceAnalysis(source: ImportedSource, simulateFailure = false) {
  const provider = new ProviderService(
    new BrowserAIProviderStorage(),
    new BrowserProviderConfigurationStorage(),
    new BrowserPromptTemplateStorage(),
  ).getCurrentProvider();
  return new AnalyzerExecutionService(
    provider,
    new PromptTemplateService(new BrowserPromptTemplateStorage()),
    new BrowserAnalyzerRunStorage(),
  ).runSource(source, { simulateRecoverableError: simulateFailure });
}

export function AnalysisResult() {
  const [state, setState] = useState<AnalysisState>({ status: "analyzing" });
  const [latestRun, setLatestRun] = useState<AnalyzerRun | null>(null);
  const [providerDetails] = useState<{
    id: string;
    name: string;
    capabilities: ProviderCapability[];
  }>(() => {
    if (typeof window === "undefined") {
      return { id: "demo", name: "Demo Provider", capabilities: [] };
    }

    const provider = new ProviderService(
      new BrowserAIProviderStorage(),
      new BrowserProviderConfigurationStorage(),
      new BrowserPromptTemplateStorage(),
    ).getCurrentProvider();
    const configuration = new ProviderConfigurationService(
      new BrowserProviderConfigurationStorage(),
    )
      .listConfigurations()
      .find((item) => item.providerId === provider.providerInfo.id);

    return {
      id: provider.providerInfo.id,
      name: provider.providerInfo.name,
      capabilities: configuration?.capabilities ?? [],
    };
  });

  useEffect(() => {
    const analysisTimer = window.setTimeout(async () => {
      const source = new BrowserSourceStorage().getCurrent();

      if (!source) {
        setState({ status: "missing-source" });
        return;
      }

      const result = await runSourceAnalysis(source);
      setLatestRun(result.run);

      if (result.proposal) {
        const proposal = result.proposal;
        new BrowserProposalStorage().saveCurrent(proposal);
        setState({ status: "complete", proposal });
      } else {
        setState({
          status: "error",
          message: result.run.error?.message ?? "Analyzer 运行失败。",
        });
      }
    }, 0);

    return () => window.clearTimeout(analysisTimer);
  }, []);

  async function retryOrSimulate(simulateFailure = false) {
    const sourceStorage = new BrowserSourceStorage();
    const sourceId = latestRun?.sourceId;
    const source = sourceId
      ? sourceStorage.getAll().find((item) => item.id === sourceId) ?? null
      : sourceStorage.getCurrent();

    if (!source) {
      setState({ status: "missing-source" });
      return;
    }

    setState({ status: "analyzing" });
    const result = await runSourceAnalysis(source, simulateFailure);
    setLatestRun(result.run);

    if (!result.proposal) {
      setState({
        status: "error",
        message: result.run.error?.message ?? "Analyzer 运行失败。",
      });
      return;
    }

    new BrowserProposalStorage().saveCurrent(result.proposal);
    setState({ status: "complete", proposal: result.proposal });
  }

  if (state.status === "missing-source") {
    return (
      <section className="mt-8 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-medium text-amber-950">尚未找到可分析的 TXT Source</p>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          请先导入并保存一份 TXT 文件，再运行 Analyzer。
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
          当前 Provider：{providerDetails.name}
        </p>
        <div className="mt-3">
          <p className="mb-2 text-xs font-medium text-zinc-500">Capabilities</p>
          <CapabilityBadges capabilities={providerDetails.capabilities} />
        </div>
        <p className="mt-3 text-sm text-zinc-500" role="status">
          Analyzer 正在分析已保存的 TXT Source…
        </p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="mt-8 max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="font-medium text-red-950">未生成 Proposal</p>
        <p className="mt-2 text-sm leading-6 text-red-800">{state.message}</p>
        {latestRun?.providerId === "ollama" ? (
          <p className="mt-3 text-sm leading-6 text-red-800">
            本次失败未写入 Proposal。你可以前往{" "}
            <Link className="font-semibold underline" href="/settings">
              Settings
            </Link>{" "}
            切回 Demo Provider 后重试。
          </p>
        ) : null}
        <p className="mt-3 text-xs font-medium uppercase tracking-wider text-red-700">
          最近运行：{latestRun?.status ?? "failed"}
          {latestRun?.error ? ` · ${latestRun.error.code}` : ""}
        </p>
        {latestRun?.error?.recoverable ? (
          <button
            className="mt-5 rounded-lg bg-red-900 px-4 py-2.5 text-sm font-medium text-white"
            onClick={() => retryOrSimulate(false)}
            type="button"
          >
            Retry
          </button>
        ) : null}
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
        <p className="mt-2 text-xs font-medium uppercase tracking-wider text-emerald-700">
          最近 AnalyzerRun：{latestRun?.status ?? "completed"}
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
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Capabilities</dt>
            <dd className="mt-2">
              <CapabilityBadges
                capabilities={state.proposal.providerCapabilities}
              />
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          className="inline-block rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white"
          href="/review"
        >
          前往 Review 页面
        </Link>
        {providerDetails.id === "demo" ? (
        <button
          className="rounded-lg border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-700"
          onClick={() => retryOrSimulate(true)}
          type="button"
        >
          模拟可恢复失败
        </button>
        ) : null}
      </div>
    </section>
  );
}
