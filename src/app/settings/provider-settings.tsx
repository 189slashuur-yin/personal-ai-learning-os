"use client";

import { useEffect, useState } from "react";
import type { AIProvider } from "@/core/entities/ai-provider";
import type { AnalyzerPromptTemplate } from "@/core/entities/analyzer-prompt-template";
import type { ProviderConfiguration } from "@/core/entities/provider-configuration";
import {
  getDefaultPromptTemplates,
  PromptTemplateService,
} from "@/core/services/prompt-template-service";
import { ProviderService } from "@/core/services/provider-service";
import { ProviderConfigurationService } from "@/core/services/provider-configuration-service";
import { BrowserAIProviderStorage } from "@/infrastructure/storage/browser-ai-provider-storage";
import { BrowserPromptTemplateStorage } from "@/infrastructure/storage/browser-prompt-template-storage";
import { BrowserProviderConfigurationStorage } from "@/infrastructure/storage/browser-provider-configuration-storage";
import { CapabilityBadges } from "@/app/capability-badges";

function createProviderService() {
  return new ProviderService(
    new BrowserAIProviderStorage(),
    new BrowserProviderConfigurationStorage(),
    new BrowserPromptTemplateStorage(),
  );
}

function createPromptTemplateService() {
  return new PromptTemplateService(new BrowserPromptTemplateStorage());
}

function createProviderConfigurationService() {
  return new ProviderConfigurationService(
    new BrowserProviderConfigurationStorage(),
  );
}

