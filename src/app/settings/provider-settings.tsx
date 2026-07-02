"use client";

import { useState } from "react";
import type { AIProvider } from "@/core/entities/ai-provider";
import { ProviderService } from "@/core/services/provider-service";
import { BrowserAIProviderStorage } from "@/infrastructure/storage/browser-ai-provider-storage";

function createProviderService() {
  return new ProviderService(new BrowserAIProviderStorage());
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

  function selectProvider(providerId: string) {
    const result = createProviderService().selectProvider(providerId);

    if (!result.selected) {
      setMessage("尚未实现");
      return;
    }

    setCurrentProviderId(result.provider.providerInfo.id);
    setMessage(`${result.provider.providerInfo.name} 已保存为当前 Provider。`);
  }

  return (
    <section className="mt-8 max-w-3xl">
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
      <p aria-live="polite" className="mt-4 min-h-6 text-sm text-zinc-600">
        {message}
      </p>
    </section>
  );
}
