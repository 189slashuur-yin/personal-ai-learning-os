"use client";

import { type ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Workspace } from "@/core/entities/workspace";
import {
  ChatGPTExportImportService,
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
              <button className="mt-4 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" disabled={!selected.newMessages || !selected.messages.length} onClick={confirmImport} type="button">{selected.appendOnly ? "增量导入新 Messages" : "导入所选 Conversation"}</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {status ? <p className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-800" role="status">{status}</p> : null}
    </section>
  );
}