export function ProviderSettings() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [currentProviderId, setCurrentProviderId] = useState(() =>
    typeof window === "undefined"
      ? "demo"
      : createProviderService().getCurrentProvider().providerInfo.id,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [templates, setTemplates] = useState<AnalyzerPromptTemplate[]>(() =>
    getDefaultPromptTemplates(),
  );
  const [configurations, setConfigurations] = useState<
    ProviderConfiguration[]
  >([]);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      setProviders(createProviderService().getProviders());
      setTemplates(createPromptTemplateService().listTemplates());
      setConfigurations(
        createProviderConfigurationService().listConfigurations(),
      );
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  function selectProvider(providerId: string) {
    const result = createProviderService().selectProvider(providerId);

    if (!result.selected) {
      setMessage(result.message);
      return;
    }

    setCurrentProviderId(result.provider.providerInfo.id);
    setMessage(`${result.provider.providerInfo.name} 已保存为当前 Provider。`);
  }

  function resetTemplates() {
    setTemplates(createPromptTemplateService().resetDefaults());
    setMessage("Analyzer templates 已重置为默认值。");
  }

  function toggleConfiguration(providerId: string, enabled: boolean) {
    setConfigurations(
      createProviderConfigurationService().setEnabled(providerId, enabled),
    );
    setProviders(createProviderService().getProviders());

    if (providerId === "ollama" && !enabled && currentProviderId === "ollama") {
      setCurrentProviderId(createProviderService().getCurrentProvider().providerInfo.id);
    }
    setMessage("Provider configuration 已保存。");
  }

  function updateOllamaDraft(
    field: "baseUrl" | "model" | "timeout",
    value: string,
  ) {
    setConfigurations((current) =>
      current.map((configuration) =>
        configuration.providerId === "ollama"
          ? {
              ...configuration,
              [field]: field === "timeout" ? Number(value) : value,
            }
          : configuration,
      ),
    );
  }

  function saveOllamaSettings() {
    const ollama = configurations.find(
      (configuration) => configuration.providerId === "ollama",
    );

    if (!ollama) {
      return false;
    }

    try {
      setConfigurations(
        createProviderConfigurationService().updateOllamaSettings({
          baseUrl: ollama.baseUrl,
          model: ollama.model,
          timeout: ollama.timeout,
        }),
      );
      setProviders(createProviderService().getProviders());
      setCurrentProviderId(
        createProviderService().getCurrentProvider().providerInfo.id,
      );
      setMessage("Ollama configuration 已保存。");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ollama 配置无效。");
      return false;
    }
  }

  async function testConnection(providerId: string) {
    if (providerId === "ollama" && !saveOllamaSettings()) {
      return;
    }

    setTestingProviderId(providerId);
    const result = await createProviderService().testConnection(providerId);
    setConfigurations((current) =>
      current.map((configuration) =>
        configuration.providerId === providerId
          ? result.configuration
          : configuration,
      ),
    );
    setProviders(createProviderService().getProviders());
    setCurrentProviderId(
      createProviderService().getCurrentProvider().providerInfo.id,
    );
    setTestingProviderId(null);

    if (providerId === "ollama") {
      setMessage(
        result.status === "Success"
          ? "Ollama connection test: Success。"
          : `Ollama connection test: Failed。${result.error ?? "请确认本地服务已启动。"}`,
      );
    } else if (result.status === "Success") {
      setMessage("Demo connection test: Success。");
    } else {
      setMessage("此云 Provider connection test: Not Implemented；未发起网络请求。");
    }
  }

  return (
    <section className="mt-8 max-w-3xl space-y-8">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-sm text-emerald-800">当前 Provider</p>
        <p className="mt-1 text-xl font-semibold text-emerald-950">
          {currentProviderId === "ollama" ? "Ollama" : "Demo"}
        </p>
        <p className="mt-2 text-sm leading-6 text-emerald-800">
          当前选择会同步用于 Dashboard 和 Analyze / 生成整理建议。
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        {providers.map((provider, index) => {
          const selected = provider.id === currentProviderId;
          const configuration = configurations.find(
            (item) => item.providerId === provider.id,
          );
          const unavailableReason =
            provider.id === "ollama" && !configuration?.enabled
              ? "请先在下方启用 Ollama。"
              : provider.id === "ollama" &&
                  configuration?.lastTestStatus !== "Success"
                ? "启用后需要 Test Connection 成功，才能设为当前 Provider。"
                : null;

          return (
            <article
              className={`flex w-full items-center justify-between gap-4 p-5 ${index > 0 ? "border-t border-zinc-100" : ""}`}
              key={provider.id}
            >
              <span>
                <span className="block font-semibold text-zinc-950">
                  {provider.name}
                </span>
                <span className="mt-1 block text-sm text-zinc-500">
                  {provider.enabled ? "可用于 Analyze" : "尚未满足启用条件"}
                </span>
                {provider.kind === "demo" ? (
                  <span className="mt-2 block max-w-xl text-xs leading-5 text-zinc-500">
                    Demo Provider uses deterministic local logic and does not
                    call external AI APIs.
                  </span>
                ) : provider.kind === "ollama" ? (
                  <span className="mt-2 block max-w-xl text-xs leading-5 text-zinc-500">
                    Ollama runs locally and requires Ollama service to be running.
                  </span>
                ) : null}
                {unavailableReason ? (
                  <span className="mt-2 block max-w-xl text-xs font-medium text-amber-700">
                    {unavailableReason}
                  </span>
                ) : null}
              </span>
              <button
                aria-pressed={selected}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
                  selected
                    ? "bg-emerald-100 text-emerald-800"
                    : provider.enabled
                      ? "bg-zinc-950 text-white hover:bg-zinc-800"
                      : "cursor-not-allowed bg-zinc-100 text-zinc-400"
                }`}
                disabled={selected || !provider.enabled}
                onClick={() => selectProvider(provider.id)}
                type="button"
              >
                {selected ? "当前 Provider" : "设为当前 Provider"}
              </button>
            </article>
          );
        })}
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            Provider Configuration
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            当前仅提供 Demo 与本地 Ollama。云 Provider 不在本版本范围内。
          </p>
        </div>
        <div className="mt-5 space-y-4">
          {configurations
            .filter((configuration) =>
              ["demo", "ollama"].includes(configuration.providerId),
            )
            .map((configuration) => (
            <article
              className="rounded-lg border border-zinc-200 p-4"
              key={configuration.providerId}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-zinc-950">
                    {configuration.displayName}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {configuration.providerId}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    checked={configuration.enabled}
                    className="h-4 w-4 accent-zinc-950"
                    disabled={configuration.providerId === "demo"}
                    onChange={(event) =>
                      toggleConfiguration(
                        configuration.providerId,
                        event.target.checked,
                      )
                    }
                    type="checkbox"
                  />
                  {configuration.providerId === "demo" ? "始终可用" : "enabled"}
                </label>
              </div>
              {configuration.providerId === "ollama" ? (
                <div className="mt-4 border-t border-zinc-100 pt-4 text-sm">
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-950">
                    <p className="font-semibold">使用 Ollama 前请完成本机准备</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-sky-900">
                      <li>在本机安装 Ollama。</li>
                      <li>
                        运行{" "}
                        <code className="font-semibold">ollama serve</code>{" "}
                        启动服务。
                      </li>
                      <li>
                        拉取下方配置的模型，例如{" "}
                        <code className="font-semibold">
                          ollama pull qwen3:8b
                        </code>
                        。
                      </li>
                    </ol>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-zinc-500">
                      Base URL
                      <input
                        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-medium text-zinc-800"
                        onChange={(event) =>
                          updateOllamaDraft("baseUrl", event.target.value)
                        }
                        type="url"
                        value={configuration.baseUrl}
                      />
                    </label>
                    <label className="text-zinc-500">
                      Model
                      <input
                        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-medium text-zinc-800"
                        onChange={(event) =>
                          updateOllamaDraft("model", event.target.value)
                        }
                        type="text"
                        value={configuration.model}
                      />
                    </label>
                    <label className="text-zinc-500">
                      Timeout (ms)
                      <input
                        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-medium text-zinc-800"
                        min="1000"
                        onChange={(event) =>
                          updateOllamaDraft("timeout", event.target.value)
                        }
                        step="1000"
                        type="number"
                        value={configuration.timeout}
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        onClick={saveOllamaSettings}
                        type="button"
                      >
                        Save Ollama Settings
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
              <dl className="mt-4 grid gap-3 border-t border-zinc-100 pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Base URL</dt>
                  <dd className="mt-1 break-all font-medium text-zinc-800">
                    {configuration.baseUrl}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Model</dt>
                  <dd className="mt-1 font-medium text-zinc-800">
                    {configuration.model}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Timeout</dt>
                  <dd className="mt-1 font-medium text-zinc-800">
                    {configuration.timeout} ms
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">API key</dt>
                  <dd className="mt-1 font-medium text-zinc-800">
                    {configuration.requiresApiKey ? "Required" : "Not required"}
                  </dd>
                </div>
              </dl>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
                <p className="text-xs text-zinc-500">
                  Last test: {configuration.lastTestStatus}
                  {configuration.lastTestTime
                    ? ` · ${new Date(configuration.lastTestTime).toLocaleString("zh-CN")}`
                    : ""}
                </p>
                {configuration.lastTestError ? (
                  <p className="w-full text-xs text-red-700">
                    {configuration.lastTestError}
                  </p>
                ) : null}
                <button
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  disabled={testingProviderId === configuration.providerId}
                  onClick={() => testConnection(configuration.providerId)}
                  type="button"
                >
                  {testingProviderId === configuration.providerId
                    ? "Testing…"
                    : "Test Connection"}
                </button>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Streaming {configuration.supportsStreaming ? "Yes" : "No"} ·
                Vision {configuration.supportsVision ? "Yes" : "No"} · Tool
                calling {configuration.supportsToolCalling ? "Yes" : "No"} ·
                JSON mode {configuration.supportsJsonMode ? "Yes" : "No"}
              </p>
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium text-zinc-500">
                  Capabilities
                </p>
                <CapabilityBadges capabilities={configuration.capabilities} />
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Analyzer Templates
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              当前模板用于 Demo 与 Ollama 分析流程，暂不支持编辑。
            </p>
          </div>
          <button
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={resetTemplates}
            type="button"
          >
            Reset Defaults
          </button>
        </div>
        <div className="mt-5 space-y-4">
          {templates.map((template) => (
            <article
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
              key={template.id}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-zinc-950">{template.name}</h3>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold uppercase text-zinc-600">
                  {template.mode} · v{template.version}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                {template.template}
              </p>
            </article>
          ))}
        </div>
      </div>
      <p aria-live="polite" className="mt-4 min-h-6 text-sm text-zinc-600">
        {message}
      </p>
    </section>
  );
}
