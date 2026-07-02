import type { ConversationSourceType } from "@/core/entities/conversation";
import type { MessageRole } from "@/core/entities/message";

export type ImportRoleAliases = Partial<
  Record<Exclude<MessageRole, "unknown">, string[]>
>;

export type ImportProfile = {
  id: string;
  name: string;
  sourceType: ConversationSourceType;
  description: string;
  roleAliases: ImportRoleAliases;
  createdAt: string;
  updatedAt: string;
};
