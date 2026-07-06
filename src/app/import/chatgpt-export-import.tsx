"use client";

import { type ChangeEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Workspace } from "@/core/entities/workspace";
import {
  ChatGPTExportImportService,
  LARGE_CONVERSATION_MESSAGE_THRESHOLD,
  type ChatGPTConversationPreview,
  type ChatGPTImportPreview,
} from "@/core/services/chatgpt-export-import";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserAppEventLogStorage } from "@/infrastructure/storage/browser-feedback-storage";

function service() {
  return new ChatGPTExportImportService(
    new BrowserConversationStorage(),
    new BrowserSourceStorage(),
    new BrowserMessageStorage(),
    new BrowserRoundStorage(),
  );
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

export function ChatGPTExportImport({
  workspaces,
}: {
  workspaces: Workspace[];
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ChatGPTConversationPreview[]>([]);
  const [selected, setSelected] = useState<ChatGPTImportPreview | null>(null);
  const [workspaceId, setWorkspaceId] = useState("inbox");
  const [status, setStatus] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<{ appended: number; skipped: number; unsupported: number; roundsCreated: number; appendOnly: boolean; conversationId: string } | null>(null);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.name !== "conversations.json") {
      setStatus("请选择 ChatGPT Export zip 解压后的 conversations.json；不支持直接读取 zip。");
      return;
    }
    try {
      const parsed = service().parseExport(await file.text());
      setConversations(parsed);
      setSelected(parsed[0] ? service().previewImport(parsed[0]) : null);
      setStatus(parsed.length ? null : "文件中没有可导入的 Conversation。");
    } catch (error) {
      setConversations([]);
      setSelected(null);
      setStatus(error instanceof Error ? error.message : "无法解析 conversations.json。");
    }
  }

  function selectConversation(conversation: ChatGPTConversationPreview) {
    setSelected(service().previewImport(conversation));
    setStatus(null);
  }

  function confirmImport() {
    if (!selected) return;
    const action = selected.appendOnly
      ? `只追加 ${selected.newMessages} 条新 Message；${selected.skippedDuplicates} 条重复会跳过。旧 Rounds 不会覆盖，需手动 regenerate。`
      : `创建 Conversation、${selected.messages.length} Messages 与初始 Rounds。`;
    if (!window.confirm(`${action}\n\n继续导入？`)) return;
    try {
      const result = service().importConversation(selected, workspaceId);
      new BrowserAppEventLogStorage().record(
        "import created",
        result.conversationId,
        `ChatGPT append ${result.appended}; skipped ${result.skipped}`,
      );
      setImportReport({
        appended: result.appended,
        skipped: result.skipped,
        roundsCreated: result.roundsCreated,
        appendOnly: selected.appendOnly,
        conversationId: result.conversationId,
        unsupported: selected.unsupportedCount,
      });
      setStatus(
        `导入完成：新增 ${result.appended} Messages，跳过 ${result.skipped}，创建 ${result.roundsCreated} Rounds。${selected.appendOnly ? " 旧 Rounds 未自动覆盖，请按需手动重新生成。" : ""}`,
      );
      setSelected(service().previewImport(selected));
      if (!selected.appendOnly) router.push(`/conversation/${result.conversationId}?mode=workspace`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "导入失败；原数据未清空。");
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <p className="eyebrow">ChatGPT Official Export</p>
      <h2 className="mt-2 text-lg font-semibold">导入 conversations.json</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        先在 ChatGPT 导出 zip 中解压文件，再选择 conversations.json。当前不解析 zip、附件、图片、tool call、canvas、voice 或 shared link。
      </p>
      <label className="mt-4 inline-block rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold">
        选择 conversations.json
        <input
          accept=".json,application/json"
          className="sr-only"
          onChange={chooseFile}
          type="file"
        />
      </label>
      {conversations.length ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="max-h-[32rem] space-y-2 overflow-auto">
            {conversations.map((conversation) => (
              <button
                className={`w-full rounded-lg border p-3 text-left ${selected?.externalConversationId === conversation.externalConversationId ? "border-zinc-950 bg-zinc-50" : "border-zinc-200"}`}
                key={conversation.externalConversationId}
                onClick={() => selectConversation(conversation)}
                type="button"
              >
                <span className="block font-semibold">{conversation.title}</span>
                <span className="mt-1 block text-xs text-zinc-500">
                  {conversation.messages.length} supported Messages · {conversation.unsupportedCount} unsupported
                  {conversation.isLarge ? (
                    <span className="ml-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                      大型
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          {selected ? (
            <div className="rounded-lg border border-zinc-200 p-4">
              <h3 className="font-semibold">{selected.title}</h3>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-zinc-500">Messages</dt><dd>{selected.messages.length}</dd></div>
                <div><dt className="text-zinc-500">Unsupported</dt><dd>{selected.unsupportedCount}（跳过，不中断）</dd></div>
                <div><dt className="text-zinc-500">Create time</dt><dd>{formatTime(selected.createTime)}</dd></div>
                <div><dt className="text-zinc-500">Update time</dt><dd>{formatTime(selected.updateTime)}</dd></div>
                <div><dt className="text-zinc-500">Existing messages</dt><dd>{selected.existingMessages}</dd></div>
                <div><dt className="text-zinc-500">New messages</dt><dd>{selected.newMessages}</dd></div>
                <div><dt className="text-zinc-500">Skipped duplicates</dt><dd>{selected.skippedDuplicates}</dd></div>
                <div><dt className="text-zinc-500">Mode</dt><dd>{selected.appendOnly ? "append only" : "new Conversation"}</dd></div>
              </dl>
              <label className="mt-4 block text-sm font-medium">Workspace / Folder<select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setWorkspaceId(event.target.value)} value={workspaceId}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
              {selected.appendOnly ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Append only：不会自动覆盖已有 Rounds。新增 Messages 导入后，请在 Conversation 中人工确认并手动 regenerate rounds。</p> : null}
              {selected.isLarge ? (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  ⚠️ 该 Conversation 包含 {selected.messages.length} 条 Messages（阈值 {LARGE_CONVERSATION_MESSAGE_THRESHOLD} 条），属于大型对话。
                  导入可能需要较长时间，浏览器可能出现短暂卡顿。建议在确认前评估是否需要分批导入。
                </p>
              ) : null}
              <button className="mt-4 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" disabled={!selected.newMessages || !selected.messages.length} onClick={confirmImport} type="button">{selected.appendOnly ? "增量导入新 Messages" : "导入所选 Conversation"}</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {importReport ? (
        <div className="mt-5 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-5">
          <h3 className="font-semibold text-emerald-950">📋 Import Report</h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-emerald-700">New · 新增</dt><dd className="mt-1 text-2xl font-bold text-emerald-900">{importReport.appended}</dd></div>
            <div><dt className="text-emerald-700">Skipped · 跳过</dt><dd className="mt-1 text-2xl font-bold text-emerald-900">{importReport.skipped}</dd></div>
            <div><dt className="text-emerald-700">Unsupported</dt><dd className="mt-1 text-2xl font-bold text-emerald-900">{importReport.unsupported}</dd></div>
            <div><dt className="text-emerald-700">Rounds</dt><dd className="mt-1 text-2xl font-bold text-emerald-900">{importReport.roundsCreated}</dd></div>
          </dl>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-white p-3">
              <p className="text-sm font-semibold text-emerald-900">Existing Conversation</p>
              <p className="mt-1 text-xs text-emerald-700">导入到已有 Conversation；未创建重复副本。</p>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-sm font-semibold text-amber-900">{importReport.appendOnly ? "Append only" : "New Conversation"}</p>
              <p className="mt-1 text-xs text-amber-700">{importReport.appendOnly ? "只追加新 Message，不自动覆盖已有 Rounds。请进入 Conversation 手动 Regenerate Rounds。" : "已创建新 Conversation / Messages / Rounds。"}</p>
            </div>
          </div>
          {importReport.appendOnly ? (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-100 p-4">
              <p className="text-sm font-semibold text-amber-900">⚠️ 手动操作提醒</p>
              <p className="mt-1 text-sm text-amber-800">增量导入仅 append 新 Message。如需更新 Round 结构，请在 Conversation 页面手动 Regenerate Rounds。</p>
              <Link className="mt-3 inline-block rounded-lg bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-300" href={`/conversation/${importReport.conversationId}?mode=workspace`}>打开 Conversation →</Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {status ? <p className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-800" role="status">{status}</p> : null}
    </section>
  );
}
