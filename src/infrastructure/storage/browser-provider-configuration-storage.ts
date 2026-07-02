import type { ProviderConfigurationStorage } from "@/core/contracts/provider-configuration-storage";
import type { ProviderConfiguration } from "@/core/entities/provider-configuration";

const PROVIDER_CONFIGURATIONS_KEY = "ai-learning-os.provider-configurations";

export class BrowserProviderConfigurationStorage
  implements ProviderConfigurationStorage
{
  getAll(): ProviderConfiguration[] {
    const storedConfigurations = window.localStorage.getItem(
      PROVIDER_CONFIGURATIONS_KEY,
    );

    if (!storedConfigurations) {
      return [];
    }

    const configurations = JSON.parse(
      storedConfigurations,
    ) as ProviderConfiguration[];

    return configurations.filter(
      (configuration) =>
        typeof configuration.providerId === "string" &&
        typeof configuration.displayName === "string",
    ).map((configuration) => ({
      ...configuration,
      lastTestStatus: configuration.lastTestStatus ?? "Never Tested",
    }));
  }

  saveAll(configurations: ProviderConfiguration[]): void {
    window.localStorage.setItem(
      PROVIDER_CONFIGURATIONS_KEY,
      JSON.stringify(configurations),
    );
  }
}
