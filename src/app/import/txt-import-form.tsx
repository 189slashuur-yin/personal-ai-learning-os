"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useState } from "react";
import type { Conversation } from "@/core/entities/conversation";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Workspace } from "@/core/entities/workspace";
import { WorkspaceService } from "@/core/services/workspace-service";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";

export function TxtImportForm() {
  const router = useRouter();
  const [source, setSource] = useState<ImportedSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState("auto");
  const [workspaceId, setWorkspaceId] = useState("inbox");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const conversationStorage = new BrowserConversationStorage();
      setConversations(conversationStorage.getAll());
      setWorkspaces(
        new WorkspaceService(
          new BrowserWorkspaceStorage(),
          conversationStorage,
        ).listWorkspaces().filter((workspace) => !workspace.archivedAt),
      );
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setSource(null);
    setError(null);

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("当前任务只支持 TXT 文件，请重新选择。");
      return;
    }

    try {
      const content = await file.text();

      if (!content.trim()) {
        setError("这个 TXT 文件没有可分析的文字内容。");
        return;
      }

      const timestamp = new Date().toISOString();
      setSource({
        id: crypto.randomUUID(),
        kind: "text",
        name: file.name,
        content,
        importedAt: timestamp,
        updatedAt: timestamp,
      });
    } catch {
      setError("文件读取失败，请重新选择。");
    }
  }

  function saveToConversation() {
    if (!source) {
      return;
    }

    const conversationStorage = new BrowserConversationStorage();
    const timestamp = new Date().toISOString();
    let conversation =
      conversationId === "auto"
        ? null
        : conversationStorage.getById(conversationId);

    if (!conversation) {
      conversation = {
        id: crypto.randomUUID(),
        title: source.name.replace(/\.txt$/i, ""),
        sourceType: "TXT",
        workspaceId,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastOpenedAt: timestamp,
      };
    } else {
      conversation = { ...conversation, workspaceId, updatedAt: timestamp };
    }

    conversationStorage.save(conversation);
    new BrowserSourceStorage().save({
      ...source,
      conversationId: conversation.id,
    });
    router.push(`/conversation/${conversation.id}`);
  }

  return (
    <section className="mt-8 max-w-2xl space-y-6">
      <label className="block rounded-xl border border-dashed border-zinc-300 bg-white p-6">
        <span className="block font-medium text-zinc-900">选择 TXT 文件</span>
        <span className="mt-1 block text-sm text-zinc-500">
          文件只会保存在当前浏览器中。
        </span>
        <input
          accept=".txt,text/plain"
          className="mt-4 block w-full text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
          onChange={handleFileChange}
          type="file"
        />
      </label>

      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {source ? (
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
          <div>
            <p className="font-medium text-zinc-950">已识别 TXT 内容</p>
            <p className="mt-1 text-sm text-zinc-500">
              {source.name} · {source.content.length} 个字符
            </p>
          </div>
          <p className="max-h-36 overflow-hidden whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
            {source.content.slice(0, 300)}
          </p>
          <label className="block text-sm font-medium text-zinc-800">
            保存到 Conversation
            <select
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              onChange={(event) => setConversationId(event.target.value)}
              value={conversationId}
            >
              <option value="auto">自动创建新的 Conversation</option>
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-zinc-800">
            Workspace
            <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 outline-none focus:border-zinc-500" onChange={(event) => setWorkspaceId(event.target.value)} value={workspaceId}>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
            <span className="mt-2 block text-xs font-normal text-zinc-500">默认 Inbox；保存到已有 Conversation 时会更新其 Workspace。</span>
          </label>
          <button
            className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white"
            onClick={saveToConversation}
            type="button"
          >
            保存并打开 Conversation
          </button>
        </div>
      ) : null}
    </section>
  );
}
