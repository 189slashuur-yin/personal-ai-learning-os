import type { Message, MessageRole } from "@/core/entities/message";

type MessageDraft = Pick<Message, "role" | "content">;

type MessageParserOptions = {
  createdAt?: string;
  createId?: () => string;
};

const SPEAKER_PATTERN =
  /^\s*(我|用户|User|You|ChatGPT|GPT|Assistant|Claude|AI|Gemini|DeepSeek)\s*[：:]\s*(.*)$/i;

const USER_SPEAKERS = new Set(["我", "用户", "user", "you"]);

function roleForSpeaker(speaker: string): MessageRole {
  const normalizedSpeaker = speaker.toLowerCase();

  if (USER_SPEAKERS.has(normalizedSpeaker)) {
    return "user";
  }

  return "assistant";
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
  const normalizedText = rawText.replace(/\r\n?/g, "\n").trim();

  if (!normalizedText) {
    return [];
  }

  const drafts: MessageDraft[] = [];
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

    const speakerMatch = isInsideCodeBlock ? null : line.match(SPEAKER_PATTERN);

    if (!speakerMatch) {
      currentLines.push(line);
      return;
    }

    appendDraft(drafts, currentRole, currentLines);
    currentRole = roleForSpeaker(speakerMatch[1]);
    currentLines = [speakerMatch[2]];
  });

  appendDraft(drafts, currentRole, currentLines);

  const createdAt = options.createdAt ?? new Date().toISOString();
  const createId = options.createId ?? (() => crypto.randomUUID());

  return drafts.map((draft, order) => ({
    id: createId(),
    conversationId,
    role: draft.role,
    content: draft.content,
    order,
    createdAt,
  }));
}
