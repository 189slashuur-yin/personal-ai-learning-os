export type AIProviderKind =
  | "demo"
  | "openai"
  | "claude"
  | "ollama"
  | "custom";

export type AIProvider = {
  id: string;
  name: string;
  kind: AIProviderKind;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
