"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  conversationParserIds,
  type ConversationParserId,
} from "@/core/entities/import-parser";
import type { Workspace } from "@/core/entities/workspace";
import { ImportParserPipeline } from "@/core/services/import-parser-pipeline";
import { ImportService } from "@/core/services/import-service";
import { WorkspaceService } from "@/core/services/workspace-service";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";

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
  const [mode, setMode] = useState<"paste" | "txt" | "json">("paste");
  const [parserId, setParserId] = useState<ConversationParserId>("chatgpt");
  const [artifactName, setArtifactName] = useState("Pasted Conversation");
  const [rawText, setRawText] = useState("");
  const [title, setTitle] = useState("");
  const [workspaceId, setWorkspaceId] = useState("inbox");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const conversationStorage = new BrowserConversationStorage();
      setWorkspaces(
        new WorkspaceService(
          new BrowserWorkspaceStorage(),
          conversationStorage,
        )
          .listWorkspaces()
          .filter((workspace) => !workspace.archivedAt),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function selectMode(nextMode: "paste" | "txt" | "json") {
    setMode(nextMode);
    setRawText("");
    setTitle("");
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

  function confirmImport() {
    if (!preview?.canConfirm) return;
    try {
      const result = new ImportService(
        new BrowserConversationStorage(),
        new BrowserSourceStorage(),
        new BrowserMessageStorage(),
        new BrowserRoundStorage(),
      ).confirm(preview, { title, workspaceId });
      router.push(`/conversation/${result.conversationId}?imported=rounds`);
    } catch {
      setError("导入失败，没有报告成功；请确认浏览器允许本地保存后重试。");
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {([
          ["paste", "Paste Conversation", "粘贴带角色标签的对话"],
          ["txt", "Import TXT", "读取本地纯文本文件"],
          ["json", "Import JSON", "占位：尚未启用写入"],
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

      {mode === "json" ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <p className="font-semibold text-zinc-900">JSON Import is coming later</p>
          <p className="mt-2 text-sm text-zinc-600">当前不会猜测或写入任意 JSON schema。</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
            {mode === "txt" ? (
              <label className="block text-sm font-medium text-zinc-800">
                TXT 文件
                <input className="mt-2 block w-full text-sm" accept=".txt,text/plain" onChange={selectTxtFile} type="file" />
              </label>
            ) : (
              <label className="block text-sm font-medium text-zinc-800">
                Parser
                <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setParserId(event.target.value as ConversationParserId)} value={parserId}>
                  {conversationParserIds.map((id) => <option key={id} value={id}>{parserLabels[id]}</option>)}
                </select>
              </label>
            )}
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
            {mode === "paste" ? (
              <label className="block text-sm font-medium text-zinc-800">
                对话原文
                <textarea className="mt-2 min-h-72 w-full rounded-lg border border-zinc-300 px-4 py-3 font-mono text-sm leading-6" onChange={(event) => { setRawText(event.target.value); setError(null); }} placeholder={"User: 你好\nAssistant: 你好！"} value={rawText} />
              </label>
            ) : null}
          </div>

          <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6">
            <div>
              <p className="eyebrow">Parser Preview</p>
              {preview ? (
                <p className="mt-2 text-sm text-zinc-700">{parserLabels[preview.parserId]} parser v{preview.parserVersion} · {preview.messageCount} Messages · {preview.roundCount} Rounds</p>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">添加内容后显示解析结果。</p>
              )}
            </div>
            {preview?.warnings.map((warning) => <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800" key={warning}>{warning}</p>)}
            {preview ? (
              <div>
                <p className="eyebrow">Round Preview</p>
                <ol className="mt-3 max-h-[28rem] space-y-3 overflow-auto">
                  {preview.rounds.map((round) => (
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
            <button className="w-full rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:bg-zinc-300" disabled={!preview?.canConfirm || !title.trim()} onClick={confirmImport} type="button">Confirm Import</button>
            <p className="text-xs leading-5 text-zinc-500">确认前不会写入 Conversation、Message 或 Round。</p>
          </div>
        </div>
      )}
    </section>
  );
}
