import type { AIProviderStorage } from "@/core/contracts/ai-provider-storage";
import type { ProviderConfigurationStorage } from "@/core/contracts/provider-configuration-storage";
import type { AIProvider, AIProviderKind } from "@/core/entities/ai-provider";
import type {
  ProviderConfiguration,
  ProviderConnectionTestStatus,
} from "@/core/entities/provider-configuration";
import { demoProviderInfo } from "@/core/services/demo-provider";
import { ProviderConfigurationService } from "@/core/services/provider-configuration-service";
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
  constructor(
    private readonly storage: AIProviderStorage,
    private readonly configurationStorage?: ProviderConfigurationStorage,
  ) {}

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

  testConnection(providerId: string): {
    configuration: ProviderConfiguration;
    status: ProviderConnectionTestStatus;
  } {
    if (!this.configurationStorage) {
      throw new Error("Provider Configuration Storage 未配置。");
    }

    const configurationService = new ProviderConfigurationService(
      this.configurationStorage,
    );
    const configurations = configurationService.listConfigurations();
    const configuration = configurations.find(
      (item) => item.providerId === providerId,
    );

    if (!configuration) {
      throw new Error("Provider Configuration 不存在。");
    }

    const status: ProviderConnectionTestStatus =
      providerId === "demo" ? "Success" : "Not Implemented";
    const testedConfiguration: ProviderConfiguration = {
      ...configuration,
      lastTestTime: new Date().toISOString(),
      lastTestStatus: status,
      updatedAt: new Date().toISOString(),
    };

    this.configurationStorage.saveAll(
      configurations.map((item) =>
        item.providerId === providerId ? testedConfiguration : item,
      ),
    );

    return { configuration: testedConfiguration, status };
  }
}
