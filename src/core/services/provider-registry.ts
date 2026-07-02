import type { AnalyzerProvider } from "@/core/contracts/analyzer-provider";
import { DemoProvider } from "@/core/services/demo-provider";

export class ProviderRegistry {
  private currentProviderId: string;
  private readonly providers: Map<string, AnalyzerProvider>;

  constructor(providers: AnalyzerProvider[], currentProviderId = "demo") {
    this.providers = new Map(
      providers.map((provider) => [provider.providerInfo.id, provider]),
    );
    this.currentProviderId = currentProviderId;
  }

  getCurrentProvider(): AnalyzerProvider {
    const provider = this.providers.get(this.currentProviderId);

    if (provider?.providerInfo.enabled) {
      return provider;
    }

    const fallbackProvider = [...this.providers.values()].find(
      (item) => item.providerInfo.enabled,
    );

    if (!fallbackProvider) {
      throw new Error("没有可用的 Analyzer Provider。");
    }

    this.currentProviderId = fallbackProvider.providerInfo.id;
    return fallbackProvider;
  }

  switchProvider(providerId: string): AnalyzerProvider {
    const provider = this.providers.get(providerId);

    if (!provider?.providerInfo.enabled) {
      throw new Error("该 Analyzer Provider 尚不可用。");
    }

    this.currentProviderId = providerId;
    return provider;
  }
}

export function createDefaultProviderRegistry(
  currentProviderId = "demo",
  additionalProviders: AnalyzerProvider[] = [],
) {
  return new ProviderRegistry(
    [new DemoProvider(), ...additionalProviders],
    currentProviderId,
  );
}
