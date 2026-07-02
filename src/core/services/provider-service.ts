import type { AIProviderStorage } from "@/core/contracts/ai-provider-storage";
import type { AIProvider, AIProviderKind } from "@/core/entities/ai-provider";
import { demoProviderInfo } from "@/core/services/demo-provider";
import { createDefaultProviderRegistry } from "@/core/services/provider-registry";

const PLACEHOLDER_CREATED_AT = "2026-01-01T00:00:00.000Z";

function comingSoonProvider(
  id: string,
  name: string,
  kind: AIProviderKind,
): AIProvider {
  return {
    id,
    name,
    kind,
    enabled: false,
    createdAt: PLACEHOLDER_CREATED_AT,
    updatedAt: PLACEHOLDER_CREATED_AT,
  };
}

export const availableProviders: AIProvider[] = [
  demoProviderInfo,
  comingSoonProvider("openai", "OpenAI", "openai"),
  comingSoonProvider("claude", "Claude", "claude"),
  comingSoonProvider("ollama", "Ollama", "ollama"),
  comingSoonProvider("custom", "Custom", "custom"),
];

export class ProviderService {
  constructor(private readonly storage: AIProviderStorage) {}

  getProviders(): AIProvider[] {
    return availableProviders;
  }

  getCurrentProvider() {
    const storedProviderId = this.storage.getCurrentProviderId() ?? "demo";
    const registry = createDefaultProviderRegistry(storedProviderId);
    const provider = registry.getCurrentProvider();

    if (provider.providerInfo.id !== storedProviderId) {
      this.storage.saveCurrentProviderId(provider.providerInfo.id);
    }

    return provider;
  }

  selectProvider(providerId: string) {
    const providerInfo = availableProviders.find(
      (provider) => provider.id === providerId,
    );

    if (!providerInfo?.enabled) {
      return { selected: false as const, message: "尚未实现" };
    }

    const provider = createDefaultProviderRegistry().switchProvider(providerId);
    this.storage.saveCurrentProviderId(provider.providerInfo.id);
    return { selected: true as const, provider };
  }
}
