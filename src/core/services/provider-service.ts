import type { AIProviderStorage } from "@/core/contracts/ai-provider-storage";
import type { PromptTemplateStorage } from "@/core/contracts/prompt-template-storage";
import type { ProviderConfigurationStorage } from "@/core/contracts/provider-configuration-storage";
import type { AIProvider } from "@/core/entities/ai-provider";
import type {
  ProviderConfiguration,
  ProviderConnectionTestStatus,
} from "@/core/entities/provider-configuration";
import { demoProviderInfo } from "@/core/services/demo-provider";
import { OllamaProvider } from "@/core/services/ollama-provider";
import { PromptTemplateService } from "@/core/services/prompt-template-service";
import { ProviderConfigurationService } from "@/core/services/provider-configuration-service";
import { createDefaultProviderRegistry } from "@/core/services/provider-registry";

const OLLAMA_CONNECTION_CHECKS =
  "请检查：Ollama 是否已启动；baseUrl 是否正确；配置的 model 是否已下载。";

const availableProviders: AIProvider[] = [
  demoProviderInfo,
  {
    id: "ollama",
    name: "Ollama",
    kind: "ollama",
    enabled: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

export class ProviderService {
  constructor(
    private readonly storage: AIProviderStorage,
    private readonly configurationStorage?: ProviderConfigurationStorage,
    private readonly promptTemplateStorage?: PromptTemplateStorage,
  ) {}

  getProviders(): AIProvider[] {
    const ollamaConfiguration = this.getOllamaConfiguration();
    return availableProviders.map((provider) =>
      provider.id === "ollama"
        ? {
            ...provider,
            enabled:
              ollamaConfiguration?.enabled === true &&
              ollamaConfiguration.lastTestStatus === "Success",
          }
        : provider,
    );
  }

  getCurrentProvider() {
    const storedProviderId = this.storage.getCurrentProviderId() ?? "demo";
    const registry = this.createRegistry(storedProviderId);
    const provider = registry.getCurrentProvider();

    if (provider.providerInfo.id !== storedProviderId) {
      this.storage.saveCurrentProviderId(provider.providerInfo.id);
    }

    return provider;
  }

  selectProvider(providerId: string) {
    const providerInfo = this.getProviders().find(
      (provider) => provider.id === providerId,
    );

    if (!providerInfo?.enabled) {
      const ollamaConfiguration = this.getOllamaConfiguration();
      const message =
        providerId === "ollama" && !ollamaConfiguration?.enabled
          ? "请先启用 Ollama。"
          : providerId === "ollama"
            ? "请先完成 Ollama Connection Test，并取得 Success。"
            : "该 Provider 当前不可用。";
      return { selected: false as const, message };
    }

    const provider = this.createRegistry().switchProvider(providerId);
    this.storage.saveCurrentProviderId(provider.providerInfo.id);
    return { selected: true as const, provider };
  }

  async testConnection(providerId: string): Promise<{
    configuration: ProviderConfiguration;
    status: ProviderConnectionTestStatus;
    error?: string;
  }> {
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

    let status: ProviderConnectionTestStatus =
      providerId === "demo" ? "Success" : "Not Implemented";
    let testError: string | undefined;

    if (providerId === "ollama") {
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(
        () => controller.abort(),
        configuration.timeout,
      );

      try {
        const response = await fetch(
          `${configuration.baseUrl.replace(/\/+$/, "")}/api/tags`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          const details = (await response.text()).trim().slice(0, 300);
          throw new Error(
            `HTTP ${response.status}${details ? `：${details}` : ""}`,
          );
        }

        status = "Success";
      } catch (error) {
        status = "Failed";
        const failureReason =
          error instanceof DOMException && error.name === "AbortError"
            ? `连接在 ${configuration.timeout} ms 后超时。`
            : error instanceof Error
              ? error.message
              : "无法连接 Ollama。";
        testError = `${failureReason} ${OLLAMA_CONNECTION_CHECKS}`;
      } finally {
        globalThis.clearTimeout(timeout);
      }
    }

    const testedConfiguration: ProviderConfiguration = {
      ...configuration,
      lastTestTime: new Date().toISOString(),
      lastTestStatus: status,
      lastTestError: testError,
      updatedAt: new Date().toISOString(),
    };

    this.configurationStorage.saveAll(
      configurations.map((item) =>
        item.providerId === providerId ? testedConfiguration : item,
      ),
    );

    return { configuration: testedConfiguration, status, error: testError };
  }

  private getOllamaConfiguration(): ProviderConfiguration | null {
    if (!this.configurationStorage) {
      return null;
    }

    return (
      new ProviderConfigurationService(
        this.configurationStorage,
      )
        .listConfigurations()
        .find((configuration) => configuration.providerId === "ollama") ?? null
    );
  }

  private createRegistry(currentProviderId = "demo") {
    const configuration = this.getOllamaConfiguration();

    if (
      !configuration?.enabled ||
      configuration.lastTestStatus !== "Success" ||
      !this.promptTemplateStorage
    ) {
      return createDefaultProviderRegistry(currentProviderId);
    }

    const promptTemplates = new PromptTemplateService(
      this.promptTemplateStorage,
    );
    const sourceTemplate = promptTemplates.getCurrentTemplate("source");
    const messagesTemplate = promptTemplates.getCurrentTemplate("messages");
    const ollama = new OllamaProvider(configuration, {
      source: sourceTemplate?.template ?? "",
      messages: messagesTemplate?.template ?? "",
    });

    return createDefaultProviderRegistry(currentProviderId, [ollama]);
  }
}
