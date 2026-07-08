"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  conversationParserIds,
  type ConversationParserId,
} from "@/core/entities/import-parser";
import type { Workspace } from "@/core/entities/workspace";
import type { Conversation } from "@/core/entities/conversation";
import { ImportParserPipeline } from "@/core/services/import-parser-pipeline";
import { ImportService } from "@/core/services/import-service";
import { WorkspaceService } from "@/core/services/workspace-service";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
import { BrowserAppEventLogStorage } from "@/infrastructure/storage/browser-feedback-storage";
import { RoundService } from "@/core/services/round-service";
import { ConversationVersionService } from "@/core/services/conversation-version-service";
import {
  ChatGPTExportImport,
  type ChatGPTExportImportSharedState,
  type ChatGPTExportImportCallbacks,
} from "./chatgpt-export-import";
import type { ChatGPTConversationPreview } from "@/core/services/chatgpt-export-import";
import {
  getStorageMode,
  ensureIndexedDBLoaded,
  createConversationStorage,
  createSourceStorage,
  createMessageStorage,
  createRoundStorage,
  createConversationVersionStorage,
  type StorageMode,
} from "@/infrastructure/storage/storage-factory";
import { flushCachesToIndexedDB } from "@/infrastructure/storage/indexeddb/preload";

const pipeline = new ImportParserPipeline();
const parserLabels: Record<ConversationParserId, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  markdown: "Markdown",
  txt: "TXT",
  manual: "Manual",
};

