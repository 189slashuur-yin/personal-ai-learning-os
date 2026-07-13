import type { ConversationParser } from "@/core/contracts/conversation-parser";
import type {
  ConversationParserId,
  ImportArtifact,
  ImportPreview,
  ParsedMessageDraft,
  ParsedRoundDraft,
  ParseResult,
} from "@/core/entities/import-parser";
import type { ImportRoleAliases } from "@/core/entities/import-profile";
import { parseMessageDraftsFromRawText } from "@/core/services/message-parser";

const PARSER_VERSION = "1.0.0";

const aliasesByParser: Record<ConversationParserId, ImportRoleAliases> = {
  chatgpt: {
    user: ["User", "You", "Human", "用户", "我", "问"],
    assistant: ["ChatGPT", "GPT", "Assistant", "AI", "答"],
    system: ["System"],
  },
  claude: {
    user: ["User", "You", "Human", "用户", "我", "问"],
    assistant: ["Claude", "Assistant", "AI", "答"],
    system: ["System"],
  },
  gemini: {
    user: ["User", "You", "Human", "用户", "我", "问"],
    assistant: ["Gemini", "Assistant", "AI", "答"],
    system: ["System"],
  },
  deepseek: {
    user: ["User", "You", "Human", "用户", "我", "问"],
    assistant: ["DeepSeek", "Assistant", "AI", "答"],
    system: ["System"],
  },
  markdown: {
    user: ["User", "You", "Human", "用户", "我", "问"],
    assistant: ["Assistant", "AI", "ChatGPT", "GPT", "Claude", "Gemini", "DeepSeek", "答"],
    system: ["System"],
  },
  txt: {
    user: ["User", "You", "Human", "用户", "我", "问"],
    assistant: ["Assistant", "AI", "ChatGPT", "GPT", "Claude", "Gemini", "DeepSeek", "答"],
    system: ["System"],
  },
  manual: {
    user: ["User", "You", "Human", "用户", "我", "问"],
    assistant: ["Assistant", "AI", "GPT", "答"],
    system: ["System"],
  },
};

const producerByParser: Partial<Record<ConversationParserId, string>> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  deepseek: "DeepSeek",
};

function suggestedTitle(artifact: ImportArtifact, messages: ParsedMessageDraft[]) {
  const fromName = artifact.name.replace(/\.(md|txt|json)$/i, "").trim();
  const firstUserMessage = messages.find(
    (message) => message.role === "user" || message.role === "unknown",
  );
  return fromName || firstUserMessage?.content.split("\n")[0].slice(0, 80) || "Imported Conversation";
}

export function deriveRoundDrafts(messages: ParsedMessageDraft[]): ParsedRoundDraft[] {
  const groups: number[][] = [];
  let current: number[] = [];
  let currentKind: "dialogue" | "orphan" | "context" | null = null;

  const finish = () => {
    if (current.length > 0) groups.push(current);
    current = [];
    currentKind = null;
  };

  messages.forEach((message, index) => {
    if (message.role === "user" || message.role === "unknown") {
      finish();
      current = [index];
      currentKind = "dialogue";
      return;
    }
    if (message.role === "assistant") {
      if (currentKind === "dialogue" || currentKind === "orphan") {
        current.push(index);
      } else {
        finish();
        current = [index];
        currentKind = "orphan";
      }
      return;
    }
    if (currentKind === "context") {
      current.push(index);
    } else {
      finish();
      current = [index];
      currentKind = "context";
    }
  });
  finish();

  return groups.map((messageIndexes, index) => {
    const groupMessages = messageIndexes.map((messageIndex) => messages[messageIndex]);
    const question = groupMessages
      .filter((message) => message.role === "user" || message.role === "unknown" || message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const answer = groupMessages
      .filter((message) => message.role === "assistant")
      .map((message) => message.content)
      .join("\n\n");
    return {
      order: index + 1,
      title: question.split("\n")[0].slice(0, 80) || `Round ${index + 1}`,
      question,
      answer,
      messageIndexes,
    };
  });
}

class TextConversationParser implements ConversationParser {
  readonly version = PARSER_VERSION;

  constructor(readonly id: ConversationParserId) {}

  parse(artifact: ImportArtifact): ParseResult {
    const messages = parseMessageDraftsFromRawText(
      artifact.content,
      aliasesByParser[this.id],
    );
    const warnings: string[] = [];
    const errors: string[] = [];
    const unknownCount = messages.filter((message) => message.role === "unknown").length;

    if (!artifact.content.trim()) errors.push("Import content is empty.");
    if (messages.length > 0 && unknownCount === messages.length) {
      warnings.push("No supported speaker labels were found; content is preserved as unknown.");
    }

    return {
      parserId: this.id,
      parserVersion: this.version,
      producer: producerByParser[this.id],
      format:
        this.id === "markdown"
          ? "markdown"
          : this.id === "txt"
            ? "txt"
            : this.id === "manual"
              ? "manual"
              : "provider-transcript",
      suggestedTitle: suggestedTitle(artifact, messages),
      messages,
      rounds: deriveRoundDrafts(messages),
      warnings,
      errors,
    };
  }
}

export class ImportParserPipeline {
  private readonly parsers = new Map<ConversationParserId, ConversationParser>(
    (["chatgpt", "claude", "gemini", "deepseek", "markdown", "txt", "manual"] as const).map(
      (id) => [id, new TextConversationParser(id)],
    ),
  );

  listParsers() {
    return [...this.parsers.values()].map((parser) => ({
      id: parser.id,
      version: parser.version,
    }));
  }

  preview(artifact: ImportArtifact, parserId: ConversationParserId): ImportPreview {
    const parser = this.parsers.get(parserId);
    if (!parser) throw new Error(`Parser ${parserId} is not available.`);
    const result = parser.parse(artifact);
    return {
      ...result,
      artifact,
      messageCount: result.messages.length,
      roundCount: result.rounds.length,
      unknownMessageCount: result.messages.filter((message) => message.role === "unknown").length,
      canConfirm: result.errors.length === 0 && result.messages.length > 0,
    };
  }
}
