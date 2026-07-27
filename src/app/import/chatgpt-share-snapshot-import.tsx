"use client";

import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { Conversation } from "@/core/entities/conversation";
import type { Workspace } from "@/core/entities/workspace";
import type {
  ShareSnapshotCaptureRequest,
  ShareSnapshotPreview,
} from "@/core/models/share-snapshot-preview";
import type { ShareSnapshotWorkflowResult } from "@/core/models/share-snapshot-workflow-result";
import {
  parseChatGPTShareSnapshot,
  type ChatGPTShareSnapshotInput,
  type ChatGPTShareSnapshotInputKind,
} from "@/core/services/chatgpt-share-snapshot-parser";
import { ChatGPTShareSnapshotWorkflow } from "@/core/services/chatgpt-share-snapshot-workflow";
import { decodeUtf8Text } from "@/core/services/import-page-state";
import {
  createStorageInstances,
  type StorageMode,
} from "@/infrastructure/storage/storage-factory";
import { IndexedDBShareSnapshotCanonicalWriter } from "@/infrastructure/storage/indexeddb";

type ShareSnapshotBusyState = "idle" | "previewing" | "confirming";

export type ShareSnapshotImportUiState = Readonly<{
  inputKind: ChatGPTShareSnapshotInputKind;
  shareUrl: string;
  content: string;
  fileName: string;
  fileInputRevision: number;
  preview: ShareSnapshotPreview | null;
  busy: ShareSnapshotBusyState;
  error: string | null;
  report: string | null;
}>;

export type ShareSnapshotImportUiAction =
  | Readonly<{ type: "edit-url"; value: string }>
  | Readonly<{ type: "edit-content"; value: string; fileName?: string }>
  | Readonly<{ type: "select-input-kind"; value: ChatGPTShareSnapshotInputKind }>
  | Readonly<{ type: "target-changed" }>
  | Readonly<{ type: "preview-started" }>
  | Readonly<{ type: "preview-ready"; preview: ShareSnapshotPreview }>
  | Readonly<{
      type: "failed";
      message: string;
      consumePreview?: boolean;
      clearContent?: boolean;
    }>
  | Readonly<{ type: "confirm-started" }>
  | Readonly<{ type: "confirmed"; report: string }>;

export function createShareSnapshotImportUiState(): ShareSnapshotImportUiState {
  return {
    inputKind: "pasted-text",
    shareUrl: "",
    content: "",
    fileName: "",
    fileInputRevision: 0,
    preview: null,
    busy: "idle",
    error: null,
    report: null,
  };
}

function clearPreparedOutcome(
  state: ShareSnapshotImportUiState,
): ShareSnapshotImportUiState {
  return {
    ...state,
    preview: null,
    busy: "idle",
    error: null,
    report: null,
  };
}

export function reduceShareSnapshotImportUiState(
  state: ShareSnapshotImportUiState,
  action: ShareSnapshotImportUiAction,
): ShareSnapshotImportUiState {
  switch (action.type) {
    case "edit-url":
      return {
        ...clearPreparedOutcome(state),
        shareUrl: action.value,
      };
    case "edit-content":
      return {
        ...clearPreparedOutcome(state),
        content: action.value,
        fileName: action.fileName ?? state.fileName,
      };
    case "select-input-kind":
      if (state.inputKind === action.value) return state;
      return {
        ...createShareSnapshotImportUiState(),
        inputKind: action.value,
        shareUrl: state.shareUrl,
        fileInputRevision: state.fileInputRevision + 1,
      };
    case "target-changed":
      return clearPreparedOutcome(state);
    case "preview-started":
      return {
        ...state,
        preview: null,
        busy: "previewing",
        error: null,
        report: null,
      };
    case "preview-ready":
      return {
        ...state,
        preview: action.preview,
        busy: "idle",
        error: null,
        report: null,
      };
    case "confirm-started":
      return {
        ...state,
        busy: "confirming",
        error: null,
        report: null,
      };
    case "failed":
      return {
        ...state,
        content: action.clearContent ? "" : state.content,
        fileName: action.clearContent ? "" : state.fileName,
        fileInputRevision: action.clearContent
          ? state.fileInputRevision + 1
          : state.fileInputRevision,
        preview: action.consumePreview ? null : state.preview,
        busy: "idle",
        error: action.message,
        report: null,
      };
    case "confirmed":
      return {
        ...createShareSnapshotImportUiState(),
        fileInputRevision: state.fileInputRevision + 1,
        report: action.report,
      };
  }
}