export function ImportWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetConversationId = searchParams.get("targetConversationId") ?? "";
  const [mode, setMode] = useState<"paste" | "txt" | "json">("paste");
  const [parserId, setParserId] = useState<ConversationParserId>("chatgpt");
  const [artifactName, setArtifactName] = useState("Pasted Conversation");
  const [rawText, setRawText] = useState("");
  const [title, setTitle] = useState("");
  const [workspaceId, setWorkspaceId] = useState("inbox");
  const [importPath, setImportPath] = useState<"new" | "existing">(
    targetConversationId ? "existing" : "new",
  );
  const [existingTargetId, setExistingTargetId] = useState(targetConversationId);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<string | null>(null);
  const [userAliases, setUserAliases] = useState("User, 问, 我, 用户");
  const [assistantAliases, setAssistantAliases] = useState("Assistant, 答, GPT, AI");
  const [separators, setSeparators] = useState("换行 + 角色标签");
  const [manualRounds, setManualRounds] = useState<Array<{ question: string; answer: string }> | null>(null);
  const [manualTarget, setManualTarget] = useState<{ index: number; field: "question" | "answer" } | null>(null);
  const rawTextRef = useRef<HTMLTextAreaElement>(null);
  // P0: Breadcrumb for auto-selecting a newly created conversation as the
  // "import to existing" target. Set before navigating away or right before
  // reload, consumed by loadExistingData.
  const lastCreatedIdRef = useRef<string | null>(null);

  const [existingConversations, setExistingConversations] = useState<Conversation[]>([]);
  const [storageMode, setStorageModeState] = useState<StorageMode>("localStorage");
  const [idbReady, setIdbReady] = useState(false);

  // Shared ChatGPT export file state (P0-1: preserved across path switches)
  const [chatGptFileInfo, setChatGptFileInfo] = useState<{
    name: string;
    size: number;
  } | null>(null);
  const [chatGptLoading, setChatGptLoading] = useState(false);
  const [chatGptParseError, setChatGptParseError] = useState<string | null>(
    null,
  );
  const [chatGptConversations, setChatGptConversations] = useState<
    ChatGPTConversationPreview[]
  >([]);
  const [chatGptLargeWarning, setChatGptLargeWarning] = useState(false);
  const [chatGptSelectedIds, setChatGptSelectedIds] = useState<Set<string>>(
    new Set(),
  );

  const chatGptSharedState: ChatGPTExportImportSharedState = {
    fileInfo: chatGptFileInfo,
    loading: chatGptLoading,
    parseError: chatGptParseError,
    conversations: chatGptConversations,
    largeFileWarning: chatGptLargeWarning,
    selectedIds: chatGptSelectedIds,
  };

  const chatGptCallbacks: ChatGPTExportImportCallbacks = {
    onClearFile: () => {
      setChatGptFileInfo(null);
      setChatGptParseError(null);
      setChatGptConversations([]);
      setChatGptLargeWarning(false);
      setChatGptLoading(false);
    },
    onParseStart: () => {
      setChatGptLoading(true);
      setChatGptParseError(null);
      setChatGptLargeWarning(false);
    },
    onParseError: (error: string) => {
      setChatGptParseError(error);
      setChatGptLoading(false);
    },
    onFileParsed: (
      fileInfo: { name: string; size: number },
      conversations: ChatGPTConversationPreview[],
      isLarge: boolean,
    ) => {
      setChatGptFileInfo(fileInfo);
      setChatGptConversations(conversations);
      setChatGptLargeWarning(isLarge);
      setChatGptLoading(false);
    },
    onSelectedIdsChange: (ids: Set<string>) => {
      setChatGptSelectedIds(ids);
    },
    onImportCompleted: (newIds: string[]) => {
      if (newIds.length > 0) {
        lastCreatedIdRef.current = newIds[0];
      }
      void loadExistingData();
    },
  };

  // R10: Conversation Merge
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergePreview, setMergePreview] = useState<{ sourceTitle: string; sourceMessages: number; sourceRounds: number; targetTitle: string; targetMessages: number; targetRounds: number } | null>(null);
  const [mergeReport, setMergeReport] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      rawText.trim()
        ? pipeline.preview(
            {
              name: artifactName,
              channel: mode === "txt" ? "file" : mode === "paste" ? "clipboard" : "file",
              content: rawText,
              mediaType: mode === "txt" ? "text/plain" : undefined,
            },
            parserId,
          )
        : null,
    [artifactName, mode, parserId, rawText],
  );
  const effectivePreview = useMemo(() => {
    if (!preview || !manualRounds) return preview;
    const messages = manualRounds.flatMap((round) => [
      ...(round.question ? [{ role: "user" as const, content: round.question }] : []),
      ...(round.answer ? [{ role: "assistant" as const, content: round.answer }] : []),
    ]);
    let messageIndex = 0;
    const rounds = manualRounds.map((round, index) => {
      const indexes: number[] = [];
      if (round.question) indexes.push(messageIndex++);
      if (round.answer) indexes.push(messageIndex++);
      return { order: index + 1, title: round.question.split("\n")[0].slice(0, 80) || `Round ${index + 1}`, question: round.question, answer: round.answer, messageIndexes: indexes };
    });
    return { ...preview, parserId: "manual" as const, format: "manual" as const, messages, rounds, messageCount: messages.length, roundCount: rounds.length, unknownMessageCount: 0, canConfirm: rounds.length > 0 && messages.length > 0, warnings: [], errors: [] };
  }, [manualRounds, preview]);

  // P0: Shared data-loading function — called on mount, param change, and window focus.
  // This ensures existingConversations stays fresh when the user creates a
  // Conversation on another page/tab and returns to Import without a hard reload.
  const loadExistingData = useCallback(async () => {
    try {
      const mode = getStorageMode();
      setStorageModeState(mode);
      setIdbReady(mode === "localStorage");
      if (mode === "indexedDB") {
        await ensureIndexedDBLoaded();
      }

      const conversationStorage = createConversationStorage();
      setWorkspaces(
        new WorkspaceService(
          new BrowserWorkspaceStorage(),
          conversationStorage,
        )
          .listWorkspaces()
          .filter((workspace) => !workspace.archivedAt),
      );
      setExistingConversations(conversationStorage.getAll());

      // P0: Auto-select the newly created conversation as "import to existing" target
      const pendingNewId = lastCreatedIdRef.current;
      if (pendingNewId) {
        lastCreatedIdRef.current = null;
        if (conversationStorage.getById(pendingNewId)) {
          setExistingTargetId(pendingNewId);
        }
      }

      setIdbReady(true);
      setError(null);
    } catch {
      setIdbReady(false);
      setError("IndexedDB 数据加载失败，当前页面不会显示空数据作为成功状态。请刷新或切回 LocalStorage。");
    }
  }, []);

  useEffect(() => {
    void loadExistingData();
  }, [loadExistingData, targetConversationId]);

  // P0: Refresh existingConversations when the page regains focus
  // (e.g. user creates a Conversation on another page/tab and returns)
  useEffect(() => {
    function onFocus() {
      void loadExistingData();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadExistingData]);

  // R10: Merge preview
  function previewMerge() {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) {
      setError("请选择不同的源和目标 Conversation。");
      return;
    }
    const convStorage = createConversationStorage();
    const msgStorage = createMessageStorage();
    const roundStorage = createRoundStorage();
    const source = convStorage.getById(mergeSourceId);
    const target = convStorage.getById(mergeTargetId);
    if (!source || !target) { setError("Conversation 不存在。"); return; }
    const sourceMessages = msgStorage.getByConversationId(mergeSourceId);
    const sourceRounds = roundStorage.getByConversationId(mergeSourceId);
    const targetMessages = msgStorage.getByConversationId(mergeTargetId);
    const targetRounds = roundStorage.getByConversationId(mergeTargetId);
    setMergePreview({
      sourceTitle: source.title,
      sourceMessages: sourceMessages.length,
      sourceRounds: sourceRounds.length,
      targetTitle: target.title,
      targetMessages: targetMessages.length,
      targetRounds: targetRounds.length,
    });
    setError(null);
  }

  async function confirmMerge() {
    if (!mergePreview || !mergeSourceId || !mergeTargetId) return;
    if (!window.confirm(`将「${mergePreview.sourceTitle}」的全部内容合并到「${mergePreview.targetTitle}」？\n\n源：${mergePreview.sourceMessages} Messages · ${mergePreview.sourceRounds} Rounds\n目标：${mergePreview.targetMessages} Messages · ${mergePreview.targetRounds} Rounds\n\n合并后目标将包含两边的全部内容。源 Conversation 保持不变。`)) return;
    try {
      const convStorage = createConversationStorage();
      const msgStorage = createMessageStorage();
      const roundStorage = createRoundStorage();
      const versionStorage = createConversationVersionStorage();
      const target = convStorage.getById(mergeTargetId);
      if (!target) { setError("目标 Conversation 不存在。"); return; }

      // Auto-snapshot on target before merge
      new ConversationVersionService({
        conversations: convStorage,
        messages: msgStorage,
        versions: versionStorage,
      }).createSnapshot(mergeTargetId, `自动恢复点 — Merge「${mergePreview.sourceTitle}」`, `合并来自「${mergePreview.sourceTitle}」的内容前自动创建`);

      const sourceMessages = msgStorage.getByConversationId(mergeSourceId);
      const targetMessages = msgStorage.getByConversationId(mergeTargetId);
      const sourceRounds = roundStorage.getByConversationId(mergeSourceId);

      // Append source messages to target
      const maxOrder = targetMessages.reduce((max, m) => Math.max(max, m.order), -1);
      const appendedMessages = sourceMessages.map((msg, i) => ({
        ...msg,
        id: crypto.randomUUID(),
        conversationId: mergeTargetId,
        order: maxOrder + 1 + i,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      msgStorage.replaceByConversationId(mergeTargetId, [...targetMessages, ...appendedMessages]);
      const newMessageIds = appendedMessages.map((m) => m.id);

      // Append source rounds to target
      const roundService = new RoundService(roundStorage);
      for (const round of sourceRounds) {
        const mappedMessageIds = round.messageIds.map((mid) => {
          const idx = sourceMessages.findIndex((m) => m.id === mid);
          return idx >= 0 ? newMessageIds[idx] : undefined;
        }).filter(Boolean) as string[];
        roundService.createRound({
          conversationId: mergeTargetId,
          title: round.title,
          question: round.question,
          answer: round.answer,
          messageIds: mappedMessageIds,
          note: round.note,
          summary: round.summary,
        });
      }

      // Update target conversation timestamp
      convStorage.save({ ...target, updatedAt: new Date().toISOString() });
      if (getStorageMode() === "indexedDB") {
        await flushCachesToIndexedDB();
      }

      setMergeReport(`✅ 已合并：${appendedMessages.length} Messages · ${sourceRounds.length} Rounds →「${mergePreview.targetTitle}」`);
      setMergePreview(null);
      setMergeSourceId("");
      setMergeTargetId("");
    } catch (error) {
      setError(
        error instanceof Error
          ? `合并失败：${error.message}`
          : "合并失败，请确认浏览器允许本地保存后重试。",
      );
    }
  }

  function selectMode(nextMode: "paste" | "txt" | "json") {
    setMode(nextMode);
    setError(null);
    if (nextMode === "txt") setParserId("txt");
  }

  async function selectTxtFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("请选择 .txt 文件。");
      return;
    }
    setArtifactName(file.name);
    setRawText(await file.text());
    setTitle(file.name.replace(/\.txt$/i, ""));
    setError(null);
  }

  async function confirmImport() {
    if (!effectivePreview?.canConfirm) return;
    if (importPath === "existing" && !existingTargetId) {
      setError("请先选择目标 Conversation；新内容会追加到该 Conversation 后面。");
      return;
    }
    try {
      const importService = new ImportService(
        createConversationStorage(),
        createSourceStorage(),
        createMessageStorage(),
        createRoundStorage(),
      );
      if (importPath === "existing") {
        const existingConv = existingConversations.find((c) => c.id === existingTargetId);
        const targetTitle = existingConv?.title ?? "未知";
        const result = importService.appendToConversation(effectivePreview, existingTargetId);
        if (getStorageMode() === "indexedDB") {
          await flushCachesToIndexedDB();
        }
        new BrowserAppEventLogStorage().record("import created", existingTargetId, `appended ${result.messageCount} messages · ${result.roundCount} rounds to "${targetTitle}"`);
        setImportReport(`✅ 已追加到「${targetTitle}」：${result.messageCount} Messages · ${result.roundCount} Rounds`);
        // Refresh existingConversations so updatedAt reflects in the list (P0-2)
        void loadExistingData();
        // Do NOT clear user input or mode (P0-4)
        setError(null);
        return;
      }

      const result = importService.confirm(effectivePreview, { title, workspaceId });
      if (getStorageMode() === "indexedDB") {
        await flushCachesToIndexedDB();
      }

      // P0: Track newly created conversation so loadExistingData auto-selects it
      lastCreatedIdRef.current = result.conversationId;

      new BrowserAppEventLogStorage().record("import created", result.conversationId, `created ${result.roundCount} rounds`);
      // P0-2: Refresh existingConversations immediately after creation
      void loadExistingData();
      setImportReport(`✅ 已新建「${title || effectivePreview.suggestedTitle}」：${result.messageCount} Messages · ${result.roundCount} Rounds`);
      router.push(`/conversation/${result.conversationId}?imported=rounds`);
    } catch (error) {
      setError(
        error instanceof Error
          ? `导入失败：${error.message}`
          : "导入失败，没有报告成功；请确认浏览器允许本地保存后重试。",
      );
    }
  }

  function startManualBuilder() {
    setManualRounds(preview?.rounds.map((round) => ({ question: round.question, answer: round.answer })) ?? [{ question: rawText, answer: "" }]);
  }

  function updateManualRound(index: number, field: "question" | "answer", value: string) {
    setManualRounds((current) => current?.map((round, itemIndex) => itemIndex === index ? { ...round, [field]: value } : round) ?? null);
  }

  function useSelection() {
    if (!manualTarget || !rawTextRef.current) return;
    const selected = rawText.slice(rawTextRef.current.selectionStart, rawTextRef.current.selectionEnd).trim();
    if (selected) updateManualRound(manualTarget.index, manualTarget.field, selected);
  }

  return (
    <section className="mt-8 space-y-6">
      <details className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <summary className="cursor-pointer text-sm font-semibold text-emerald-950">📦 怎么导入 ChatGPT 数据？</summary>
        <ol className="mt-3 list-inside list-decimal space-y-1 text-sm leading-7 text-emerald-900">
          <li>在 ChatGPT 设置（Settings）里选择 <strong>导出数据（Export data）</strong>，等待 OpenAI 发送下载邮件。</li>
          <li>下载 zip 文件并解压，找到 <code className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold">conversations.json</code>。</li>
          <li>在本页面选择 <strong>「📦 导入 ChatGPT Export」</strong>，上传 conversations.json 即可。重复导入会自动去重，只追加新消息。</li>
        </ol>
        <p className="mt-2 text-xs text-emerald-700">注意：当前只导入 User / Assistant 文本；附件、图片、tool call、canvas、voice 与 shared link 会被跳过或不处理。</p>
      </details>

      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-emerald-950">
            当前业务存储：{storageMode === "indexedDB" ? "IndexedDB" : "LocalStorage (legacy/debug)"}
          </p>
          <span className="rounded-full bg-emerald-200 px-3 py-0.5 text-xs font-semibold text-emerald-800">
            默认 IndexedDB
          </span>
        </div>
        <p className="mt-3 text-sm leading-7 text-emerald-900">
          PALOS 默认把 Conversation、Message、Round、Source、Proposal、Knowledge 和 Snapshot 写入 IndexedDB。LocalStorage 仅保留轻量配置、UI 偏好和旧数据迁移兼容。
        </p>
      </div>

      {/* IndexedDB loading state */}
      {storageMode === "indexedDB" && !idbReady ? (
        <div className="mt-3 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
          IndexedDB 数据加载中…
        </div>
      ) : null}

      {/* P0-1: Current mode display banner */}
      <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4">
        <p className="text-sm font-semibold text-zinc-800">
          当前模式：{importPath === "new" ? "新建 Conversation" : "导入到已有 Conversation"}
          {" / "}
          {mode === "json" ? "ChatGPT Export" : mode === "txt" ? "TXT 文件" : "手动文本"}
        </p>
        {importPath === "existing" ? (
          <p className="mt-1 text-sm text-zinc-600">
            当前目标：{existingTargetId && existingConversations.find((c) => c.id === existingTargetId)
              ? existingConversations.find((c) => c.id === existingTargetId)!.title
              : "未选择 — 请先选择目标 Conversation；新内容会追加到该 Conversation 后面。"}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-600">
            将创建新的 Conversation。
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <button
          className={`rounded-xl border p-5 text-left ${
            importPath === "new"
              ? "border-zinc-900 bg-zinc-950 text-white"
              : "border-zinc-200 bg-white text-zinc-900"
          }`}
          onClick={() => setImportPath("new")}
          type="button"
        >
          <span className="block text-lg font-semibold">📄 新建 Conversation</span>
          <span className={`mt-2 block text-sm ${importPath === "new" ? "text-zinc-300" : "text-zinc-500"}`}>
            从 ChatGPT Export 或文本创建一个新的 Conversation。
          </span>
        </button>
        <button
          className={`rounded-xl border p-5 text-left ${
            importPath === "existing"
              ? "border-sky-900 bg-sky-950 text-white"
              : "border-zinc-200 bg-white text-zinc-900"
          }`}
          onClick={() => setImportPath("existing")}
          type="button"
        >
          <span className="block text-lg font-semibold">📥 导入到已有 Conversation</span>
          <span className={`mt-2 block text-sm ${importPath === "existing" ? "text-sky-200" : "text-zinc-500"}`}>
            把新内容追加到已有 Conversation 后面，不覆盖旧内容{targetConversationId ? "（已选择目标）" : ""}。
          </span>
        </button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {([
          ["json", "ChatGPT Export", "导入官方 Export zip 解压后的 conversations.json / conversations-*.json"],
          ["paste", "手动文本", "粘贴多轮问答文本；也可以选择 TXT 文件"],
        ] as const).map(([value, label, description]) => (
          <button
            className={`rounded-xl border p-5 text-left ${(mode === value || (value === "paste" && mode === "txt")) ? "border-zinc-900 bg-zinc-950 text-white" : value === "json" ? "border-emerald-300 bg-emerald-50 text-zinc-900 hover:border-emerald-400" : "border-zinc-200 bg-white text-zinc-900"}`}
            key={value}
            onClick={() => selectMode(value)}
            type="button"
          >
            <span className="block font-semibold">{label}</span>
            <span className={`mt-2 block text-sm ${(mode === value || (value === "paste" && mode === "txt")) ? "text-zinc-300" : "text-zinc-500"}`}>{description}</span>
          </button>
        ))}
      </div>

      {importPath === "existing" ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          {existingConversations.length === 0 ? (
            <p className="text-sm text-amber-700">暂无可追加目标。请先新建一个 Conversation。</p>
          ) : (
            <>
            <label className="block text-sm font-medium text-zinc-800">
              选择目标 Conversation
              <select
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
                onChange={(event) => { setExistingTargetId(event.target.value); setError(null); }}
                value={existingTargetId}
              >
                <option value="">— 请选择 —</option>
                {existingConversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title} ({conversation.sourceType})
                  </option>
                ))}
              </select>
            </label>
            {!existingTargetId ? (
              <p className="mt-2 text-sm text-amber-600">
                ⚠️ 请先选择目标 Conversation；新内容会追加到该 Conversation 后面。
              </p>
            ) : (
              <p className="mt-2 text-sm text-emerald-700">
                新内容将追加到「{existingConversations.find((c) => c.id === existingTargetId)?.title ?? "—"}」后面，不覆盖旧内容。
              </p>
            )}
            </>
          )}
        </div>
      ) : null}

      {mode === "json" ? (
        <ChatGPTExportImport mode={importPath} workspaces={workspaces} existingConversations={existingConversations} sharedState={chatGptSharedState} callbacks={chatGptCallbacks} initialTargetConversationId={existingTargetId || targetConversationId || undefined} />
      ) : (
        <>
          {importPath === "new" ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {([
                ["paste", "粘贴并导入对话", "直接粘贴多轮问答文本；支持六种角色别名"],
                ["txt", "导入 TXT 文件", "从本地纯文本文件导入"],
              ] as const).map(([value, label, description]) => (
                <button
                  className={`rounded-xl border p-5 text-left ${mode === value ? "border-zinc-900 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-900"}`}
                  key={value}
                  onClick={() => selectMode(value)}
                  type="button"
                >
                  <span className="block font-semibold">{label}</span>
                  <span className={`mt-2 block text-sm ${mode === value ? "text-zinc-300" : "text-zinc-500"}`}>{description}</span>
                </button>
              ))}
            </div>
          ) : null}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
            {mode === "txt" ? (
              <label className="block text-sm font-medium text-zinc-800">
                TXT 文件
                <input className="mt-2 block w-full text-sm" accept=".txt,text/plain" onChange={selectTxtFile} type="file" />
              </label>
            ) : (
              <><label className="block text-sm font-medium text-zinc-800">
                Parser
                <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setParserId(event.target.value as ConversationParserId)} value={parserId}>
                  {conversationParserIds.map((id) => <option key={id} value={id}>{parserLabels[id]}</option>)}
                </select>
              </label><details className="rounded-lg border border-zinc-200 p-4"><summary className="cursor-pointer text-sm font-semibold">识别格式 / Role 识别规则</summary><div className="mt-3 grid gap-3"><label className="text-xs font-medium">User role aliases<input className="mt-1 w-full rounded border border-zinc-200 px-3 py-2" onChange={(event) => setUserAliases(event.target.value)} value={userAliases} /></label><label className="text-xs font-medium">Assistant role aliases<input className="mt-1 w-full rounded border border-zinc-200 px-3 py-2" onChange={(event) => setAssistantAliases(event.target.value)} value={assistantAliases} /></label><label className="text-xs font-medium">Separators<input className="mt-1 w-full rounded border border-zinc-200 px-3 py-2" onChange={(event) => setSeparators(event.target.value)} value={separators} /></label><p className="text-xs text-zinc-500">当前 parser type：{parserLabels[parserId]}。</p><p className="mt-1 text-xs font-semibold text-zinc-600">默认支持的角色别名（无需配置）：</p><ul className="mt-1 list-inside list-disc text-xs text-zinc-500"><li>User / Assistant</li><li>用户 / AI</li><li>我 / GPT</li><li>问 / 答</li></ul><p className="mt-2 text-xs text-zinc-500">后续支持自定义 alias。以上输入先作为本次导入记录，不会改变旧数据。</p></div></details></>
            )}
            {importPath === "new" ? (
              <>
                <label className="block text-sm font-medium text-zinc-800">
                  Conversation 标题
                  <input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5" onChange={(event) => setTitle(event.target.value)} placeholder={preview?.suggestedTitle ?? "Imported Conversation"} value={title} />
                </label>
                <label className="block text-sm font-medium text-zinc-800">
                  Workspace
                  <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setWorkspaceId(event.target.value)} value={workspaceId}>
                    {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                  </select>
                </label>
              </>
            ) : null}
            {mode === "paste" ? (
              <label className="block text-sm font-medium text-zinc-800">
                对话原文
                <textarea className="mt-2 min-h-72 w-full rounded-lg border border-zinc-300 px-4 py-3 font-mono text-sm leading-6" onChange={(event) => { setRawText(event.target.value); setManualRounds(null); setError(null); }} placeholder={"User: 你好\nAssistant: 你好！\n\n问：怎么整理？\n答：按 Round 整理。"} ref={rawTextRef} value={rawText} />
              </label>
            ) : null}
          </div>

          <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
            <div>
              <p className="eyebrow">Parser Preview</p>
              {preview ? (
                <p className="mt-2 text-sm text-zinc-700">{parserLabels[effectivePreview?.parserId ?? preview.parserId]} parser v{preview.parserVersion} · {effectivePreview?.messageCount ?? preview.messageCount} Messages · {effectivePreview?.roundCount ?? preview.roundCount} Rounds</p>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">添加内容后显示解析结果。</p>
              )}
            </div>
            {preview?.warnings.map((warning) => <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800" key={warning}>{warning} 建议进入 Manual Round Builder。</p>)}
            {preview ? <button className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100" onClick={startManualBuilder} type="button">✋ 手动整理轮次（Manual Round Builder）</button> : null}
            {manualRounds ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-amber-950">Manual Round Builder</h3><div className="flex gap-2"><button className="text-xs font-semibold" onClick={() => setManualRounds((current) => [...(current ?? []), { question: "", answer: "" }])} type="button">新增 Round</button><button className="text-xs font-semibold" onClick={() => setManualRounds([{ question: rawText, answer: "" }])} type="button">剩余文本作为一个 Round</button><button className="text-xs font-semibold" onClick={() => setManualRounds(rawText.split(/\n\s*\n/).filter((chunk) => chunk.trim()).map((chunk) => ({ question: chunk.trim(), answer: "" })))} type="button">按空行粗分</button></div></div><p className="mt-2 text-xs text-amber-800">在左侧原文选中文本，再点击 question/answer 的“填入选中”按钮。</p><div className="mt-3 max-h-[30rem] space-y-3 overflow-auto">{manualRounds.map((round, index) => <div className="rounded-lg bg-white p-3" key={index}><div className="flex justify-between text-xs font-semibold"><span>Round {index + 1}</span><span className="flex gap-2"><button disabled={index === 0} onClick={() => setManualRounds((current) => { const next = [...(current ?? [])]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} type="button">上移</button><button disabled={index === manualRounds.length - 1} onClick={() => setManualRounds((current) => { const next = [...(current ?? [])]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })} type="button">下移</button><button className="text-red-600" onClick={() => setManualRounds((current) => current?.filter((_, itemIndex) => itemIndex !== index) ?? null)} type="button">删除</button></span></div><label className="mt-2 block text-xs">Question <button className="ml-2 text-sky-700" onClick={() => { setManualTarget({ index, field: "question" }); window.setTimeout(useSelection, 0); }} type="button">填入选中</button><textarea className="mt-1 min-h-20 w-full rounded border border-zinc-200 p-2 text-sm" onChange={(event) => updateManualRound(index, "question", event.target.value)} value={round.question} /></label><label className="mt-2 block text-xs">Answer <button className="ml-2 text-sky-700" onClick={() => { setManualTarget({ index, field: "answer" }); const selected = rawTextRef.current ? rawText.slice(rawTextRef.current.selectionStart, rawTextRef.current.selectionEnd).trim() : ""; if (selected) updateManualRound(index, "answer", selected); }} type="button">填入选中</button><textarea className="mt-1 min-h-20 w-full rounded border border-zinc-200 p-2 text-sm" onChange={(event) => updateManualRound(index, "answer", event.target.value)} value={round.answer} /></label></div>)}</div></section> : null}
            {effectivePreview ? (
              <div>
                <p className="eyebrow">Round Preview</p>
                <ol className="mt-3 max-h-[28rem] space-y-3 overflow-auto">
                  {effectivePreview.rounds.map((round) => (
                    <li className="rounded-lg border border-zinc-200 p-4" key={round.order}>
                      <p className="text-xs font-semibold text-zinc-500">Round {round.order}</p>
                      <p className="mt-2 font-medium text-zinc-900">{round.question || "（无问题）"}</p>
                      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{round.answer || "（无回答）"}</p>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}
            {importReport ? <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{importReport}</p> : null}
            <button className="w-full rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:bg-zinc-300" disabled={!idbReady || !effectivePreview?.canConfirm || (importPath === "new" ? !title.trim() : !existingTargetId)} onClick={confirmImport} type="button">
              {importPath === "new"
                ? "导入为新 Conversation"
                : existingTargetId
                  ? `追加文本到目标 Conversation「${existingConversations.find((c) => c.id === existingTargetId)?.title ?? "—"}」`
                  : "请先选择目标 Conversation"}
            </button>
            <p className="text-xs leading-5 text-zinc-500">确认前不会写入 Conversation、Message 或 Round。</p>
            <p className="text-xs leading-5 text-zinc-500">ChatGPT shared link 与浏览器插件入口为未来保留；本版本不实现抓取网页或读取浏览器历史。</p>
          </div>
        </div>
        </>
      )}

      {/* R10: Merge Conversation */}
      <details className="mt-6 rounded-xl border border-purple-200 bg-purple-50 p-5">
        <summary className="cursor-pointer text-sm font-semibold text-purple-950">🔀 Merge Conversation / 合并对话</summary>
        <p className="mt-2 text-xs text-purple-800">将源 Conversation 的全部 Messages 和 Rounds 追加到目标 Conversation。合并前自动创建快照，源 Conversation 保持不变。</p>
        {mergeReport ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">{mergeReport}</p>
            <div className="mt-3 flex gap-2">
              <Link className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800" href={`/conversation/${mergeTargetId}`}>打开目标 Conversation →</Link>
              <button className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-800" onClick={() => { setMergeReport(null); setMergeSourceId(""); setMergeTargetId(""); }} type="button">执行其他合并</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-zinc-800">
                源 Conversation（内容来源）
                <select
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
                  onChange={(event) => { setMergeSourceId(event.target.value); setMergePreview(null); }}
                  value={mergeSourceId}
                >
                  <option value="">— 请选择 —</option>
                  {existingConversations.map((conv) => (
                    <option key={conv.id} value={conv.id} disabled={conv.id === mergeTargetId}>{conv.title} ({conv.sourceType})</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-zinc-800">
                目标 Conversation（合并到）
                <select
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
                  onChange={(event) => { setMergeTargetId(event.target.value); setMergePreview(null); }}
                  value={mergeTargetId}
                >
                  <option value="">— 请选择 —</option>
                  {existingConversations.map((conv) => (
                    <option key={conv.id} value={conv.id} disabled={conv.id === mergeSourceId}>{conv.title} ({conv.sourceType})</option>
                  ))}
                </select>
              </label>
            </div>
            {mergeSourceId && mergeTargetId && mergeSourceId !== mergeTargetId ? (
              <button className="rounded-lg border border-purple-300 bg-white px-4 py-2 text-sm font-semibold text-purple-800 hover:bg-purple-100" onClick={previewMerge} type="button">Preview Merge</button>
            ) : null}
            {mergePreview ? (
              <div className="rounded-lg border border-purple-200 bg-white p-4">
                <p className="text-sm font-semibold text-purple-950">Merge Preview</p>
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <p className="font-semibold text-zinc-700">源：{mergePreview.sourceTitle}</p>
                    <p className="mt-1 text-xs text-zinc-500">{mergePreview.sourceMessages} Messages · {mergePreview.sourceRounds} Rounds</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <p className="font-semibold text-zinc-700">目标：{mergePreview.targetTitle}</p>
                    <p className="mt-1 text-xs text-zinc-500">{mergePreview.targetMessages} Messages · {mergePreview.targetRounds} Rounds（合并前）</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-zinc-500">合并后目标将包含 {mergePreview.targetMessages + mergePreview.sourceMessages} Messages · {mergePreview.targetRounds + mergePreview.sourceRounds} Rounds。</p>
                <div className="mt-3 flex gap-2">
                  <button className="rounded-lg bg-purple-700 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-800 disabled:bg-zinc-300" disabled={!idbReady} onClick={confirmMerge} type="button">Confirm Merge</button>
                  <button className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-600" onClick={() => setMergePreview(null)} type="button">Cancel</button>
                </div>
              </div>
            ) : null}
            {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}
          </div>
        )}
      </details>
    </section>
  );
}
