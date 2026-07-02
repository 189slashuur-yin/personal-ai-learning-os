export interface AIProviderStorage {
  getCurrentProviderId(): string | null;
  saveCurrentProviderId(providerId: string): void;
}
