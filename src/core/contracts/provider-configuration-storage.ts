import type { ProviderConfiguration } from "@/core/entities/provider-configuration";

export interface ProviderConfigurationStorage {
  getAll(): ProviderConfiguration[];
  saveAll(configurations: ProviderConfiguration[]): void;
}
