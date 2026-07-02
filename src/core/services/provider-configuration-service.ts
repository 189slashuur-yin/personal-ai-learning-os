import type { ProviderConfigurationStorage } from "@/core/contracts/provider-configuration-storage";
import type { ProviderConfiguration } from "@/core/entities/provider-configuration";
import { DEMO_PROVIDER_CAPABILITIES } from "@/core/entities/provider-capability";

const DEFAULT_CREATED_AT = "2026-07-02T00:00:00.000Z";

type ProviderDefaults = Omit<ProviderConfiguration, "createdAt" | "updatedAt">;

const providerDefaults: ProviderDefaults[] = [
  {
    providerId: "demo",
    displayName: "Demo",
    baseUrl: "local://demo",
    model: "deterministic-demo",
    timeout: 5_000,
    enabled: true,
    requiresApiKey: false,
    supportsStreaming: false,
    supportsVision: false,
    supportsToolCalling: false,
    supportsJsonMode: true,
    lastTestStatus: "Never Tested",
    capabilities: DEMO_PROVIDER_CAPABILITIES,
  },
  {
    providerId: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    timeout: 30_000,
    enabled: false,
    requiresApiKey: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsToolCalling: true,
    supportsJsonMode: true,
    lastTestStatus: "Never Tested",
    capabilities: [
      "chat",
      "vision",
      "tool_call",
      "reasoning",
      "json_output",
      "stream",
      "embedding",
      "long_context",
    ],
  },
  {
    providerId: "claude",
    displayName: "Claude",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet",
    timeout: 30_000,
    enabled: false,
    requiresApiKey: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsToolCalling: true,
    supportsJsonMode: true,
    lastTestStatus: "Never Tested",
    capabilities: [
      "chat",
      "vision",
      "tool_call",
      "reasoning",
      "json_output",
      "stream",
      "long_context",
    ],
  },
  {
    providerId: "gemini",
    displayName: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-flash",
    timeout: 30_000,
    enabled: false,
    requiresApiKey: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsToolCalling: true,
    supportsJsonMode: true,
    lastTestStatus: "Never Tested",
    capabilities: [
      "chat",
      "vision",
      "tool_call",
      "reasoning",
      "json_output",
      "stream",
      "embedding",
      "long_context",
    ],
  },
  {
    providerId: "ollama",
    displayName: "Ollama",
    baseUrl: "http://localhost:11434",
    model: "qwen2.5:7b",
    timeout: 60_000,
    enabled: false,
    requiresApiKey: false,
    supportsStreaming: false,
    supportsVision: false,
    supportsToolCalling: false,
    supportsJsonMode: true,
    lastTestStatus: "Never Tested",
    capabilities: ["chat", "reasoning", "json_output"],
  },
  {
    providerId: "deepseek",
    displayName: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    timeout: 30_000,
    enabled: false,
    requiresApiKey: true,
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalling: true,
    supportsJsonMode: true,
    lastTestStatus: "Never Tested",
    capabilities: [
      "chat",
      "tool_call",
      "reasoning",
      "json_output",
      "stream",
      "long_context",
    ],
  },
  {
    providerId: "azure-openai",
    displayName: "Azure OpenAI",
    baseUrl: "https://{resource}.openai.azure.com",
    model: "deployment-name",
    timeout: 30_000,
    enabled: false,
    requiresApiKey: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsToolCalling: true,
    supportsJsonMode: true,
    lastTestStatus: "Never Tested",
    capabilities: [
      "chat",
      "vision",
      "tool_call",
      "reasoning",
      "json_output",
      "stream",
      "embedding",
      "long_context",
    ],
  },
];

export function getDefaultProviderConfigurations(): ProviderConfiguration[] {
  return providerDefaults.map((configuration) => ({
    ...configuration,
    createdAt: DEFAULT_CREATED_AT,
    updatedAt: DEFAULT_CREATED_AT,
  }));
}

export class ProviderConfigurationService {
  constructor(private readonly storage: ProviderConfigurationStorage) {}

  listConfigurations(): ProviderConfiguration[] {
    const storedById = new Map(
      this.storage
        .getAll()
        .map((configuration) => [configuration.providerId, configuration]),
    );

    return getDefaultProviderConfigurations().map((defaultConfiguration) => {
      const storedConfiguration = storedById.get(
        defaultConfiguration.providerId,
      );

      if (!storedConfiguration) {
        return defaultConfiguration;
      }

      const mergedConfiguration = {
        ...defaultConfiguration,
        ...storedConfiguration,
      };

      if (
        mergedConfiguration.providerId === "ollama" &&
        mergedConfiguration.model === "llama3.2"
      ) {
        mergedConfiguration.model = defaultConfiguration.model;
      }

      if (mergedConfiguration.providerId === "ollama") {
        mergedConfiguration.supportsStreaming = false;
        mergedConfiguration.capabilities =
          defaultConfiguration.capabilities.slice();
      }

      return mergedConfiguration;
    });
  }

  setEnabled(providerId: string, enabled: boolean): ProviderConfiguration[] {
    const configurations = this.listConfigurations();
    const configuration = configurations.find(
      (item) => item.providerId === providerId,
    );

    if (!configuration) {
      return configurations;
    }

    configuration.enabled = enabled;
    configuration.updatedAt = new Date().toISOString();
    this.storage.saveAll(configurations);
    return configurations;
  }

  updateOllamaSettings(settings: {
    baseUrl: string;
    model: string;
    timeout: number;
  }): ProviderConfiguration[] {
    const configurations = this.listConfigurations();
    const configuration = configurations.find(
      (item) => item.providerId === "ollama",
    );

    if (!configuration) {
      throw new Error("Ollama Provider Configuration 不存在。");
    }

    const baseUrl = settings.baseUrl.trim().replace(/\/+$/, "");
    const model = settings.model.trim();

    if (!/^https?:\/\//i.test(baseUrl)) {
      throw new Error("Ollama Base URL 必须使用 http:// 或 https://。");
    }

    if (!model) {
      throw new Error("Ollama Model 不能为空。");
    }

    if (!Number.isFinite(settings.timeout) || settings.timeout < 1_000) {
      throw new Error("Ollama Timeout 必须至少为 1000 ms。");
    }

    const updatedConfiguration: ProviderConfiguration = {
      ...configuration,
      baseUrl,
      model,
      timeout: Math.round(settings.timeout),
      lastTestStatus: "Never Tested",
      lastTestTime: undefined,
      lastTestError: undefined,
      updatedAt: new Date().toISOString(),
    };
    const updatedConfigurations = configurations.map((item) =>
      item.providerId === "ollama" ? updatedConfiguration : item,
    );
    this.storage.saveAll(updatedConfigurations);
    return updatedConfigurations;
  }
}
