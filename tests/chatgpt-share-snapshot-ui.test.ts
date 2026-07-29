import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type {
  ShareSnapshotCanonicalWriteCommand,
  ShareSnapshotCanonicalWriteReceipt,
  ShareSnapshotCanonicalWriter,
} from "@/core/contracts/share-snapshot-canonical-writer";
import type { Conversation } from "@/core/entities/conversation";
import type {
  ShareSnapshotCaptureRequest,
  ShareSnapshotPreview,
} from "@/core/models/share-snapshot-preview";
import {
  confirmShareSnapshotPreview,
  createShareSnapshotImportUiState,
  reduceShareSnapshotImportUiState,
  requestShareSnapshotPreview,
  ShareSnapshotPreviewCard,
  shareSnapshotTargetSelectionError,
} from "@/app/import/chatgpt-share-snapshot-import";
import {
  buildImportPageSearch,
  deriveActiveImportSection,
  parseImportPageState,
} from "@/core/services/import-page-state";
import { ChatGPTShareSnapshotWorkflow } from "@/core/services/chatgpt-share-snapshot-workflow";
import {
  InMemoryConversationStorage,
  InMemoryMessageStorage,
  InMemoryRoundStorage,
  InMemorySourceStorage,
} from "./fakes";

const timestamp = "2026-07-27T08:00:00.000Z";
const shareUrl = "https://chatgpt.com/share/ui-integration-token";
const pastedSnapshot = {
  kind: "pasted-text" as const,
  content: "User:\nQuestion\n\nAssistant:\nAnswer",
};

function newConversation(): Conversation {
  return {
    id: "conversation-new",
    title: "Imported share",
    sourceType: "ChatGPT",
    workspaceId: "inbox",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  };
}

function captureRequest(): ShareSnapshotCaptureRequest {
  return {
    shareUrl,
    snapshot: pastedSnapshot,
    newConversation: newConversation(),
  };
}

class RecordingWriter implements ShareSnapshotCanonicalWriter {
  commands: ShareSnapshotCanonicalWriteCommand[] = [];

  execute(
    command: ShareSnapshotCanonicalWriteCommand,
  ): Promise<ShareSnapshotCanonicalWriteReceipt> {
    this.commands.push(command);
    return Promise.resolve({
      status: "written",
      conversationId: command.plan.conversation.id,
      sourceId: command.plan.source.id,
      writtenMessageCount: command.plan.messages.length,
      writtenRoundCount: command.plan.rounds.length,
      verifiedMessageCount: command.plan.messages.length,
      verifiedRoundCount: command.plan.rounds.length,
      pendingWriteCount: 0,
    });
  }
}

function workflowHarness() {
  const writer = new RecordingWriter();
  let nextId = 0;
  const workflow = new ChatGPTShareSnapshotWorkflow(
    {
      conversations: new InMemoryConversationStorage(),
      sources: new InMemorySourceStorage(),
      messages: new InMemoryMessageStorage(),
      rounds: new InMemoryRoundStorage(),
    },
    {
      writer,
      createId: (kind) => `${kind}-${++nextId}`,
      createPreviewId: () => `preview-${++nextId}`,
      now: () => timestamp,
    },
  );
  return { workflow, writer };
}

function preview(
  status: ShareSnapshotPreview["status"],
): ShareSnapshotPreview {
  return {
    previewId: `preview-${status}`,
    status,
    target: {
      kind: "existing",
      conversationId: "conversation-existing",
      conversationTitle: "Existing conversation",
      sourceId: "source-head",
    },
    summary: {
      existingMessageCount: 3,
      snapshotMessageCount: 4,
      newMessageCount: status === "append" ? 1 : 0,
      existingRoundCount: 2,
      newRoundCount: 0,
    },
    baselineFingerprint: "baseline",
    confirmable: status === "append",
    warnings: [],
    errors: status === "blocked" ? ["projection divergence"] : [],
  };
}

const assistantOnlyAppend = {
  kind: "pasted-text" as const,
  content:
    "User:\nQuestion\n\nAssistant:\nAnswer\n\nUser:\nFollow-up\n\nAssistant:\nLate answer",
};

describe("v1.8 Conversation Snapshot input mode", () => {
  it("round-trips the fourth mode while preserving the existing target selector", () => {
    expect(deriveActiveImportSection("share")).toBe("share-snapshot");
    const search = buildImportPageSearch("", {
      importPath: "existing",
      inputMode: "share",
      existingTargetId: "conversation-existing",
    });

    expect(parseImportPageState(new URLSearchParams(search))).toEqual({
      importPath: "existing",
      inputMode: "share",
      existingTargetId: "conversation-existing",
    });
  });

  it("clears prepared previews when content, target, or local input kind changes", () => {
    const withSourceUrl = reduceShareSnapshotImportUiState(
      createShareSnapshotImportUiState(),
      {
        type: "edit-source-url",
        value: "https://chatgpt.com/c/ui-conversation-identity",
      },
    );
    const prepared = reduceShareSnapshotImportUiState(
      withSourceUrl,
      { type: "preview-ready", preview: preview("append") },
    );
    const edited = reduceShareSnapshotImportUiState(prepared, {
      type: "edit-content",
      value: "changed",
    });
    expect(edited.preview).toBeNull();
    expect(edited.report).toBeNull();

    const targetChanged = reduceShareSnapshotImportUiState(prepared, {
      type: "target-changed",
    });
    expect(targetChanged.preview).toBeNull();

    const inputKindChanged = reduceShareSnapshotImportUiState(
      {
        ...prepared,
        content: "stale content",
        fileName: "stale.html",
      },
      { type: "select-input-kind", value: "saved-html" },
    );
    expect(inputKindChanged).toMatchObject({
      inputKind: "saved-html",
      sourceUrl: "https://chatgpt.com/c/ui-conversation-identity",
      content: "",
      fileName: "",
      preview: null,
    });
  });
});