export type ShareSnapshotWorkflowPort = Pick<
  ChatGPTShareSnapshotWorkflow,
  "preview" | "confirm"
>;

export async function requestShareSnapshotPreview(
  workflow: ShareSnapshotWorkflowPort,
  request: ShareSnapshotCaptureRequest,
): Promise<ShareSnapshotPreview> {
  return workflow.preview(request);
}

export async function confirmShareSnapshotPreview(
  workflow: ShareSnapshotWorkflowPort,
  preview: ShareSnapshotPreview,
): Promise<ShareSnapshotWorkflowResult> {
  if (!preview.baselineFingerprint) {
    return {
      status: "stale",
      previewId: preview.previewId,
      message: "Share Snapshot preview has no confirmation baseline.",
    };
  }
  return workflow.confirm({
    previewId: preview.previewId,
    baselineFingerprint: preview.baselineFingerprint,
  });
}

export function shareSnapshotTargetSelectionError(
  preview: ShareSnapshotPreview,
  importPath: "new" | "existing",
  existingTargetId: string,
): string | null {
  if (!preview.target) return null;
  if (importPath === "new") {
    return preview.target.kind === "new"
      ? null
      : `该分享资源已属于「${preview.target.conversationTitle}」。请切换到 Existing 并选择该 Conversation。`;
  }
  if (!existingTargetId) {
    return "请先使用页面已有的 target selector 选择目标 Conversation。";
  }
  if (preview.target.kind === "new") {
    return "该分享资源尚无 Snapshot 历史。首次确认必须使用 New 创建新的 Conversation。";
  }
  return preview.target.conversationId === existingTargetId
    ? null
    : `resourceHash 解析到「${preview.target.conversationTitle}」，与当前选择的 Conversation 不一致。`;
}

export type ShareSnapshotRoundImpact = Readonly<{
  roundsToExtend: number;
  roundsToCreate: number;
  roundsAfterConfirm: number;
}>;

export function deriveShareSnapshotRoundImpact(
  preview: ShareSnapshotPreview,
  snapshot: ChatGPTShareSnapshotInput,
): ShareSnapshotRoundImpact {
  const parsed = parseChatGPTShareSnapshot(snapshot);
  const suffixFirstMessage =
    parsed.messages[preview.summary.existingMessageCount];
  const roundsToExtend =
    preview.status === "append" && suffixFirstMessage?.role === "assistant"
      ? 1
      : 0;
  return {
    roundsToExtend,
    roundsToCreate: preview.summary.newRoundCount,
    roundsAfterConfirm:
      preview.summary.existingRoundCount + preview.summary.newRoundCount,
  };
}

const statusLabels: Record<ShareSnapshotPreview["status"], string> = {
  new: "NEW",
  append: "APPEND",
  same: "SAME",
  ambiguous: "BLOCKED · AMBIGUOUS",
  invalid: "BLOCKED · INVALID",
  blocked: "BLOCKED",
};

