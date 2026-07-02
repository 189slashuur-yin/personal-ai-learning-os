import type { AIProviderStorage } from "@/core/contracts/ai-provider-storage";

const CURRENT_PROVIDER_KEY = "ai-learning-os.current-provider";

export class BrowserAIProviderStorage implements AIProviderStorage {
  getCurrentProviderId(): string | null {
    return window.localStorage.getItem(CURRENT_PROVIDER_KEY);
  }

  saveCurrentProviderId(providerId: string): void {
    window.localStorage.setItem(CURRENT_PROVIDER_KEY, providerId);
  }
}