describe("v1.8 Conversation Snapshot preview rendering", () => {
  it("renders append counts, assistant extension impact, and preserved fields", () => {
    const html = renderToStaticMarkup(
      createElement(ShareSnapshotPreviewCard, {
        preview: preview("append"),
        snapshot: assistantOnlyAppend,
        targetError: null,
      }),
    );

    expect(html).toContain("APPEND");
    expect(html).toContain("3 existing");
    expect(html).toContain("4 in snapshot");
    expect(html).toContain("1 new");
    expect(html).toContain("extend 1");
    expect(html).toContain("Preserved fields");
    expect(html).toContain("Tail Round ID");
    expect(html).toContain("sourceOrdinal");
  });

  it.each([
    ["same", "SAME", "zero writes"],
    ["blocked", "BLOCKED", "projection divergence"],
  ] as const)("renders the %s terminal state", (status, label, detail) => {
    const html = renderToStaticMarkup(
      createElement(ShareSnapshotPreviewCard, {
        preview: preview(status),
        snapshot: assistantOnlyAppend,
        targetError: null,
      }),
    );
    expect(html).toContain(label);
    expect(html).toContain(detail);
  });

  it("blocks confirmation when resource ownership and selected target differ", () => {
    const targetError = shareSnapshotTargetSelectionError(
      preview("append"),
      "existing",
      "another-conversation",
    );
    expect(targetError).toContain("不一致");
    const html = renderToStaticMarkup(
      createElement(ShareSnapshotPreviewCard, {
        preview: preview("append"),
        snapshot: assistantOnlyAppend,
        targetError,
      }),
    );
    expect(html).toContain("BLOCKED · TARGET MISMATCH");
    expect(html).toContain("Canonical write");
    expect(html).toContain("blocked");
    expect(
      shareSnapshotTargetSelectionError(
        preview("append"),
        "existing",
        "conversation-existing",
      ),
    ).toBeNull();
  });
});

describe("v1.8 Conversation Snapshot explicit confirm flow", () => {
  it("previews without writing and invokes the writer only after explicit confirm", async () => {
    const { workflow, writer } = workflowHarness();

    const prepared = await requestShareSnapshotPreview(
      workflow,
      captureRequest(),
    );
    expect(prepared).toMatchObject({ status: "new", confirmable: true });
    expect(writer.commands).toHaveLength(0);

    const result = await confirmShareSnapshotPreview(workflow, prepared);
    expect(result).toMatchObject({ status: "success", mode: "new" });
    expect(writer.commands).toHaveLength(1);
  });

  it("does not issue a chatgpt.com request or access browser credentials", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { workflow } = workflowHarness();

    await requestShareSnapshotPreview(workflow, captureRequest());

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const componentSource = readFileSync(
      new URL(
        "../src/app/import/chatgpt-share-snapshot-import.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    expect(componentSource).not.toMatch(/\bfetch\s*\(/);
    expect(componentSource).not.toMatch(/XMLHttpRequest/);
    expect(componentSource).not.toMatch(/document\.cookie/);
    expect(componentSource).toContain("ChatGPT Conversation Snapshot");
    expect(componentSource.indexOf("A. Conversation content")).toBeLessThan(
      componentSource.indexOf("B. Optional source identity"),
    );
    expect(componentSource.indexOf("B. Optional source identity")).toBeLessThan(
      componentSource.indexOf("C. Target Conversation"),
    );
    expect(componentSource.indexOf("C. Target Conversation")).toBeLessThan(
      componentSource.indexOf(
        "D. 添加必需的本地对话内容后生成 comparator preview",
      ),
    );
  });
});

describe("v1.8 immutable Snapshot UI mutation boundaries", () => {
  it("keeps Detail transcript edits and Workbench merge behind ownership guards", () => {
    const detailSource = readFileSync(
      new URL(
        "../src/app/conversation/[id]/conversation-detail.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const workbenchSource = readFileSync(
      new URL("../src/app/import/import-workbench.tsx", import.meta.url),
      "utf8",
    );

    expect(detailSource).toContain("shareSnapshotOwned:");
    expect(detailSource).toContain(
      "readOnly={state.shareSnapshotOwned}",
    );
    expect(detailSource).toContain("sources: createSourceStorage()");
    expect(detailSource).toContain("state.shareSnapshotOwned ||");
    expect(workbenchSource.match(/assertShareSnapshotTranscriptMutable\(/g))
      .toHaveLength(2);
  });
});