export function ShareSnapshotPreviewCard({
  preview,
  snapshot,
  targetError,
}: {
  preview: ShareSnapshotPreview;
  snapshot: ChatGPTShareSnapshotInput;
  targetError: string | null;
}) {
  const roundImpact = deriveShareSnapshotRoundImpact(preview, snapshot);
  const isBlocked =
    preview.status === "blocked" ||
    preview.status === "invalid" ||
    preview.status === "ambiguous" ||
    Boolean(targetError);

  return (
    <section
      className={`rounded-xl border p-5 ${
        isBlocked
          ? "border-red-200 bg-red-50"
          : preview.status === "same"
            ? "border-sky-200 bg-sky-50"
            : "border-emerald-200 bg-emerald-50"
      }`}
      data-testid="share-snapshot-preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-zinc-950">Snapshot Preview</h3>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-800">
          {targetError
            ? "BLOCKED · TARGET MISMATCH"
            : statusLabels[preview.status]}
        </span>
      </div>

      {preview.target ? (
        <p className="mt-3 text-sm text-zinc-700">
          Target: {preview.target.kind === "new" ? "New" : "Existing"} ·{" "}
          {preview.target.conversationTitle}
        </p>
      ) : null}

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-white p-3">
          <dt className="text-xs font-semibold text-zinc-500">Messages</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            {preview.summary.existingMessageCount} existing ·{" "}
            {preview.summary.snapshotMessageCount} in snapshot ·{" "}
            {preview.summary.newMessageCount} new
          </dd>
        </div>
        <div className="rounded-lg bg-white p-3">
          <dt className="text-xs font-semibold text-zinc-500">Round impact</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            extend {roundImpact.roundsToExtend} · create{" "}
            {roundImpact.roundsToCreate} · total{" "}
            {roundImpact.roundsAfterConfirm}
          </dd>
        </div>
        <div className="rounded-lg bg-white p-3">
          <dt className="text-xs font-semibold text-zinc-500">Canonical write</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            {preview.status === "same"
              ? "zero writes"
              : isBlocked
                ? "blocked"
                : "requires explicit confirm"}
          </dd>
        </div>
      </dl>

      {preview.target?.kind === "existing" ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Preserved fields
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-700">
            <li>
              Conversation title, workspace, note, summary, conclusion,
              pending questions, context, and createdAt
            </li>
            <li>
              Existing Message IDs, sourceId, sourceOrdinal, content, and order
            </li>
            {roundImpact.roundsToExtend > 0 ? (
              <li>
                Tail Round ID, title/question, note, summary, context, order,
                and createdAt; only answer, messageIds, and updatedAt change
              </li>
            ) : (
              <li>Existing Round IDs and enrichment remain unchanged</li>
            )}
          </ul>
        </div>
      ) : null}

      {preview.status === "same" ? (
        <p className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-sky-800">
          Snapshot 与当前 head 完全一致；不会产生任何写入。
        </p>
      ) : null}
      {targetError ? (
        <p className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-red-700">
          {targetError}
        </p>
      ) : null}
      {preview.warnings.map((warning) => (
        <p
          className="mt-3 rounded-lg bg-white px-4 py-3 text-sm text-amber-800"
          key={warning}
        >
          {warning}
        </p>
      ))}
      {preview.errors.map((previewError) => (
        <p
          className="mt-3 rounded-lg bg-white px-4 py-3 text-sm text-red-700"
          key={previewError}
        >
          {previewError}
        </p>
      ))}
    </section>
  );
}

type ChatGPTShareSnapshotImportProps = {
  importPath: "new" | "existing";
  existingTargetId: string;
  existingConversations: readonly Conversation[];
  workspaces: readonly Workspace[];
  title: string;
  workspaceId: string;
  storageMode: StorageMode;
  idbReady: boolean;
  onTitleChange: (value: string) => void;
  onWorkspaceChange: (value: string) => void;
  onCompleted: (conversationId: string, mode: "new" | "append") => void;
};

function createShareSnapshotWorkflow(): ChatGPTShareSnapshotWorkflow {
  const storages = createStorageInstances("indexedDB");
  return new ChatGPTShareSnapshotWorkflow(
    {
      conversations: storages.conversations,
      sources: storages.sources,
      messages: storages.messages,
      rounds: storages.rounds,
    },
    {
      writer: new IndexedDBShareSnapshotCanonicalWriter(),
      createId: () => crypto.randomUUID(),
      createPreviewId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
    },
  );
}

