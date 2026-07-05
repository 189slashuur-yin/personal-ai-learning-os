import type {
  ConversationParserId,
  ImportArtifact,
  ParseResult,
} from "@/core/entities/import-parser";

export interface ConversationParser {
  readonly id: ConversationParserId;
  readonly version: string;
  parse(artifact: ImportArtifact): ParseResult;
}
