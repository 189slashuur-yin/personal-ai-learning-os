import type { ConversationSourceType } from "@/core/entities/conversation";
import type { ImportProfile } from "@/core/entities/import-profile";
import type { Message } from "@/core/entities/message";
import { parseMessagesFromRawText } from "@/core/services/message-parser";

const PROFILE_TIMESTAMP = "2026-07-03T00:00:00.000Z";

const defaultProfiles: ImportProfile[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    sourceType: "ChatGPT",
    description: "识别 ChatGPT、GPT 与常见 User / You 发言标记。",
    roleAliases: {
      user: ["User", "You", "用户", "我"],
      assistant: ["ChatGPT", "GPT", "Assistant"],
      system: ["System"],
    },
    createdAt: PROFILE_TIMESTAMP,
    updatedAt: PROFILE_TIMESTAMP,
  },
  {
    id: "claude",
    name: "Claude",
    sourceType: "Claude",
    description: "识别 Claude、Assistant 与 Human / User 发言标记。",
    roleAliases: {
      user: ["Human", "User", "You", "用户", "我"],
      assistant: ["Claude", "Assistant"],
      system: ["System"],
    },
    createdAt: PROFILE_TIMESTAMP,
    updatedAt: PROFILE_TIMESTAMP,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    sourceType: "DeepSeek",
    description: "识别 DeepSeek、Assistant 与常见用户发言标记。",
    roleAliases: {
      user: ["User", "You", "用户", "我"],
      assistant: ["DeepSeek", "Assistant", "AI"],
      system: ["System"],
    },
    createdAt: PROFILE_TIMESTAMP,
    updatedAt: PROFILE_TIMESTAMP,
  },
  {
    id: "gemini",
    name: "Gemini",
    sourceType: "Gemini",
    description: "识别 Gemini、Assistant 与常见用户发言标记。",
    roleAliases: {
      user: ["User", "You", "用户", "我"],
      assistant: ["Gemini", "Assistant", "AI"],
      system: ["System"],
    },
    createdAt: PROFILE_TIMESTAMP,
    updatedAt: PROFILE_TIMESTAMP,
  },
  {
    id: "manual",
    name: "Manual",
    sourceType: "Manual",
    description: "使用跨平台通用角色别名解析手动整理的对话文本。",
    roleAliases: {
      user: ["Human", "User", "You", "用户", "我"],
      assistant: [
        "ChatGPT",
        "GPT",
        "Assistant",
        "Claude",
        "DeepSeek",
        "Gemini",
        "AI",
      ],
      system: ["System"],
    },
    createdAt: PROFILE_TIMESTAMP,
    updatedAt: PROFILE_TIMESTAMP,
  },
  {
    id: "plain-text",
    name: "Plain Text",
    sourceType: "Plain Text",
    description: "不假设角色标记，无法识别的全文会保留为 Unknown。",
    roleAliases: {},
    createdAt: PROFILE_TIMESTAMP,
    updatedAt: PROFILE_TIMESTAMP,
  },
];

export type ImportPreview = {
  messages: Message[];
  messageCount: number;
  userCount: number;
  assistantCount: number;
  unknownCount: number;
  hasHighUnknownRatio: boolean;
  suggestedTitle: string;
};

function titleExcerpt(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 30);
}

export class ImportProfileService {
  listProfiles() {
    return defaultProfiles.map((profile) => ({
      ...profile,
      roleAliases: Object.fromEntries(
        Object.entries(profile.roleAliases).map(([role, aliases]) => [
          role,
          [...aliases],
        ]),
      ),
    }));
  }

  getById(profileId: string) {
    return this.listProfiles().find((profile) => profile.id === profileId) ?? null;
  }

  getBySourceType(sourceType: ConversationSourceType) {
    return (
      this.listProfiles().find((profile) => profile.sourceType === sourceType) ??
      null
    );
  }

  parse(
    rawText: string,
    conversationId: string,
    profile: ImportProfile,
  ): Message[] {
    return parseMessagesFromRawText(rawText, conversationId, {
      roleAliases: profile.roleAliases,
    });
  }

  createPreview(rawText: string, profile: ImportProfile): ImportPreview {
    let sequence = 0;
    const messages = parseMessagesFromRawText(rawText, "import-preview", {
      roleAliases: profile.roleAliases,
      createdAt: PROFILE_TIMESTAMP,
      createId: () => `import-preview-${sequence++}`,
    });
    const userCount = messages.filter((message) => message.role === "user").length;
    const assistantCount = messages.filter(
      (message) => message.role === "assistant",
    ).length;
    const unknownCount = messages.filter(
      (message) => message.role === "unknown",
    ).length;
    const firstUserMessage = messages.find((message) => message.role === "user");
    const firstTextLine = rawText
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .find((line) => line.trim());

    return {
      messages,
      messageCount: messages.length,
      userCount,
      assistantCount,
      unknownCount,
      hasHighUnknownRatio:
        messages.length > 0 && unknownCount / messages.length > 0.5,
      suggestedTitle: titleExcerpt(
        firstUserMessage?.content ?? firstTextLine ?? "",
      ),
    };
  }
}
