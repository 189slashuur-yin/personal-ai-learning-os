import { readFileSync } from "node:fs";
import type { Conversation } from "@/core/entities/conversation";
import type { ChatGPTShareSnapshotInput } from "@/core/services/chatgpt-share-snapshot-parser";
import { ChatGPTShareSnapshotWorkflow } from "@/core/services/chatgpt-share-snapshot-workflow";
import { IndexedDBConversationStorage } from "@/infrastructure/storage/indexeddb/idb-conversation-storage";
import { IndexedDBMessageStorage } from "@/infrastructure/storage/indexeddb/idb-message-storage";
import { IndexedDBRoundStorage } from "@/infrastructure/storage/indexeddb/idb-round-storage";
import { IndexedDBShareSnapshotCanonicalWriter } from "@/infrastructure/storage/indexeddb/idb-share-snapshot-canonical-writer";
import { IndexedDBSourceStorage } from "@/infrastructure/storage/indexeddb/idb-source-storage";

export const PHASE_2F_SHARE_URL =
  "https://chatgpt.com/share/phase-2f-sanitized-resource";
export const PHASE_2F_DIFFERENT_SHARE_URL =
  "https://chatgpt.com/share/phase-2f-different-resource";
export const PHASE_2F_CONVERSATION_ID = "phase-2f-conversation";

export type Phase2FSavedHtmlFixture =
  | "chatgpt-share-snapshot-initial.html"
  | "chatgpt-share-snapshot-assistant-append.html";

export function loadPhase2FSavedHtml(
  fixture: Phase2FSavedHtmlFixture,
): ChatGPTShareSnapshotInput {
  return {
    kind: "saved-html",
    content: readFileSync(
      new URL(`../fixtures/${fixture}`, import.meta.url),
      "utf8",
    ),
  };
}

export function phase2FConversation(
  overrides: Partial<Conversation> = {},
): Conversation {
  const timestamp = "2026-07-27T02:00:00.000Z";
  return {
    id: PHASE_2F_CONVERSATION_ID,
    title: "Phase 2F saved HTML validation",
    sourceType: "ChatGPT",
    workspaceId: "inbox",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    ...overrides,
  };
}

export function createPhase2FIndexedDBWorkflow(
  captureTimes: readonly string[] = [
    "2026-07-27T02:01:00.000Z",
    "2026-07-27T02:02:00.000Z",
    "2026-07-27T02:03:00.000Z",
  ],
): ChatGPTShareSnapshotWorkflow {
  const ids = {
    message: 0,
    round: 0,
    source: 0,
    preview: 0,
  };
  let captureIndex = 0;

  return new ChatGPTShareSnapshotWorkflow(
    {
      conversations: new IndexedDBConversationStorage(),
      sources: new IndexedDBSourceStorage(),
      messages: new IndexedDBMessageStorage(),
      rounds: new IndexedDBRoundStorage(),
    },
    {
      writer: new IndexedDBShareSnapshotCanonicalWriter(),
      createId(kind) {
        ids[kind] += 1;
        return `phase-2f-${kind}-${ids[kind]}`;
      },
      createPreviewId() {
        ids.preview += 1;
        return `phase-2f-preview-${ids.preview}`;
      },
      now() {
        const timestamp = captureTimes[captureIndex];
        if (!timestamp) {
          throw new Error("Phase 2F capture time fixture is exhausted.");
        }
        captureIndex += 1;
        return timestamp;
      },
    },
  );
}
