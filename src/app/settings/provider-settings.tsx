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
  const [providers] = useState<AIProvider[]>(() =>
    createProviderService().getProviders(),
  );
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

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
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
      setMessage("尚未实现");
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
    setMessage("Provider configuration 已保存；不会发起网络请求。");
  }

  function testConnection(providerId: string) {
    const result = createProviderService().testConnection(providerId);
    setConfigurations((current) =>
      current.map((configuration) =>
        configuration.providerId === providerId
          ? result.configuration
          : configuration,
      ),
    );
    setMessage(
      result.status === "Success"
        ? "Demo connection test: Success。"
        : "此 Provider connection test: Not Implemented；未发起网络请求。",
    );
  }

  return (
    <section className="mt-8 max-w-3xl space-y-8">
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        {providers.map((provider, index) => {
          const selected = provider.id === currentProviderId;

          return (
            <button
              aria-pressed={selected}
              className={`flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-zinc-50 ${index > 0 ? "border-t border-zinc-100" : ""}`}
              key={provider.id}
              onClick={() => selectProvider(provider.id)}
              type="button"
            >
              <span>
                <span className="block font-semibold text-zinc-950">
                  {provider.name}
                </span>
                <span className="mt-1 block text-sm text-zinc-500">
                  {provider.enabled ? "可用" : "Coming Soon"}
                </span>
                {provider.kind === "demo" ? (
                  <span className="mt-2 block max-w-xl text-xs leading-5 text-zinc-500">
                    Demo Provider uses deterministic local logic and does not
                    call external AI APIs.
                  </span>
                ) : null}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  selected
                    ? "bg-emerald-50 text-emerald-700"
                    : provider.enabled
                      ? "bg-zinc-100 text-zinc-600"
                      : "bg-amber-50 text-amber-700"
                }`}
              >
                {selected ? "当前 Provider" : provider.enabled ? "选择" : "尚未实现"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            Provider Configuration
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            默认配置只读；enabled 仅保存配置状态，不会启用真实 API。Demo
            仍是唯一可运行的 Analyzer。
          </p>
        </div>
        <div className="mt-5 space-y-4">
          {configurations.map((configuration) => (
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
                    onChange={(event) =>
                      toggleConfiguration(
                        configuration.providerId,
                        event.target.checked,
                      )
                    }
                    type="checkbox"
                  />
                  enabled
                </label>
              </div>
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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
                <p className="text-xs text-zinc-500">
                  Last test: {configuration.lastTestStatus}
                  {configuration.lastTestTime
                    ? ` · ${new Date(configuration.lastTestTime).toLocaleString("zh-CN")}`
                    : ""}
                </p>
                <button
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  onClick={() => testConnection(configuration.providerId)}
                  type="button"
                >
                  Test Connection
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
              当前模板仅用于 Demo / Mock 分析流程，暂不支持编辑。
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
