"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  conversationParserIds,
  type ConversationParserId,
} from "@/core/entities/import-parser";
import type { Workspace } from "@/core/entities/workspace";
import type { Conversation } from "@/core/entities/conversation";
import { ImportParserPipeline } from "@/core/services/import-parser-pipeline";
import { ImportService } from "@/core/services/import-service";
import { WorkspaceService } from "@/core/services/workspace-service";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
import { BrowserAppEventLogStorage } from "@/infrastructure/storage/browser-feedback-storage";
import { RoundService } from "@/core/services/round-service";
import { ChatGPTExportImport } from "./chatgpt-export-import";

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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userAliases, setUserAliases] = useState("User, 问, 我, 用户");
  const [assistantAliases, setAssistantAliases] = useState("Assistant, 答, GPT, AI");
  const [separators, setSeparators] = useState("换行 + 角色标签");
  const [manualRounds, setManualRounds] = useState<Array<{ question: string; answer: string }> | null>(null);
  const [manualTarget, setManualTarget] = useState<{ index: number; field: "question" | "answer" } | null>(null);
  const rawTextRef = useRef<HTMLTextAreaElement>(null);

  // K1: Existing Conversation Import
  const [existingConversations, setExistingConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [appendMode, setAppendMode] = useState<"messages" | "rounds">("messages");
  const [existingRawText, setExistingRawText] = useState("");
  const [existingParserId, setExistingParserId] = useState<ConversationParserId>("chatgpt");
  const [existingImportReport, setExistingImportReport] = useState<{ appendedMessages: number; appendedRounds: number; skipped: number } | null>(null);

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
      setExistingConversations(conversationStorage.getAll());
      if (targetConversationId) {
        setSelectedConversationId(targetConversationId);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [targetConversationId]);

  // K1: Existing conversation preview
  const existingPreview = useMemo(
    () =>
      existingRawText.trim()
        ? pipeline.preview(
            {
              name: "Existing Import",
              channel: "clipboard",
              content: existingRawText,
              mediaType: undefined,
            },
            existingParserId,
          )
        : null,
    [existingParserId, existingRawText],
  );

  function confirmExistingImport() {
    if (!existingPreview?.canConfirm || !selectedConversationId) return;
    try {
      const conversationStorage = new BrowserConversationStorage();
      const messageStorage = new BrowserMessageStorage();
      const roundStorage = new BrowserRoundStorage();
      const conversation = conversationStorage.getById(selectedConversationId);
      if (!conversation) { setError("所选 Conversation 不存在。"); return; }

      const existingMessages = messageStorage.getByConversationId(selectedConversationId);
      const existingRounds = roundStorage.getByConversationId(selectedConversationId);

      if (appendMode === "messages") {
        // Append messages only - don't create rounds
        const maxOrder = existingMessages.reduce((max, m) => Math.max(max, m.order), -1);
        const newMessages = existingPreview.messages.map((msg, i) => ({
          id: crypto.randomUUID(),
          conversationId: selectedConversationId,
          role: msg.role,
          content: msg.content,
          order: maxOrder + 1 + i,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        messageStorage.replaceByConversationId(selectedConversationId, [...existingMessages, ...newMessages]);
        setExistingImportReport({ appendedMessages: newMessages.length, appendedRounds: 0, skipped: 0 });
      } else {
        // Append rounds
        const roundService = new RoundService(roundStorage);
        const newMessages = existingPreview.messages.map((msg, i) => ({
          id: crypto.randomUUID(),
          conversationId: selectedConversationId,
          role: msg.role,
          content: msg.content,
          order: existingMessages.length + i + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        const messageIds = newMessages.map((m) => m.id);
        messageStorage.replaceByConversationId(selectedConversationId, [...existingMessages, ...newMessages]);
        let roundIndex = existingRounds.length;
        for (const round of existingPreview.rounds) {
          roundIndex++;
          roundService.createRound({
            conversationId: selectedConversationId,
            title: round.title || `Round ${roundIndex}`,
            question: round.question,
            answer: round.answer,
            messageIds: round.messageIndexes ? round.messageIndexes.map((idx: number) => messageIds[idx] ?? newMessages[idx]?.id).filter(Boolean) : [],
          });
        }
        setExistingImportReport({ appendedMessages: newMessages.length, appendedRounds: existingPreview.rounds.length, skipped: 0 });
      }
      new BrowserAppEventLogStorage().record("import created", selectedConversationId, `existing ${appendMode}`);
    } catch {
      setError("导入失败，请确认浏览器允许本地保存后重试。");
    }
  }

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
    if (!effectivePreview?.canConfirm) return;
    try {
      const result = new ImportService(
        new BrowserConversationStorage(),
        new BrowserSourceStorage(),
        new BrowserMessageStorage(),
        new BrowserRoundStorage(),
      ).confirm(effectivePreview, { title, workspaceId });
      new BrowserAppEventLogStorage().record("import created", result.conversationId, `${result.roundCount} rounds`);
      router.push(`/conversation/${result.conversationId}?imported=rounds`);
    } catch {
      setError("导入失败，没有报告成功；请确认浏览器允许本地保存后重试。");
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
      <div className="grid gap-4 md:grid-cols-3">
        {([
          ["paste", "粘贴并导入对话", "直接粘贴多轮问答文本；支持六种角色别名"],
          ["txt", "导入 TXT 文件", "从本地纯文本文件导入"],
          ["json", "📦 导入 ChatGPT Export", "导入官方 Export zip 解压后的 conversations.json"],
        ] as const).map(([value, label, description]) => (
          <button
            className={`rounded-xl border p-5 text-left ${mode === value ? "border-zinc-900 bg-zinc-950 text-white" : value === "json" ? "border-emerald-300 bg-emerald-50 text-zinc-900 hover:border-emerald-400" : "border-zinc-200 bg-white text-zinc-900"}`}
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
        <ChatGPTExportImport workspaces={workspaces} />
      ) : (
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
            <button className="w-full rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:bg-zinc-300" disabled={!effectivePreview?.canConfirm || !title.trim()} onClick={confirmImport} type="button">确认导入 Conversation / Messages / Rounds</button>
            <p className="text-xs leading-5 text-zinc-500">确认前不会写入 Conversation、Message 或 Round。</p>
            <p className="text-xs leading-5 text-zinc-500">ChatGPT shared link 与浏览器插件入口为未来保留；本版本不实现抓取网页或读取浏览器历史。</p>
          </div>
        </div>
      )}

      {/* K1: Import into Existing Conversation */}
      <details className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-5" open={!!targetConversationId || undefined}>
        <summary className="cursor-pointer text-sm font-semibold text-sky-950">📥 Import into Existing Conversation{targetConversationId ? "（已选择目标对话）" : ""}</summary>
        <p className="mt-2 text-xs text-sky-800">新内容会追加到当前 Conversation 后面，不覆盖旧内容。{targetConversationId ? ` 目标：${existingConversations.find((c) => c.id === targetConversationId)?.title ?? "—"}` : ""}</p>
        {!existingImportReport ? (
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-zinc-800">
              选择已有 Conversation
              <select
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
                onChange={(event) => setSelectedConversationId(event.target.value)}
                value={selectedConversationId}
              >
                <option value="">— 请选择 —</option>
                {existingConversations.map((conv) => (
                  <option key={conv.id} value={conv.id}>{conv.title} ({conv.sourceType})</option>
                ))}
              </select>
            </label>
            {selectedConversationId ? (
              <>
                <div className="flex gap-2">
                  <button
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${appendMode === "messages" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-600"}`}
                    onClick={() => setAppendMode("messages")}
                    type="button"
                  >
                    Append Messages
                  </button>
                  <button
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${appendMode === "rounds" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-600"}`}
                    onClick={() => setAppendMode("rounds")}
                    type="button"
                  >
                    Append Rounds
                  </button>
                </div>
                <p className="text-xs text-zinc-500">
                  {appendMode === "messages"
                    ? "仅追加新 Messages，不创建 Round。保留历史 Round 不变。"
                    : "追加新 Messages 并生成新 Rounds。历史 Round 保留，新 Round 追加在末尾。"}
                </p>
                <label className="block text-sm font-medium text-zinc-800">
                  Parser
                  <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setExistingParserId(event.target.value as ConversationParserId)} value={existingParserId}>
                    {conversationParserIds.map((id) => <option key={id} value={id}>{parserLabels[id]}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-zinc-800">
                  对话原文
                  <textarea
                    className="mt-2 min-h-48 w-full rounded-lg border border-zinc-300 px-4 py-3 font-mono text-sm leading-6"
                    onChange={(event) => { setExistingRawText(event.target.value); setExistingImportReport(null); }}
                    placeholder={"User: 你好\nAssistant: 你好！"}
                    value={existingRawText}
                  />
                </label>
                {existingPreview ? (
                  <div className="rounded-lg border border-zinc-200 bg-white p-4">
                    <p className="text-sm font-semibold">Import Preview</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {existingPreview.messageCount} Messages · {existingPreview.roundCount} Rounds · {parserLabels[existingPreview.parserId]} parser v{existingPreview.parserVersion}
                    </p>
                    {existingPreview.warnings.map((w) => <p className="mt-1 text-xs text-amber-700" key={w}>{w}</p>)}
                    <p className="mt-2 text-xs text-zinc-400">追加到：{existingConversations.find((c) => c.id === selectedConversationId)?.title ?? "—"}</p>
                    <p className="mt-1 text-xs text-zinc-400">模式：{appendMode === "messages" ? "仅追加 Messages" : "追加 Messages + 创建 Rounds"}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="rounded-lg bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-300"
                        disabled={!existingPreview.canConfirm}
                        onClick={confirmExistingImport}
                        type="button"
                      >
                        Confirm Import
                      </button>
                      <button
                        className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-600"
                        onClick={() => { setExistingRawText(""); setExistingImportReport(null); setSelectedConversationId(""); }}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">📋 Import Report</p>
            <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-white p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">{existingImportReport.appendedMessages}</p>
                <p className="text-xs text-zinc-500">Messages Appended</p>
              </div>
              <div className="rounded-lg bg-white p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">{existingImportReport.appendedRounds}</p>
                <p className="text-xs text-zinc-500">Rounds Created</p>
              </div>
              <div className="rounded-lg bg-white p-3 text-center">
                <p className="text-2xl font-bold text-zinc-500">{existingImportReport.skipped}</p>
                <p className="text-xs text-zinc-500">Skipped</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-emerald-800">旧数据未被覆盖。历史 Round 已保留。新内容已追加。</p>
            <div className="mt-3 flex gap-2">
              <Link className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800" href={`/conversation/${selectedConversationId}`}>打开 Conversation →</Link>
              <button className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-800" onClick={() => { setExistingImportReport(null); setExistingRawText(""); setSelectedConversationId(""); }} type="button">导入更多</button>
            </div>
          </div>
        )}
      </details>
    </section>
  );
}