function resultFailureMessage(result: ShareSnapshotWorkflowResult): string {
  if (
    result.status === "ambiguous" ||
    result.status === "invalid" ||
    result.status === "blocked"
  ) {
    return result.errors.join(" ") || "Share Snapshot 已阻止写入。";
  }
  if (result.status === "stale" || result.status === "write-failed") {
    return result.message;
  }
  return "Share Snapshot 未完成写入。";
}

export function ChatGPTShareSnapshotImport({
  importPath,
  existingTargetId,
  existingConversations,
  workspaces,
  title,
  workspaceId,
  storageMode,
  idbReady,
  onTitleChange,
  onWorkspaceChange,
  onCompleted,
}: ChatGPTShareSnapshotImportProps) {
  const [state, dispatch] = useReducer(
    reduceShareSnapshotImportUiState,
    undefined,
    createShareSnapshotImportUiState,
  );
  const workflowRef = useRef<ChatGPTShareSnapshotWorkflow | null>(null);
  const requestRevisionRef = useRef(0);
  const targetKey = `${importPath}:${existingTargetId}:${storageMode}:${idbReady}`;
  const previousTargetKeyRef = useRef(targetKey);

  useEffect(() => {
    if (previousTargetKeyRef.current === targetKey) return;
    previousTargetKeyRef.current = targetKey;
    requestRevisionRef.current += 1;
    workflowRef.current = null;
    dispatch({ type: "target-changed" });
  }, [targetKey]);

  const snapshot = useMemo<ChatGPTShareSnapshotInput>(
    () => ({
      kind: state.inputKind,
      content: state.content,
    }),
    [state.content, state.inputKind],
  );
  const targetError = state.preview
    ? shareSnapshotTargetSelectionError(
        state.preview,
        importPath,
        existingTargetId,
      )
    : null;
  const selectedTarget = existingConversations.find(
    (conversation) => conversation.id === existingTargetId,
  );
  const isIndexedDBReady = storageMode === "indexedDB" && idbReady;
  const canRequestPreview =
    isIndexedDBReady &&
    state.busy === "idle" &&
    Boolean(state.shareUrl.trim()) &&
    Boolean(state.content.trim()) &&
    (importPath === "new" ? Boolean(title.trim()) : Boolean(existingTargetId));
  const canConfirm =
    isIndexedDBReady &&
    state.busy === "idle" &&
    Boolean(state.preview?.confirmable) &&
    Boolean(state.preview?.baselineFingerprint) &&
    !targetError;

  function invalidatePreparedState(action: ShareSnapshotImportUiAction) {
    requestRevisionRef.current += 1;
    workflowRef.current = null;
    dispatch(action);
  }

  async function selectSavedHtml(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const requestRevision = requestRevisionRef.current + 1;
    requestRevisionRef.current = requestRevision;
    workflowRef.current = null;
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
      dispatch({
        type: "failed",
        message: "请选择保存到本地的 .html 或 .htm 文件。",
        consumePreview: true,
        clearContent: true,
      });
      return;
    }
    dispatch({
      type: "edit-content",
      value: "",
      fileName: file.name,
    });
    try {
      const content = decodeUtf8Text(await file.arrayBuffer());
      if (requestRevisionRef.current !== requestRevision) return;
      dispatch({
        type: "edit-content",
        value: content,
        fileName: file.name,
      });
    } catch {
      if (requestRevisionRef.current !== requestRevision) return;
      dispatch({
        type: "failed",
        message: "Saved HTML 不是有效的 UTF-8 文本。",
        consumePreview: true,
        clearContent: true,
      });
    }
  }

  async function previewCapture() {
    if (!canRequestPreview) return;
    const requestRevision = requestRevisionRef.current + 1;
    requestRevisionRef.current = requestRevision;
    const workflow = createShareSnapshotWorkflow();
    workflowRef.current = workflow;
    dispatch({ type: "preview-started" });
    const timestamp = new Date().toISOString();
    const newConversation: Conversation = {
      id: crypto.randomUUID(),
      title: title.trim(),
      sourceType: "ChatGPT",
      workspaceId,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
    };

    try {
      const preview = await requestShareSnapshotPreview(workflow, {
        shareUrl: state.shareUrl,
        snapshot,
        newConversation,
      });
      if (
        requestRevisionRef.current !== requestRevision ||
        workflowRef.current !== workflow
      ) {
        return;
      }
      dispatch({ type: "preview-ready", preview });
    } catch {
      if (requestRevisionRef.current !== requestRevision) return;
      workflowRef.current = null;
      dispatch({
        type: "failed",
        message: "Share Snapshot preview 失败；未写入 canonical data。",
        consumePreview: true,
      });
    }
  }

  async function confirmCapture() {
    const preview = state.preview;
    const workflow = workflowRef.current;
    if (!canConfirm || !preview || !workflow) return;
    dispatch({ type: "confirm-started" });
    let result: ShareSnapshotWorkflowResult;
    try {
      result = await confirmShareSnapshotPreview(workflow, preview);
    } catch {
      workflowRef.current = null;
      dispatch({
        type: "failed",
        message: "Share Snapshot confirm 失败；请重新生成 preview。",
        consumePreview: true,
      });
      return;
    }
    workflowRef.current = null;

    if (result.status === "success") {
      const roundImpact = deriveShareSnapshotRoundImpact(preview, snapshot);
      const report =
        result.mode === "new"
          ? `✅ Snapshot 已创建：${result.receipt.writtenMessageCount} Messages · ${result.receipt.writtenRoundCount} Rounds`
          : `✅ Snapshot 已追加：${result.receipt.writtenMessageCount} Messages · extend ${roundImpact.roundsToExtend} Round · create ${roundImpact.roundsToCreate} Rounds`;
      dispatch({ type: "confirmed", report });
      onCompleted(result.receipt.conversationId, result.mode);
      return;
    }
    if (result.status === "noop") {
      dispatch({
        type: "confirmed",
        report: "ℹ️ Snapshot 与当前 head 相同；canonical data 零写入。",
      });
      return;
    }
    dispatch({
      type: "failed",
      message: resultFailureMessage(result),
      consumePreview: true,
    });
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
        <div>
          <p className="eyebrow">ChatGPT Share Snapshot</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            PALOS 不访问 chatgpt.com、不读取 cookie 或 session。URL 只在本次
            capture 的内存中用于规范化和生成 resourceHash。
          </p>
        </div>

        {!isIndexedDBReady ? (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Share Snapshot canonical writer 仅在 IndexedDB 加载完成后可用。
          </p>
        ) : null}

        <label className="block text-sm font-medium text-zinc-800">
          ChatGPT share URL
          <input
            autoComplete="off"
            className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5"
            inputMode="url"
            onChange={(event) =>
              invalidatePreparedState({
                type: "edit-url",
                value: event.target.value,
              })
            }
            placeholder="https://chatgpt.com/share/…"
            spellCheck={false}
            type="url"
            value={state.shareUrl}
          />
        </label>

        <div>
          <p className="text-sm font-medium text-zinc-800">
            Snapshot content source
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              className={`rounded-lg border px-4 py-3 text-left text-sm ${
                state.inputKind === "pasted-text"
                  ? "border-zinc-900 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-800"
              }`}
              onClick={() =>
                invalidatePreparedState({
                  type: "select-input-kind",
                  value: "pasted-text",
                })
              }
              type="button"
            >
              Pasted rendered text
            </button>
            <button
              className={`rounded-lg border px-4 py-3 text-left text-sm ${
                state.inputKind === "saved-html"
                  ? "border-zinc-900 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-800"
              }`}
              onClick={() =>
                invalidatePreparedState({
                  type: "select-input-kind",
                  value: "saved-html",
                })
              }
              type="button"
            >
              Uploaded saved HTML
            </button>
          </div>
        </div>

        {state.inputKind === "saved-html" ? (
          <label className="block text-sm font-medium text-zinc-800">
            Saved HTML file
            <input
              accept=".html,.htm,text/html"
              className="mt-2 block w-full text-sm"
              key={state.fileInputRevision}
              onChange={selectSavedHtml}
              type="file"
            />
            {state.fileName ? (
              <span className="mt-2 block text-xs text-zinc-500">
                {state.fileName} · {state.content.length} local characters
              </span>
            ) : null}
          </label>
        ) : (
          <label className="block text-sm font-medium text-zinc-800">
            Rendered transcript
            <textarea
              className="mt-2 min-h-72 w-full rounded-lg border border-zinc-300 px-4 py-3 font-mono text-sm leading-6"
              onChange={(event) =>
                invalidatePreparedState({
                  type: "edit-content",
                  value: event.target.value,
                })
              }
              placeholder={"User:\nQuestion\n\nAssistant:\nAnswer"}
              value={state.content}
            />
          </label>
        )}

        {importPath === "new" ? (
          <>
            <label className="block text-sm font-medium text-zinc-800">
              Conversation 标题
              <input
                className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5"
                onChange={(event) => {
                  invalidatePreparedState({ type: "target-changed" });
                  onTitleChange(event.target.value);
                }}
                placeholder="ChatGPT Share Snapshot"
                value={title}
              />
            </label>
            <label className="block text-sm font-medium text-zinc-800">
              Workspace
              <select
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
                onChange={(event) => {
                  invalidatePreparedState({ type: "target-changed" });
                  onWorkspaceChange(event.target.value);
                }}
                value={workspaceId}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <p className="rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            Selected target: {selectedTarget?.title ?? "—"}。resourceHash
            解析出的 owner 必须与该选择一致。
          </p>
        )}

        <button
          className="w-full rounded-lg border border-zinc-900 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 disabled:border-zinc-200 disabled:text-zinc-400"
          disabled={!canRequestPreview}
          onClick={previewCapture}
          type="button"
        >
          {state.busy === "previewing"
            ? "Preparing local preview…"
            : "Preview Share Snapshot"}
        </button>

        <p className="text-xs leading-5 text-zinc-500">
          仅处理你主动上传或粘贴的本地内容。确认前不会写入 Source、Message、
          Round 或 Conversation。
        </p>
      </div>

      <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
        {state.preview ? (
          <ShareSnapshotPreviewCard
            preview={state.preview}
            snapshot={snapshot}
            targetError={targetError}
          />
        ) : (
          <p className="text-sm text-zinc-500">
            提供 URL 和本地 Snapshot 内容后生成 comparator preview。
          </p>
        )}

        {state.error ? (
          <p
            className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {state.error}
          </p>
        ) : null}
        {state.report ? (
          <p
            className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            role="status"
          >
            {state.report}
          </p>
        ) : null}

        <button
          className="w-full rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:bg-zinc-300"
          disabled={!canConfirm}
          onClick={confirmCapture}
          type="button"
        >
          {state.busy === "confirming"
            ? "Writing and verifying…"
            : state.preview?.status === "append"
              ? `Confirm append ${state.preview.summary.newMessageCount} Messages`
              : "Confirm save Snapshot"}
        </button>
        <p className="text-xs leading-5 text-zinc-500">
          Same 和 blocked 状态不提供写入按钮。确认时会重新校验 freshness，并由
          canonical writer 在单一事务中写入和 reload verification。
        </p>
        <p className="text-xs leading-5 text-zinc-500">
          请只保存你有权处理的内容；远端分享撤销不会自动删除本地 Snapshot。
        </p>
      </div>
    </section>
  );
}
