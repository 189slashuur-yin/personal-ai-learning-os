"use client";

import { type ChangeEvent, useMemo, useState } from "react";
import Link from "next/link";
import type { Workspace } from "@/core/entities/workspace";
import type { Conversation } from "@/core/entities/conversation";
import {
  ChatGPTExportImportService,
  type ChatGPTConversationPreview,
} from "@/core/services/chatgpt-export-import";
import { BrowserAppEventLogStorage } from "@/infrastructure/storage/browser-feedback-storage";
import {
  createConversationStorage,
  createMessageStorage,
  createRoundStorage,
  createSourceStorage,
  getStorageMode,
} from "@/infrastructure/storage/storage-factory";
import {
  clearCaches,
  flushCachesToIndexedDB,
  preloadAll,
} from "@/infrastructure/storage/indexeddb/preload";
import { readAll } from "@/infrastructure/storage/indexeddb/database";
import type { Message } from "@/core/entities/message";
import type { Round } from "@/core/entities/round";

const FILE_PATTERN = /^conversations(?:-[^.]+)?\.json$/;
const LARGE_FILE_THRESHOLD = 20 * 1024 * 1024;

// ---- Import Storage Quota Guard ----
// Thresholds vary by storage engine
const LS_MAX_SELECTED_MESSAGES = 3000;
const LS_MAX_TOTAL_CHARS = 2_000_000;
const IDB_MAX_SELECTED_MESSAGES = 30000;
const IDB_MAX_TOTAL_CHARS = 20_000_000;

function getQuotaThresholds(): {
  maxMessages: number;
  maxChars: number;
} {
  const mode = getStorageMode();
  if (mode === "indexedDB") {
    return { maxMessages: IDB_MAX_SELECTED_MESSAGES, maxChars: IDB_MAX_TOTAL_CHARS };
  }
  return { maxMessages: LS_MAX_SELECTED_MESSAGES, maxChars: LS_MAX_TOTAL_CHARS };
}

function estimateSelectedSize(
  conversations: ChatGPTConversationPreview[],
  selectedIds: Set<string>,
): { totalMessages: number; totalChars: number } {
  let totalMessages = 0;
  let totalChars = 0;
  for (const c of conversations) {
    if (selectedIds.has(c.externalConversationId)) {
      totalMessages += c.messages.length;
      for (const msg of c.messages) {
        totalChars += msg.content.length;
      }
    }
  }
  return { totalMessages, totalChars };
}

