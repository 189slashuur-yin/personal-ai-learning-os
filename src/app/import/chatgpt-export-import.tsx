"use client";

import { type ChangeEvent, useState } from "react";
import Link from "next/link";
import type { Workspace } from "@/core/entities/workspace";
import type { Conversation } from "@/core/entities/conversation";
import {
  ChatGPTExportImportService,
  type ChatGPTConversationPreview,
} from "@/core/services/chatgpt-export-import";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserAppEventLogStorage } from "@/infrastructure/storage/browser-feedback-storage";

const FILE_PATTERN = /^conversations(-\d{3})?\.json$/;
const LARGE_FILE_THRESHOLD = 20 * 1024 * 1024;

function service() {
  return new ChatGPTExportImportService(
    new BrowserConversationStorage(),
    new BrowserSourceStorage(),
    new BrowserMessageStorage(),
    new BrowserRoundStorage(),
  );
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

type ImportReport = {
  conversationId: string;
  title?: string;
  messageCount?: number;
  roundCount?: number;
  unsupported: number;
  appendedMessages?: number;
  appendedRounds?: number;
  skipped: number;
  targetTitle?: string;
};

export function ChatGPTExportImport({
  mode,
  workspaces,
  existingConversations,
}: {
  mode: "new" | "existing";
  workspaces: Workspace[];
  existingConversations: Conversation[];
}) {
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatGPTConversationPreview[]>([]);
  const [selectedConv, setSelectedConv] = useState<ChatGPTConversationPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [largeFileWarning, setLargeFileWarning] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("inbox");
  const [targetConversationId, setTargetConversationId] = useState("");
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [appendPreview, setAppendPreview] = useState<{
    newMessages: number;
    skipped: number;
    existingTotal: number;
  } | null>(null);

  function computeAppendPreview(conv: ChatGPTConversationPreview, targetId: string) {
    if (!conv || !targetId) return;
    try {
      const preview = service().previewAppendToConversation(conv, targetId);
      setAppendPreview(preview);
    } catch {
      setAppendPreview(null);
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileInfo(null);
    setParseError(null);
    setConversations([]);
    setSelectedConv(null);
    setImportReport(null);
    setAppendPreview(null);
    setStatus(null);
    setLargeFileWarning(false);

    if (!FILE_PATTERN.test(file.name)) {
      setParseError(
        "请选择 conversations.json 或 conversations-*.json（例如 conversations-000.json）。不支持直接读取 zip 文件。",
      );
      return;
    }

    if (file.size > LARGE_FILE_THRESHOLD) {
      setLargeFileWarning(true);
    }

    setLoading(true);

    try {
      const text = await file.text();
      const parsed = service().parseExport(text);
      setFileInfo({ name: file.name, size: file.size });
      setConversations(parsed);
      const first = parsed[0] ?? null;
      setSelectedConv(first);
      if (parsed.length === 0) {
        setStatus("文件中没有可导入的 Conversation。");
      } else if (mode === "existing" && targetConversationId && first) {
        computeAppendPreview(first, targetConversationId);
      }
    } catch (error) {
      setParseError(
        error instanceof Error
          ? error.message
          : "无法解析文件，请确认是有效的 ChatGPT Export JSON。",
      );
    } finally {
      setLoading(false);
    }
  }

  function selectConversation(conv: ChatGPTConversationPreview) {
    setSelectedConv(conv);
    setStatus(null);
    if (mode === "existing" && targetConversationId) {
      computeAppendPreview(conv, targetConversationId);
    }
  }

  function handleTargetChange(id: string) {
    setTargetConversationId(id);
    setAppendPreview(null);
    if (selectedConv && id) {
      computeAppendPreview(selectedConv, id);
    }
  }

  async function confirmNewImport() {
    if (!selectedConv) return;
    setImporting(true);
    try {
      const preview = service().previewImport(selectedConv);
      const result = service().importConversation(preview, { workspaceId, forceNew: true });
      new BrowserAppEventLogStorage().record(
        "import created",
        result.conversationId,
        `ChatGPT new ${result.appended} messages`,
      );
      setImportReport({
        conversationId: result.conversationId,
        title: selectedConv.title,
        messageCount: result.appended,
        roundCount: result.roundsCreated,
        unsupported: selectedConv.unsupportedCount,
        skipped: result.skipped,
      });
      setStatus("导入完成！");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "导入失败，请重试。");
    } finally {
      setImporting(false);
    }
  }

  async function confirmAppend() {
    if (!selectedConv || !targetConversationId) return;
    const targetConv = existingConversations.find((c) => c.id === targetConversationId);
    setImporting(true);
    try {
      const result = service().appendToConversation(selectedConv, targetConversationId);
      new BrowserAppEventLogStorage().record(
        "import created",
        targetConversationId,
        `ChatGPT append ${result.appendedMessages} messages`,
      );
      setImportReport({
        conversationId: result.conversationId,
        title: selectedConv.title,
        messageCount: result.appendedMessages,
        roundCount: result.appendedRounds,
        unsupported: result.unsupported,
        skipped: result.skipped,
        appendedMessages: result.appendedMessages,
        appendedRounds: result.appendedRounds,
        targetTitle: targetConv?.title,
      });
      setStatus("追加完成！旧内容未被覆盖。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "追加失败，请重试。");
    } finally {
      setImporting(false);
    }
  }

  const targetConv = existingConversations.find((c) => c.id === targetConversationId);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <p className="eyebrow">ChatGPT Official Export</p>
      <h2 className="mt-2 text-lg font-semibold">
        {mode === "new" ? "导入为新 Conversation" : "追加到已有 Conversation"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        先在 ChatGPT 导出 zip 中解压文件，再选择 conversations.json 或 conversations-*.json。
        当前不解析 zip、附件、图片、tool call、canvas、voice 或 shared link。
      </p>

      {mode === "existing" ? (
        <div className="mt-4">
          <label className="block text-sm font-medium text-zinc-800">
            选择目标 Conversation
            <select
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
              onChange={(e) => handleTargetChange(e.target.value)}
              value={targetConversationId}
            >
              <option value="">— 请选择 —</option>
              {existingConversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.sourceType})
                </option>
              ))}
            </select>
          </label>
          {targetConversationId && targetConv ? (
            <p className="mt-2 text-xs text-zinc-500">
              新内容将追加到「{targetConv.title}」后面，不覆盖旧内容。
            </p>
          ) : null}
        </div>
      ) : null}

      <label
        className={`mt-4 inline-block rounded-lg border px-4 py-2.5 text-sm font-semibold ${
          mode === "existing" && !targetConversationId
            ? "pointer-events-none border-zinc-200 text-zinc-300"
            : "border-zinc-300"
        }`}
      >
        选择 conversations.json / conversations-*.json
        <input
          accept=".json,application/json"
          className="sr-only"
          disabled={mode === "existing" && !targetConversationId}
          onChange={chooseFile}
          type="file"
        />
      </label>

      {largeFileWarning && loading ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          大文件解析中，请等待，浏览器可能短暂无响应。
        </p>
      ) : null}

      {loading && !largeFileWarning ? (
        <p className="mt-3 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">解析中…</p>
      ) : null}

      {parseError ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {parseError}
        </p>
      ) : null}

      {fileInfo && !loading && !parseError ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-semibold text-emerald-900">✅ 文件解析成功</p>
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

      {conversations.length > 0 && !loading ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="max-h-[32rem] space-y-2 overflow-auto">
            {conversations.map((conv) => (
              <button
                className={`w-full rounded-lg border p-3 text-left ${
                  selectedConv?.externalConversationId === conv.externalConversationId
                    ? "border-zinc-950 bg-zinc-50"
                    : "border-zinc-200"
                }`}
                key={conv.externalConversationId}
                onClick={() => selectConversation(conv)}
                type="button"
              >
                <span className="block text-sm font-semibold">{conv.title}</span>
                <span className="mt-1 block text-xs text-zinc-500">
                  {conv.messages.length} Messages · ~{estimateRounds(conv)} Rounds ·{" "}
                  {conv.unsupportedCount} unsupported
                  {conv.isLarge ? (
                    <span className="ml-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                      大型
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>

          {selectedConv ? (
            <div className="rounded-lg border border-zinc-200 p-4">
              <h3 className="font-semibold">{selectedConv.title}</h3>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Messages</dt>
                  <dd>{selectedConv.messages.length}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Rounds (est)</dt>
                  <dd>{estimateRounds(selectedConv)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Unsupported</dt>
                  <dd>{selectedConv.unsupportedCount}（跳过）</dd>
                </div>
                {selectedConv.createTime ? (
                  <div>
                    <dt className="text-zinc-500">Create time</dt>
                    <dd>{new Date(selectedConv.createTime).toLocaleString("zh-CN")}</dd>
                  </div>
                ) : null}
                {selectedConv.updateTime ? (
                  <div>
                    <dt className="text-zinc-500">Update time</dt>
                    <dd>{new Date(selectedConv.updateTime).toLocaleString("zh-CN")}</dd>
                  </div>
                ) : null}
                {selectedConv.isLarge ? (
                  <div className="sm:col-span-2">
                    <dt className="text-amber-700">⚠️ 大型对话</dt>
                    <dd className="text-amber-700">
                      该 Conversation 包含 {selectedConv.messages.length} 条 Messages，导入可能需要较长时间。
                    </dd>
                  </div>
                ) : null}
              </dl>

              {mode === "existing" && targetConversationId && appendPreview ? (
                <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <p className="text-sm font-semibold text-sky-900">追加预览</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-sky-800">
                    <div>
                      <span className="font-semibold">目标：</span>
                      {targetConv?.title ?? "—"}
                    </div>
                    <div>
                      <span className="font-semibold">当前 Messages：</span>
                      {appendPreview.existingTotal}
                    </div>
                    <div>
                      <span className="font-semibold">将追加：</span>
                      {appendPreview.newMessages} Messages
                    </div>
                    <div>
                      <span className="font-semibold">将生成：</span>~
                      {estimateRounds(selectedConv)} Rounds
                    </div>
                    <div>
                      <span className="font-semibold">跳过：</span>
                      {appendPreview.skipped}（重复）
                    </div>
                    <div>
                      <span className="font-semibold">Unsupported：</span>
                      {selectedConv.unsupportedCount}
                    </div>
                  </div>
                </div>
              ) : null}

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

              {mode === "new" ? (
                <button
                  className="mt-4 w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  disabled={importing || !selectedConv.messages.length}
                  onClick={confirmNewImport}
                  type="button"
                >
                  {importing ? "导入中…" : "导入为新 Conversation"}
                </button>
              ) : (
                <button
                  className="mt-4 w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  disabled={importing || !targetConversationId || !selectedConv.messages.length}
                  onClick={confirmAppend}
                  type="button"
                >
                  {importing
                    ? "追加中…"
                    : `确认追加${appendPreview ? ` ${appendPreview.newMessages} Messages` : ""}`}
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {status ? (
        <p className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-800" role="status">
          {status}
        </p>
      ) : null}

      {importReport ? (
        <div className="mt-5 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-5">
          <h3 className="font-semibold text-emerald-950">📋 Import Report</h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-emerald-700">Messages</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-900">
                {importReport.messageCount ?? importReport.appendedMessages ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-emerald-700">Rounds</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-900">
                {importReport.roundCount ?? importReport.appendedRounds ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-emerald-700">Unsupported</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-900">
                {importReport.unsupported}
              </dd>
            </div>
            <div>
              <dt className="text-emerald-700">Skipped</dt>
              <dd className="mt-1 text-2xl font-bold text-zinc-500">{importReport.skipped}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-lg bg-white p-3">
            {mode === "new" ? (
              <>
                <p className="text-sm font-semibold text-emerald-900">新 Conversation</p>
                <p className="mt-1 text-xs text-emerald-700">
                  「{importReport.title}」— {importReport.messageCount} Messages ·{" "}
                  {importReport.roundCount} Rounds · {importReport.unsupported} unsupported
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-emerald-900">追加完成</p>
                <p className="mt-1 text-xs text-emerald-700">
                  已追加到「{importReport.targetTitle}」— {importReport.appendedMessages} Messages ·{" "}
                  {importReport.appendedRounds} Rounds · {importReport.skipped} 跳过
                </p>
              </>
            )}
            <Link
              className="mt-3 inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              href={`/conversation/${importReport.conversationId}`}
            >
              打开 Conversation →
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
