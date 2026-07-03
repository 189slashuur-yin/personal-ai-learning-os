import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { ConversationVersion } from "@/core/entities/conversation-version";

const CONVERSATION_VERSIONS_KEY = "ai-learning-os.conversation-versions";

function isConversationVersion(value: unknown): value is ConversationVersion {
  if (!value || typeof value !== "object") {
    return false;
  }

  const version = value as Partial<ConversationVersion>;

  return (
    typeof version.id === "string" &&
    typeof version.conversationId === "string" &&
    typeof version.name === "string" &&
    typeof version.description === "string" &&
    typeof version.createdAt === "string" &&
    typeof version.sourceVersion === "number" &&
    typeof version.messageCount === "number" &&
    Boolean(version.snapshotData?.conversation) &&
    Array.isArray(version.snapshotData?.messages)
  );
}

export class BrowserConversationVersionStorage
  implements ConversationVersionStorage
{
  save(version: ConversationVersion) {
    const versions = this.getAll();

    if (versions.some((storedVersion) => storedVersion.id === version.id)) {
      return;
    }

    this.persist([...versions, version]);
  }

  getAll() {
    const storedVersions = window.localStorage.getItem(
      CONVERSATION_VERSIONS_KEY,
    );

    if (!storedVersions) {
      return [];
    }

    try {
      const parsedVersions = JSON.parse(storedVersions) as unknown;

      if (!Array.isArray(parsedVersions)) {
        return [];
      }

      return parsedVersions
        .filter(isConversationVersion)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    } catch {
      return [];
    }
  }

  getByConversationId(conversationId: string) {
    return this.getAll().filter(
      (version) => version.conversationId === conversationId,
    );
  }

  removeByConversationId(conversationId: string) {
    this.persist(
      this.getAll().filter(
        (version) => version.conversationId !== conversationId,
      ),
    );
  }

  private persist(versions: ConversationVersion[]) {
    window.localStorage.setItem(
      CONVERSATION_VERSIONS_KEY,
      JSON.stringify(versions),
    );
  }
}
