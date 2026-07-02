export type ProviderCapability =
  | "chat"
  | "vision"
  | "tool_call"
  | "reasoning"
  | "json_output"
  | "stream"
  | "embedding"
  | "long_context";

export const DEMO_PROVIDER_CAPABILITIES: ProviderCapability[] = [
  "chat",
  "json_output",
  "reasoning",
];
