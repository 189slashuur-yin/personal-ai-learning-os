import type { ProviderCapability } from "@/core/entities/provider-capability";

export type ProviderConnectionTestStatus =
  | "Never Tested"
  | "Success"
  | "Failed"
  | "Not Implemented";

export type ProviderConfiguration = {
  providerId: string;
  displayName: string;
  baseUrl: string;
  model: string;
  timeout: number;
  enabled: boolean;
  requiresApiKey: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsToolCalling: boolean;
  supportsJsonMode: boolean;
  capabilities: ProviderCapability[];
  lastTestTime?: string;
  lastTestStatus: ProviderConnectionTestStatus;
  createdAt: string;
  updatedAt: string;
};