function getQuotaExceededMessage(): string {
  return getStorageMode() === "indexedDB"
    ? "所选内容超过 30000 条 Message 或 2000 万字符。浏览器可能短暂无响应，请确认后继续。"
    : "当前使用浏览器 LocalStorage legacy/debug 模式，所选内容较大。建议改用默认 IndexedDB；仍可确认后继续。";
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function service() {
  return new ChatGPTExportImportService(
    createConversationStorage(),
    createSourceStorage(),
    createMessageStorage(),
    createRoundStorage(),
  );
}

async function persistIndexedDBImportIfNeeded(): Promise<void> {
  if (getStorageMode() !== "indexedDB") return;
  await flushCachesToIndexedDB();
}

async function restoreIndexedDBCachesAfterFailure(): Promise<void> {
  if (getStorageMode() !== "indexedDB") return;
  clearCaches();
  await preloadAll();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function estimateRounds(conv: ChatGPTConversationPreview): number {
  let rounds = 0;
  for (let i = 0; i < conv.messages.length; i++) {
    if (conv.messages[i].role === "user") rounds += 1;
  }
  return rounds;
}

// ---- Batch Import Report Types ----

type BatchReportItem = {
  title: string;
  status: "success" | "failed" | "skipped-duplicate";
  conversationId?: string;
  messageCount: number;
  roundCount: number;
  skipped: number;
  unsupported: number;
  error?: string;
};

type BatchReport = {
  items: BatchReportItem[];
  totalSuccess: number;
  totalFailed: number;
  totalMessages: number;
  totalRounds: number;
  totalSkipped: number;
  totalUnsupported: number;
  /** Only set in "existing" mode */
  targetTitle?: string;
  /** Set when import stopped due to localStorage quota */
  stoppedByQuota: boolean;
  /** Suggestion for next steps when quota is hit */
  suggestion?: string;
};

// ---- Shared Props (lifted from parent) ----

export interface ChatGPTExportImportSharedState {
  fileInfo: { name: string; size: number } | null;
  loading: boolean;
  parseError: string | null;
  conversations: ChatGPTConversationPreview[];
  largeFileWarning: boolean;
  selectedIds: Set<string>;
}

export interface ChatGPTExportImportCallbacks {
  onClearFile: () => void;
  onParseStart: () => void;
  onParseError: (error: string) => void;
  onFileParsed: (
    fileInfo: { name: string; size: number },
    conversations: ChatGPTConversationPreview[],
    isLarge: boolean,
  ) => void;
  onSelectedIdsChange: (ids: Set<string>) => void;
  /** P0: Called after batch import completes so the parent can refresh existingConversations. */
  onImportCompleted?: (newConversationIds: string[]) => void;
}

// ---- Helpers ----

/** Compute cumulative append preview across multiple source conversations. */
function computeMultiAppendPreview(
  conversations: ChatGPTConversationPreview[],
  selectedIds: Set<string>,
  targetId: string,
): { newMessages: number; skipped: number; existingTotal: number } | null {
  const selected = conversations.filter((c) =>
    selectedIds.has(c.externalConversationId),
  );
  if (selected.length === 0 || !targetId) return null;

  const existingMessages = createMessageStorage().getByConversationId(targetId);
  const seenExternalIds = new Set(
    existingMessages.flatMap((m) =>
      m.externalMessageId ? [m.externalMessageId] : [],
    ),
  );

  // Build content-hash set from existing messages
  function fnv1a(input: string): string {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  const seenHashes = new Set(
    existingMessages.map(
      (m) =>
        m.contentHash ??
        fnv1a(`${m.role}\u0000${m.content.replace(/\s+/g, " ").trim()}`),
    ),
  );

  let totalNew = 0;
  let totalSkipped = 0;

  for (const conv of selected) {
    for (const msg of conv.messages) {
      if (msg.externalMessageId && seenExternalIds.has(msg.externalMessageId)) {
        totalSkipped++;
      } else if (seenHashes.has(msg.contentHash)) {
        totalSkipped++;
      } else {
        totalNew++;
        if (msg.externalMessageId) seenExternalIds.add(msg.externalMessageId);
        seenHashes.add(msg.contentHash);
      }
    }
  }

  return {
    newMessages: totalNew,
    skipped: totalSkipped,
    existingTotal: existingMessages.length,
  };
}

/** Sum estimated rounds across multiple conversations. */
function sumEstimatedRounds(
  conversations: ChatGPTConversationPreview[],
  selectedIds: Set<string>,
): number {
  let total = 0;
  for (const c of conversations) {
    if (selectedIds.has(c.externalConversationId)) total += estimateRounds(c);
  }
  return total;
}

/** Sum unsupported counts across selected conversations. */
function sumUnsupported(
  conversations: ChatGPTConversationPreview[],
  selectedIds: Set<string>,
): number {
  let total = 0;
  for (const c of conversations) {
    if (selectedIds.has(c.externalConversationId)) total += c.unsupportedCount;
  }
  return total;
}

// ---- Component ----

export function ChatGPTExportImport({
  mode,
  workspaces,
  existingConversations,
  sharedState,
  callbacks,
  targetConversationId,
}: {
  mode: "new" | "existing";
  workspaces: Workspace[];
  existingConversations: Conversation[];
  sharedState: ChatGPTExportImportSharedState;
  callbacks: ChatGPTExportImportCallbacks;
  /** P0-B: Controlled target conversation ID from parent ImportWorkbench. */
  targetConversationId: string;
}) {
  const {
    fileInfo,
    loading,
    parseError,
    conversations,
    largeFileWarning,
    selectedIds,
  } = sharedState;
  const {
    onClearFile,
    onParseStart,
    onParseError,
    onFileParsed,
    onSelectedIdsChange,
  } = callbacks;

  // ---- Local UI state ----
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState("inbox");
  const [batchReport, setBatchReport] = useState<BatchReport | null>(null);

  // ---- Derived ----
  const selectedConversations = useMemo(
    () =>
      conversations.filter((c) => selectedIds.has(c.externalConversationId)),
    [conversations, selectedIds],
  );

  const multiAppendPreview = useMemo(() => {
    if (mode !== "existing" || !targetConversationId) return null;
    return computeMultiAppendPreview(
      conversations,
      selectedIds,
      targetConversationId,
    );
  }, [mode, conversations, selectedIds, targetConversationId]);

  /** Aggregate duplicate prediction across selected conversations (new mode). */
  const newModeDuplicatePreview = useMemo(() => {
    if (mode !== "new") return null;
    const selected = conversations.filter((c) =>
      selectedIds.has(c.externalConversationId),
    );
    if (selected.length === 0) return null;
    let totalDuplicateConversations = 0;
    let totalDuplicateMessages = 0;
    for (const conv of selected) {
      const preview = service().previewImport(conv);
      if (preview.existingConversationId) {
        totalDuplicateConversations += 1;
      }
      totalDuplicateMessages += preview.skippedDuplicates;
    }
    return { duplicateConversations: totalDuplicateConversations, duplicateMessages: totalDuplicateMessages };
  }, [mode, conversations, selectedIds]);

  const thresholds = useMemo(() => getQuotaThresholds(), []);
  const { maxMessages: MAX_SELECTED_MESSAGES, maxChars: MAX_TOTAL_CHARS } =
    thresholds;
  const quotaExceededMessage = useMemo(() => getQuotaExceededMessage(), []);

  const allSelected =
    conversations.length > 0 && selectedIds.size === conversations.length;

  // ---- Selection helpers ----
  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function selectAll() {
    onSelectedIdsChange(
      new Set(conversations.map((c) => c.externalConversationId)),
    );
  }

  function deselectAll() {
    onSelectedIdsChange(new Set());
  }

  // ---- File selection ----
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset all state
    onClearFile();
    onSelectedIdsChange(new Set());
    setBatchReport(null);
    setStatus(null);

    if (!FILE_PATTERN.test(file.name)) {
      onParseError(
        "请选择 conversations.json 或 conversations-*.json（例如 conversations-000.json）。不支持直接读取 zip 文件。",
      );
      return;
    }

    const isLarge = file.size > LARGE_FILE_THRESHOLD;
    onParseStart();

    try {
      const text = await file.text();
      const parsed = service().parseExport(text);
      onFileParsed({ name: file.name, size: file.size }, parsed, isLarge);
    } catch (error) {
      onParseError(
        error instanceof Error
          ? error.message
          : "无法解析文件，请确认是有效的 ChatGPT Export JSON。",
      );
    }
  }

  // ---- Batch import (new mode) ----
  async function confirmBatchNewImport() {
    if (selectedConversations.length === 0) return;

    // Large import guard: warn and ask for explicit confirmation, but do not hard block.
    const sizeEstimate = estimateSelectedSize(conversations, selectedIds);
    if (
      sizeEstimate.totalMessages > MAX_SELECTED_MESSAGES ||
      sizeEstimate.totalChars > MAX_TOTAL_CHARS
    ) {
      const confirmed = window.confirm(
        `${quotaExceededMessage}\n\n将导入 ${sizeEstimate.totalMessages} 条 Message，约 ${sizeEstimate.totalChars.toLocaleString()} 字符。继续？`,
      );
      if (!confirmed) return;
    }

    setImporting(true);
    setStatus(null);

    const items: BatchReportItem[] = [];
    let totalSuccess = 0;
    const totalFailed = 0;
    let totalMessages = 0;
    let totalRounds = 0;
    let totalSkipped = 0;
    let totalUnsupported = 0;
    let stoppedByQuota = false;

    try {
      for (const conv of selectedConversations) {
        const preview = service().previewImport(conv);
        const result = service().importConversation(preview, {
          workspaceId,
          forceNew: true,
        });

        // P0-E: Detect skipped duplicate conversations
        const isSkippedDuplicate = !!(result as Record<string, unknown>).skippedDuplicateConversation;

        if (isSkippedDuplicate) {
          totalSkipped += result.skipped;
          totalUnsupported += conv.unsupportedCount;
          items.push({
            title: conv.title,
            status: "skipped-duplicate",
            conversationId: result.conversationId,
            messageCount: 0,
            roundCount: 0,
            skipped: result.skipped,
            unsupported: conv.unsupportedCount,
          });
          continue;
        }

        new BrowserAppEventLogStorage().record(
          "import created",
          result.conversationId,
          `ChatGPT new ${result.appended} messages`,
        );
        totalSuccess++;
        totalMessages += result.appended;
        totalRounds += result.roundsCreated;
        totalSkipped += result.skipped;
        totalUnsupported += conv.unsupportedCount;
        items.push({
          title: conv.title,
          status: "success",
          conversationId: result.conversationId,
          messageCount: result.appended,
          roundCount: result.roundsCreated,
          skipped: result.skipped,
          unsupported: conv.unsupportedCount,
        });
      }
      await persistIndexedDBImportIfNeeded();
    } catch (error) {
      if (isQuotaExceededError(error)) {
        stoppedByQuota = true;
      } else {
        await restoreIndexedDBCachesAfterFailure();
        setBatchReport(null);
        setStatus(
          error instanceof Error
            ? `❌ IndexedDB 写入失败：${error.message}`
            : "❌ IndexedDB 写入失败，没有报告成功。",
        );
        setImporting(false);
        return;
      }
    }

    setBatchReport({
      items,
      totalSuccess,
      totalFailed,
      totalMessages,
      totalRounds,
      totalSkipped,
      totalUnsupported,
      stoppedByQuota,
      suggestion: stoppedByQuota
        ? getStorageMode() === "indexedDB"
          ? "建议：减少选择数量（IndexedDB 模式建议单次不超过 30000 条 Message），或分批导入。"
          : "建议：减少选择数量（每次导入少量重要对话），或先清理 0 Message / 0 Round 的失败对话。建议迁移到 IndexedDB（设置页）以支持更大批量。"
        : undefined,
    });

    setStatus(
      stoppedByQuota
        ? `⚠️ 存储配额已满，导入已停止。已成功 ${totalSuccess} 个，剩余内容未导入。`
        : totalSuccess === 0 && totalSkipped > 0
          ? `ℹ️ 全部已存在：${totalSkipped} Messages 已跳过，未创建新 Conversation。`
          : totalFailed === 0
            ? `✅ 全部导入成功：${totalSuccess} 个 Conversation`
            : `⚠️ 部分成功：${totalSuccess} 成功 · ${totalFailed} 失败`,
    );
    setImporting(false);
    // P0: Notify parent to refresh existingConversations so "import to existing" unlocks
    const newIds = items
      .filter((i) => i.status === "success" && i.conversationId)
      .map((i) => i.conversationId!);
    if (newIds.length > 0) {
      callbacks.onImportCompleted?.(newIds);
    }
    if (!stoppedByQuota) onSelectedIdsChange(new Set());
  }

  // ---- Batch append (existing mode) ----
  async function confirmBatchAppend() {
    if (selectedConversations.length === 0 || !targetConversationId) return;

    // Large import guard: warn and ask for explicit confirmation, but do not hard block.
    const sizeEstimate = estimateSelectedSize(conversations, selectedIds);
    if (
      sizeEstimate.totalMessages > MAX_SELECTED_MESSAGES ||
      sizeEstimate.totalChars > MAX_TOTAL_CHARS
    ) {
      const confirmed = window.confirm(
        `${quotaExceededMessage}\n\n将追加 ${sizeEstimate.totalMessages} 条 Message，约 ${sizeEstimate.totalChars.toLocaleString()} 字符。继续？`,
      );
      if (!confirmed) return;
    }

    const targetConv = existingConversations.find(
      (c) => c.id === targetConversationId,
    );
    setImporting(true);
    setStatus(null);

    const items: BatchReportItem[] = [];
    let totalSuccess = 0;
    const totalFailed = 0;
    let totalMessages = 0;
    let totalRounds = 0;
    let totalSkipped = 0;
    let totalUnsupported = 0;
    let stoppedByQuota = false;

    try {
      for (const conv of selectedConversations) {
        const result = service().appendToConversation(
          conv,
          targetConversationId,
        );

        // P0-E: Detect source-level duplicate (skippedExistingSource from service)
        // This is set when the source was previously appended to this target.
        const isFullySkipped = !!(result as Record<string, unknown>).skippedExistingSource;

        if (isFullySkipped) {
          totalSkipped += result.skipped;
          totalUnsupported += result.unsupported;
          items.push({
            title: conv.title,
            status: "skipped-duplicate",
            conversationId: targetConversationId,
            messageCount: 0,
            roundCount: 0,
            skipped: result.skipped,
            unsupported: result.unsupported,
          });
          continue;
        }

        new BrowserAppEventLogStorage().record(
          "import created",
          targetConversationId,
          `ChatGPT append ${result.appendedMessages} messages from "${conv.title}"`,
        );
        totalSuccess++;
        totalMessages += result.appendedMessages;
        totalRounds += result.appendedRounds;
        totalSkipped += result.skipped;
        totalUnsupported += result.unsupported;
        items.push({
          title: conv.title,
          status: "success",
          conversationId: targetConversationId,
          messageCount: result.appendedMessages,
          roundCount: result.appendedRounds,
          skipped: result.skipped,
          unsupported: result.unsupported,
        });
      }
      await persistIndexedDBImportIfNeeded();

      // [v1.4.6] Post-persist verification: ensure appended data survived the flush
      // by reading directly from IndexedDB (not cache).  If messages/rounds
      // were reported as appended but are not found in IDB, the persist
      // failed silently and we must NOT show a success report.
      if (totalMessages > 0 && getStorageMode() === "indexedDB") {
        const idbMessages = await readAll<Message>("messages");
        const targetMessagesInIDB = idbMessages.filter(
          (m) => m.conversationId === targetConversationId,
        );
        if (targetMessagesInIDB.length === 0) {
          await restoreIndexedDBCachesAfterFailure();
          setBatchReport(null);
          setStatus(
            "❌ 持久化验证失败：IndexedDB 中未找到目标 Conversation 的 Messages。追加可能未写入，没有报告成功。",
          );
          setImporting(false);
          return;
        }

        if (totalRounds > 0) {
          const idbRounds = await readAll<Round>("rounds");
          const targetRoundsInIDB = idbRounds.filter(
            (r) => r.conversationId === targetConversationId,
          );
          if (targetRoundsInIDB.length === 0) {
            console.warn(
              "[confirmBatchAppend] Rounds not found in IDB after flush — messages OK. Rounds may have failed to parse.",
            );
            // Don't fail entirely — messages are the critical data
          }
        }
      }
    } catch (error) {
      if (isQuotaExceededError(error)) {
        stoppedByQuota = true;
      } else {
        await restoreIndexedDBCachesAfterFailure();
        setBatchReport(null);
        setStatus(
          error instanceof Error
            ? `❌ IndexedDB 写入失败：${error.message}`
            : "❌ IndexedDB 写入失败，没有报告成功。",
        );
        setImporting(false);
        return;
      }
    }

    setBatchReport({
      items,
      totalSuccess,
      totalFailed,
      totalMessages,
      totalRounds,
      totalSkipped,
      totalUnsupported,
      targetTitle: targetConv?.title,
      stoppedByQuota,
      suggestion: stoppedByQuota
        ? getStorageMode() === "indexedDB"
          ? "建议：减少选择数量（IndexedDB 模式建议单次不超过 30000 条 Message），或分批追加。"
          : "建议：减少选择数量（每次导入少量重要对话），或先清理 0 Message / 0 Round 的失败对话。建议迁移到 IndexedDB（设置页）以支持更大批量。"
        : undefined,
    });

    setStatus(
      stoppedByQuota
        ? `⚠️ 存储配额已满，追加已停止。已成功 ${totalSuccess} 个源，剩余内容未追加。`
        : totalSuccess === 0 && totalSkipped > 0
          ? `ℹ️ 全部已存在：${totalSkipped} Messages 已跳过，未追加新内容到「${targetConv?.title ?? "—"}」。`
          : totalFailed === 0
            ? `✅ 已追加到「${targetConv?.title ?? "—"}」：${totalMessages} Messages · ${totalRounds} Rounds（来自 ${totalSuccess} 个源，未创建新 Conversation）`
            : `⚠️ 部分成功：${totalSuccess} 成功 · ${totalFailed} 失败`,
    );
    setImporting(false);
    // P0: Notify parent to refresh existingConversations after successful append
    if (totalSuccess > 0) {
      callbacks.onImportCompleted?.([targetConversationId]);
    }
    if (!stoppedByQuota) onSelectedIdsChange(new Set());
  }

  // ---- First selected for detail preview ----
  const firstSelected = selectedConversations[0] ?? null;

  // ---- Target conversation info ----
  const targetConv = existingConversations.find(
    (c) => c.id === targetConversationId,
  );

  const estimatedRounds = sumEstimatedRounds(conversations, selectedIds);

  const selectedSizeEstimate = useMemo(
    () => estimateSelectedSize(conversations, selectedIds),
    [conversations, selectedIds],
  );

  const exceedsQuotaThreshold =
    selectedSizeEstimate.totalMessages > MAX_SELECTED_MESSAGES ||
    selectedSizeEstimate.totalChars > MAX_TOTAL_CHARS;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <p className="eyebrow">ChatGPT Official Export</p>
      <h2 className="mt-2 text-lg font-semibold">
        {mode === "new" ? "导入为新 Conversation" : "追加到已有 Conversation"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        先在 ChatGPT 导出 zip 中解压文件，再选择 conversations.json 或
        conversations-*.json。 当前不解析 zip、附件、图片、tool call、canvas、voice
        或 shared link。
      </p>

      {/* P0-1: Current mode indicator */}
      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <p className="text-sm font-semibold text-zinc-800">
          当前模式：{mode === "new" ? "新建 Conversation" : "导入到已有 Conversation"} / ChatGPT Export
        </p>
        {mode === "existing" ? (
          <p className="mt-1 text-sm text-zinc-600">
            当前目标：{targetConversationId && targetConv
              ? targetConv.title
              : "未选择 — 请先选择目标 Conversation；新内容会追加到该 Conversation 后面。"}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-600">
            将为每个选中的 Conversation 创建一个新的 Conversation。
          </p>
        )}
      </div>

      {/* ---- File picker ---- */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label
          className={`inline-block cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-semibold ${
            mode === "existing" && (!targetConversationId || existingConversations.length === 0)
              ? "pointer-events-none border-zinc-200 text-zinc-300"
              : "border-zinc-300 hover:border-zinc-500"
          }`}
        >
          选择 conversations.json / conversations-*.json
          <input
            accept=".json,application/json"
            className="sr-only"
            disabled={
              mode === "existing" &&
              (!targetConversationId || existingConversations.length === 0)
            }
            onChange={chooseFile}
            type="file"
          />
        </label>
        {mode === "existing" && !targetConversationId && existingConversations.length > 0 ? (
          <span className="text-xs text-amber-600">
            ⚠️ 请先在上方选择目标 Conversation
          </span>
        ) : null}
        {mode === "existing" && existingConversations.length === 0 ? (
          <span className="text-xs text-amber-600">
            ⚠️ 暂无可追加目标，请先新建或导入一个 Conversation
          </span>
        ) : null}
      </div>

      {/* ---- Clear file button ---- */}
      {fileInfo && !loading ? (
        <button
          className="ml-3 inline-block rounded-lg border border-red-200 px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50"
          onClick={() => {
            onClearFile();
            onSelectedIdsChange(new Set());
            setBatchReport(null);
            setStatus(null);
          }}
          type="button"
        >
          🗑 清空当前文件
        </button>
      ) : null}

      {/* ---- Large file warning ---- */}
      {largeFileWarning && loading ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          大文件解析中，请等待，浏览器可能短暂无响应。
        </p>
      ) : null}

      {/* ---- Loading indicator ---- */}
      {loading && !largeFileWarning ? (
        <p className="mt-3 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
          解析中…
        </p>
      ) : null}

      {/* ---- Parse error ---- */}
      {parseError ? (
        <p
          className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {parseError}
        </p>
      ) : null}

      {/* ---- File info ---- */}
      {fileInfo && !loading && !parseError ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-emerald-900">
              ✅ 文件解析成功
            </p>
            <span className="text-xs text-emerald-700">
              {selectedIds.size} / {conversations.length} 已选择
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs text-emerald-800">
            <span>
              <span className="font-semibold">文件名：</span>
              {fileInfo.name}
            </span>
            <span>
              <span className="font-semibold">大小：</span>
              {formatSize(fileInfo.size)}
            </span>
            <span>
              <span className="font-semibold">Conversations：</span>
              {conversations.length}
            </span>
          </div>
        </div>
      ) : null}

      {/* ---- Conversation list + preview ---- */}
      {conversations.length > 0 && !loading ? (
        <>
          {/* Selection toolbar */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
              onClick={selectAll}
              type="button"
              disabled={allSelected}
            >
              全选
            </button>
            <button
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
              onClick={deselectAll}
              type="button"
              disabled={selectedIds.size === 0}
            >
              取消全选
            </button>
            <span className="ml-2 text-xs text-zinc-500">
              {selectedIds.size} / {conversations.length} 已选择
              {selectedIds.size > 0
                ? ` · ~${estimatedRounds} Rounds · ${sumUnsupported(conversations, selectedIds)} unsupported`
                : ""}
            </span>
          </div>

          <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            {/* Conversation list with checkboxes */}
            <div className="max-h-[32rem] space-y-1 overflow-auto">
              {conversations.map((conv) => {
                const isSelected = selectedIds.has(conv.externalConversationId);
                return (
                  <button
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${
                      isSelected
                        ? "border-zinc-950 bg-zinc-50"
                        : "border-zinc-200"
                    }`}
                    key={conv.externalConversationId}
                    onClick={() => toggleSelect(conv.externalConversationId)}
                    type="button"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() =>
                        toggleSelect(conv.externalConversationId)
                      }
                      className="h-4 w-4 accent-zinc-950"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {conv.title}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {conv.messages.length} Messages · ~
                        {estimateRounds(conv)} Rounds ·{" "}
                        {conv.unsupportedCount} unsupported
                        {conv.isLarge ? (
                          <span className="ml-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                            大型
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail preview for first selected */}
            {firstSelected ? (
              <div className="rounded-lg border border-zinc-200 p-4">
                <h3 className="font-semibold">
                  {selectedConversations.length > 1
                    ? `已选 ${selectedConversations.length} 个 Conversation`
                    : firstSelected.title}
                </h3>
                {selectedConversations.length > 1 ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    预览第一个：{firstSelected.title}
                  </p>
                ) : null}

                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500">选中数量</dt>
                    <dd>{selectedConversations.length}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">
                      Messages（所选合计预览）
                    </dt>
                    <dd>
                      {selectedSizeEstimate.totalMessages}
                      {selectedSizeEstimate.totalMessages >
                      MAX_SELECTED_MESSAGES ? (
                        <span className="ml-1 text-xs text-red-600">
                          （超出建议上限 {MAX_SELECTED_MESSAGES}）
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">总字符数（所选合计）</dt>
                    <dd>
                      {selectedSizeEstimate.totalChars.toLocaleString()}
                      {selectedSizeEstimate.totalChars > MAX_TOTAL_CHARS ? (
                        <span className="ml-1 text-xs text-red-600">
                          （超出建议上限 {MAX_TOTAL_CHARS.toLocaleString()}）
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Rounds (est)</dt>
                    <dd>{estimatedRounds}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Unsupported</dt>
                    <dd>
                      {sumUnsupported(conversations, selectedIds)}（跳过）
                    </dd>
                  </div>
                  {mode === "new" && newModeDuplicatePreview && newModeDuplicatePreview.duplicateMessages > 0 ? (
                    <div>
                      <dt className="text-amber-700">重复预测（已存在）</dt>
                      <dd className="text-amber-700">
                        {newModeDuplicatePreview.duplicateConversations > 0
                          ? `${newModeDuplicatePreview.duplicateConversations} 个 Conversation 已存在`
                          : ""}
                        {newModeDuplicatePreview.duplicateMessages > 0
                          ? ` · ${newModeDuplicatePreview.duplicateMessages} Messages 将跳过`
                          : ""}
                      </dd>
                    </div>
                  ) : null}
                  {firstSelected.createTime ? (
                    <div>
                      <dt className="text-zinc-500">Create time</dt>
                      <dd>
                        {new Date(firstSelected.createTime).toLocaleString(
                          "zh-CN",
                        )}
                      </dd>
                    </div>
                  ) : null}
                  {firstSelected.updateTime ? (
                    <div>
                      <dt className="text-zinc-500">Update time</dt>
                      <dd>
                        {new Date(firstSelected.updateTime).toLocaleString(
                          "zh-CN",
                        )}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {/* Append preview (existing mode) */}
                {mode === "existing" && targetConversationId && multiAppendPreview ? (
                  <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <p className="text-sm font-semibold text-sky-900">
                      追加预览
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-sky-800">
                      <div>
                        <span className="font-semibold">目标：</span>
                        {targetConv?.title ?? "—"}
                      </div>
                      <div>
                        <span className="font-semibold">
                          当前 Messages：
                        </span>
                        {multiAppendPreview.existingTotal}
                      </div>
                      <div>
                        <span className="font-semibold">选中源：</span>
                        {selectedConversations.length} 个
                      </div>
                      <div>
                        <span className="font-semibold">将追加：</span>
                        {multiAppendPreview.newMessages} Messages
                      </div>
                      <div>
                        <span className="font-semibold">将生成：</span>~
                        {estimatedRounds} Rounds
                      </div>
                      <div>
                        <span className="font-semibold">跳过：</span>
                        {multiAppendPreview.skipped}（重复）
                      </div>
                      <div>
                        <span className="font-semibold">Unsupported：</span>
                        {sumUnsupported(conversations, selectedIds)}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Workspace selector (new mode) */}
                {mode === "new" ? (
                  <label className="mt-4 block text-sm font-medium">
                    Workspace / Folder
                    <select
                      className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
                      onChange={(e) => setWorkspaceId(e.target.value)}
                      value={workspaceId}
                    >
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {/* Quota threshold warning */}
                {exceedsQuotaThreshold &&
                selectedConversations.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-900">
                      ⚠️ 超出本地存储建议上限
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      {quotaExceededMessage}
                    </p>
                  </div>
                ) : null}

                {/* Action button */}
                {mode === "new" ? (
                  <button
                    className="mt-4 w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                    disabled={
                      importing ||
                      selectedConversations.length === 0 ||
                      exceedsQuotaThreshold
                    }
                    onClick={confirmBatchNewImport}
                    type="button"
                  >
                    {importing
                      ? "导入中…"
                      : exceedsQuotaThreshold
                        ? "内容过大，请减少选择"
                        : selectedConversations.length === 1
                          ? "导入为新 Conversation"
                          : `批量导入 ${selectedConversations.length} 个为新 Conversation`}
                  </button>
                ) : (
                  <button
                    className="mt-4 w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                    disabled={
                      importing ||
                      !targetConversationId ||
                      selectedConversations.length === 0 ||
                      exceedsQuotaThreshold
                    }
                    onClick={confirmBatchAppend}
                    type="button"
                  >
                    {importing
                      ? "追加中…"
                      : exceedsQuotaThreshold
                        ? "内容过大，请减少选择"
                        : !targetConversationId
                          ? "请先选择目标 Conversation"
                          : selectedConversations.length === 1
                            ? `追加到「${targetConv?.title ?? "—"}」`
                            : `追加 ${selectedConversations.length} 个源到「${targetConv?.title ?? "—"}」`}
                  </button>
                )}
              </div>
            ) : conversations.length > 0 ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-zinc-200 p-8 text-sm text-zinc-400">
                请选择至少一个 Conversation 以预览和导入
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {/* ---- Status ---- */}
      {status ? (
        <p
          className={`mt-4 rounded-lg p-3 text-sm ${
            batchReport?.stoppedByQuota
              ? "bg-amber-50 text-amber-800"
              : "bg-sky-50 text-sky-800"
          }`}
          role="status"
        >
          {status}
        </p>
      ) : null}

      {/* ---- Batch Import Report ---- */}
      {batchReport ? (
        <div
          className={`mt-5 rounded-xl border-2 p-5 ${
            batchReport.stoppedByQuota
              ? "border-amber-200 bg-amber-50"
              : "border-emerald-200 bg-emerald-50"
          }`}
        >
          <h3
            className={`font-semibold ${
              batchReport.stoppedByQuota
                ? "text-amber-950"
                : "text-emerald-950"
            }`}
          >
            📋 {mode === "new" ? "Batch Import Report — 新建了以下 Conversation" : `Batch Append Report — 已追加到「${batchReport.targetTitle ?? "—"}」`}
            {batchReport.stoppedByQuota ? "（已中断）" : ""}
          </h3>

          {/* Quota exceeded warning */}
          {batchReport.stoppedByQuota ? (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-100 p-3">
              <p className="text-sm font-semibold text-amber-900">
                ⚠️ 存储配额已满
              </p>
              <p className="mt-1 text-xs text-amber-800">
                浏览器 LocalStorage 配额不足，导入已停止。已成功导入的内容已保留。
                {batchReport.suggestion ? (
                  <span className="mt-1 block">{batchReport.suggestion}</span>
                ) : null}
              </p>
            </div>
          ) : null}

          {/* Summary stats */}
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <dt className="text-emerald-700">{mode === "new" ? "Created" : "已追加源"}</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-900">
                {batchReport.totalSuccess}
              </dd>
            </div>
            <div>
              <dt className="text-red-700">Failed</dt>
              <dd className="mt-1 text-2xl font-bold text-red-600">
                {batchReport.totalFailed}
              </dd>
            </div>
            <div>
              <dt className="text-emerald-700">Total Messages</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-900">
                {batchReport.totalMessages}
              </dd>
            </div>
            <div>
              <dt className="text-emerald-700">Total Rounds</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-900">
                {batchReport.totalRounds}
              </dd>
            </div>
            <div>
              <dt className="text-amber-700">Skipped (重复)</dt>
              <dd className="mt-1 text-2xl font-bold text-amber-600">
                {batchReport.totalSkipped}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Unsupported</dt>
              <dd className="mt-1 text-2xl font-bold text-zinc-500">
                {batchReport.totalUnsupported}
              </dd>
            </div>
          </dl>

          {/* All-skipped non-error message */}
          {batchReport.totalSuccess === 0 && batchReport.totalFailed === 0 && batchReport.totalSkipped > 0 ? (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
              <p className="text-sm font-semibold text-sky-900">
                ℹ️ 全部已存在，本次没有新写入。
              </p>
              <p className="mt-1 text-xs text-sky-800">
                所有选中的内容已存在于目标位置，未创建新的 Conversation 或追加新的 Message。
              </p>
            </div>
          ) : null}

          {batchReport.totalSkipped > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">
                ℹ️ 已存在的 ChatGPT Conversation 已跳过
              </p>
              <p className="mt-1 text-xs text-amber-800">
                以下 {batchReport.items.filter(i => i.status === "skipped-duplicate").length} 个 Conversation 的 externalConversationId 已存在或全部 Messages 已追加过，已自动跳过，未创建重复 Copy：{batchReport.items.filter(i => i.status === "skipped-duplicate").map(i => `「${i.title}」`).join("、")}
              </p>
            </div>
          ) : null}

          {batchReport.totalSkipped > 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              Skipped (重复): {batchReport.totalSkipped}
            </p>
          ) : null}

          {/* Per-item results */}
          <ul className="mt-4 space-y-2">
            {batchReport.items.map((item, i) => (
              <li
                key={i}
                className={`rounded-lg border p-3 ${
                  item.status === "success"
                    ? "border-emerald-100 bg-white"
                    : item.status === "skipped-duplicate"
                      ? "border-amber-100 bg-amber-50"
                      : "border-red-100 bg-red-50"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      <span className="mr-1">
                        {item.status === "success" ? "✅" : item.status === "skipped-duplicate" ? "⏭️" : "❌"}
                      </span>
                      {item.title}
                      {item.status === "success" ? (
                        <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-normal text-emerald-700">
                          {mode === "new" ? "Created" : "Appended"}
                        </span>
                      ) : null}
                      {item.status === "skipped-duplicate" ? (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-700">
                          已跳过（重复）
                        </span>
                      ) : null}
                      {item.status === "failed" ? (
                        <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-normal text-red-700">
                          Failed
                        </span>
                      ) : null}
                    </p>
                    {item.error ? (
                      <p className="mt-1 text-xs text-red-600">{item.error}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.messageCount} Messages · {item.roundCount} Rounds
                      {item.skipped > 0
                        ? ` · ${item.skipped} skipped`
                        : ""}
                      {item.unsupported > 0
                        ? ` · ${item.unsupported} unsupported`
                        : ""}
                    </p>
                  </div>
                  {item.status === "success" && item.conversationId ? (
                    <Link
                      className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                      href={`/conversation/${item.conversationId}`}
                    >
                      {mode === "new" ? "打开 →" : "打开目标 →"}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {/* Target link (existing mode) */}
          {mode === "existing" && targetConversationId ? (
            <div className="mt-4 border-t border-emerald-200 pt-3">
              <p className="text-xs text-emerald-700">
                目标 Conversation：{batchReport.targetTitle ?? "—"}
              </p>
              <Link
                className="mt-2 inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                href={`/conversation/${targetConversationId}`}
              >
                打开目标 Conversation →
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
