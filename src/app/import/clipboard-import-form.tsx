"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConversationSourceType } from "@/core/entities/conversation";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";

const clipboardSourceTypes = [
  "ChatGPT",
  "Claude",
  "DeepSeek",
  "Gemini",
  "Manual",
  "Plain Text",
] as const satisfies readonly ConversationSourceType[];

function countLines(text: string) {
  return text ? text.replace(/\r\n?/g, "\n").split("\n").length : 0;
}

export function ClipboardImportForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] =
    useState<ConversationSourceType>("ChatGPT");
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function importClipboardText() {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      setError("请输入 Conversation 标题。");
      return;
    }

    if (!rawText.trim()) {
      setError("请先粘贴对话文本，空文本不能导入。");
      return;
    }

    try {
      const timestamp = new Date().toISOString();
      const conversationId = crypto.randomUUID();

      new BrowserConversationStorage().save({
        id: conversationId,
        title: normalizedTitle,
        sourceType,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastOpenedAt: timestamp,
      });
      new BrowserSourceStorage().save({
        id: crypto.randomUUID(),
        conversationId,
        kind: "text",
        name: `${normalizedTitle} - Clipboard`,
        content: rawText,
        importedAt: timestamp,
        updatedAt: timestamp,
      });

      setError(null);
      setSuccess("导入成功，正在打开 Conversation…");
      router.push(`/conversation/${conversationId}?imported=clipboard`);
    } catch {
      setSuccess(null);
      setError("导入失败，请确认浏览器允许本地保存后重试。");
    }
  }

  return (
    <section className="mt-6 space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-zinc-800">
          Conversation 标题
          <input
            className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：React 性能优化讨论"
            type="text"
            value={title}
          />
        </label>
        <label className="text-sm font-medium text-zinc-800">
          来源类型
          <select
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            onChange={(event) =>
              setSourceType(event.target.value as ConversationSourceType)
            }
            value={sourceType}
          >
            {clipboardSourceTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium text-zinc-800">
        对话原文
        <textarea
          className="mt-2 min-h-72 w-full resize-y rounded-lg border border-zinc-300 px-4 py-3 font-mono text-sm leading-6 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          onChange={(event) => {
            setRawText(event.target.value);
            setError(null);
          }}
          placeholder={"用户：你好\nAssistant: 你好！有什么可以帮你？"}
          value={rawText}
        />
      </label>

      <div className="flex flex-wrap gap-4 text-xs font-medium text-zinc-500">
        <span>{rawText.length} 字符</span>
        <span>{countLines(rawText)} 行</span>
        <span>预览最多 1000 字</span>
      </div>

      {rawText ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Preview</p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
            {rawText.slice(0, 1000)}
          </pre>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{success}</p>
      ) : null}

      <button
        className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
        disabled={!rawText.trim()}
        onClick={importClipboardText}
        type="button"
      >
        导入并打开 Conversation
      </button>
      <p className="text-xs leading-5 text-zinc-500">
        此步骤只保存原始文本，不会生成 Messages、Proposal，也不会调用 AI。
      </p>
    </section>
  );
}
