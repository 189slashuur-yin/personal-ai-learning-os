import type { Message, MessageRole } from "@/core/entities/message";
import type { ImportRoleAliases } from "@/core/entities/import-profile";

export type MessageDraft = Pick<Message, "role" | "content">;

export type MessageParserOptions = {
  createdAt?: string;
  createId?: () => string;
  roleAliases?: ImportRoleAliases;
};

const DEFAULT_ROLE_ALIASES: ImportRoleAliases = {
  user: ["我", "用户", "User", "You", "Human"],
  assistant: [
    "ChatGPT",
    "GPT",
    "Assistant",
    "Claude",
    "AI",
    "Gemini",
    "DeepSeek",
  ],
  system: ["System"],
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createSpeakerMatcher(roleAliases: ImportRoleAliases) {
  const roleByAlias = new Map<string, MessageRole>();

  Object.entries(roleAliases).forEach(([role, aliases]) => {
    aliases.forEach((alias) => roleByAlias.set(alias.toLowerCase(), role as MessageRole));
  });

  const aliases = [...roleByAlias.keys()].sort(
    (left, right) => right.length - left.length,
  );

  if (aliases.length === 0) {
    return null;
  }

  const pattern = new RegExp(
    `^\\s*(${aliases.map(escapeRegExp).join("|")})\\s*(?:said\\s*)?[：:]\\s*(.*)$`,
    "i",
  );

  return {
    pattern,
    roleByAlias,
  };
}

function appendDraft(
  drafts: MessageDraft[],
  role: MessageRole,
  lines: string[],
) {
  const content = lines.join("\n").trim();

  if (content) {
    drafts.push({ role, content });
  }
}

export function parseMessagesFromRawText(
  rawText: string,
  conversationId: string,
  options: MessageParserOptions = {},
): Message[] {
  const drafts = parseMessageDraftsFromRawText(rawText, options.roleAliases);

  if (drafts.length === 0) {
    return [];
  }

  const createdAt = options.createdAt ?? new Date().toISOString();
  const createId = options.createId ?? (() => crypto.randomUUID());

  return drafts.map((draft, order) => ({
    id: createId(),
    conversationId,
    role: draft.role,
    content: draft.content,
    order,
    createdAt,
    updatedAt: createdAt,
  }));
}

export function parseMessageDraftsFromRawText(
  rawText: string,
  roleAliases: ImportRoleAliases = DEFAULT_ROLE_ALIASES,
): MessageDraft[] {
  const normalizedText = rawText.replace(/\r\n?/g, "\n").trim();

  if (!normalizedText) {
    return [];
  }

  const drafts: MessageDraft[] = [];
  const speakerMatcher = createSpeakerMatcher(roleAliases);
  let currentRole: MessageRole = "unknown";
  let currentLines: string[] = [];
  let isInsideCodeBlock = false;

  normalizedText.split("\n").forEach((line) => {
    const isCodeFence = line.trimStart().startsWith("```");

    if (isCodeFence) {
      currentLines.push(line);
      isInsideCodeBlock = !isInsideCodeBlock;
      return;
    }

    const speakerMatch =
      isInsideCodeBlock || !speakerMatcher
        ? null
        : line.match(speakerMatcher.pattern);

    if (!speakerMatch || !speakerMatcher) {
      currentLines.push(line);
      return;
    }

    appendDraft(drafts, currentRole, currentLines);
    currentRole =
      speakerMatcher.roleByAlias.get(speakerMatch[1].toLowerCase()) ?? "unknown";
    currentLines = [speakerMatch[2]];
  });

  appendDraft(drafts, currentRole, currentLines);

  return drafts;
}
