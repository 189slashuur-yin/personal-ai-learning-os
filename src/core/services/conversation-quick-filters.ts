export type ConversationQuickFilter =
  | "all"
  | "empty"
  | "imported"
  | "failed-import";

export type ConversationQuickFilterItem = {
  conversation: {
    id: string;
    workspaceId?: string;
    externalSource?: "chatgpt";
  };
  messageCount: number;
  roundCount: number;
};

export function deriveConversationQuickFilterIds(
  items: ConversationQuickFilterItem[],
) {
  const empty = new Set<string>();
  const imported = new Set<string>();
  const failedImport = new Set<string>();

  for (const item of items) {
    const id = item.conversation.id;
    const isEmpty = item.messageCount === 0 || item.roundCount === 0;
    const isChatGPTImport = item.conversation.externalSource === "chatgpt";
    if (isEmpty) empty.add(id);
    if (isChatGPTImport) imported.add(id);
    if (isChatGPTImport && item.messageCount === 0 && item.roundCount === 0) {
      failedImport.add(id);
    }
  }

  return { empty, imported, failedImport };
}

export function filterConversationQuickItems<T extends ConversationQuickFilterItem>(
  items: T[],
  workspaceId: string,
  quickFilter: ConversationQuickFilter,
): T[] {
  const ids = deriveConversationQuickFilterIds(items);
  return items.filter((item) => {
    if (
      workspaceId !== "all" &&
      item.conversation.workspaceId !== workspaceId
    ) {
      return false;
    }
    if (quickFilter === "empty") return ids.empty.has(item.conversation.id);
    if (quickFilter === "imported") return ids.imported.has(item.conversation.id);
    if (quickFilter === "failed-import") {
      return ids.failedImport.has(item.conversation.id);
    }
    return true;
  });
}
