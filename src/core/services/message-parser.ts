import type { Message, MessageRole } from "@/core/entities/message";

type MessageDraft = Pick<Message, "role" | "content">;

type MessageParserOptions = {
  createdAt?: string;
  createId?: () => string;
};

const SPEAKER_PATTERN =
  /^\s*(我|GPT|用户|AI|Assistant)\s*[：:]\s*(.*)$/i;

function roleForSpeaker(speaker: string): MessageRole {
  const normalizedSpeaker = speaker.toLowerCase();

  if (normalizedSpeaker === "我" || normalizedSpeaker === "用户") {
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

  normalizedText.split("\n").forEach((line) => {
    const speakerMatch = line.match(SPEAKER_PATTERN);

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
