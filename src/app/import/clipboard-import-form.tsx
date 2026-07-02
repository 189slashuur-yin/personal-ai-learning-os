"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImportProfileService } from "@/core/services/import-profile-service";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";

const importProfileService = new ImportProfileService();
const importProfiles = importProfileService.listProfiles();

function countLines(text: string) {
  return text ? text.replace(/\r\n?/g, "\n").split("\n").length : 0;
}

export function ClipboardImportForm() {
  const [title, setTitle] = useState("");
  const [profileId, setProfileId] = useState("chatgpt");
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    conversationId: string;
    title: string;
    sourceType: string;
    messageCount: number;
    unknownCount: number;
  } | null>(null);
  const titleWasEdited = useRef(false);
  const selectedProfile = useMemo(
    () => importProfileService.getById(profileId),
    [profileId],
  );
  const preview = useMemo(
    () =>
      selectedProfile
        ? importProfileService.createPreview(rawText, selectedProfile)
        : null,
    [rawText, selectedProfile],
  );

  useEffect(() => {
    if (!titleWasEdited.current) {
      setTitle(preview?.suggestedTitle ?? "");
    }
  }, [preview?.suggestedTitle]);

  function importClipboardText() {
    const normalizedTitle = title.trim();
    const profile = importProfileService.getById(profileId);

    if (!normalizedTitle) {
      setError("请输入 Conversation 标题。");
      return;
    }

    if (!rawText.trim()) {
      setError("请先粘贴对话文本，空文本不能导入。");
      return;
    }

    if (!profile) {
      setError("Import Profile 不可用，请重新选择来源类型。");
      return;
    }

    try {
      const timestamp = new Date().toISOString();
      const conversationId = crypto.randomUUID();
      const messages = importProfileService.parse(
        rawText,
        conversationId,
        profile,
      );

      new BrowserConversationStorage().save({
        id: conversationId,
        title: normalizedTitle,
        sourceType: profile.sourceType,
        importProfileId: profile.id,
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
      new BrowserMessageStorage().saveMany(messages);

      setError(null);
      setImportResult({
        conversationId,
        title: normalizedTitle,
        sourceType: profile.sourceType,
        messageCount: messages.length,
        unknownCount: messages.filter((message) => message.role === "unknown")
          .length,
      });
    } catch {
      setImportResult(null);
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
            onChange={(event) => {
              titleWasEdited.current = true;
              setTitle(event.target.value);
              setImportResult(null);
            }}
            placeholder="例如：React 性能优化讨论"
            type="text"
            value={title}
          />
        </label>
        <label className="text-sm font-medium text-zinc-800">
          来源类型
          <select
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            onChange={(event) => {
              setProfileId(event.target.value);
              setImportResult(null);
            }}
            value={profileId}
          >
            {importProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs font-normal leading-5 text-zinc-500">
            {selectedProfile?.description}
          </span>
        </label>
      </div>

      <label className="block text-sm font-medium text-zinc-800">
        对话原文
        <textarea
          className="mt-2 min-h-72 w-full resize-y rounded-lg border border-zinc-300 px-4 py-3 font-mono text-sm leading-6 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          onChange={(event) => {
            setRawText(event.target.value);
            setError(null);
            setImportResult(null);
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

      {preview && rawText.trim() ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                解析预览
              </p>
              <p className="mt-2 text-sm font-medium text-zinc-900">
                预计 {preview.messageCount} 条 Messages
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium text-zinc-600">
              <span className="rounded-full bg-white px-3 py-1.5">User {preview.userCount}</span>
              <span className="rounded-full bg-white px-3 py-1.5">Assistant {preview.assistantCount}</span>
              <span className="rounded-full bg-white px-3 py-1.5">Unknown {preview.unknownCount}</span>
            </div>
          </div>

          {preview.hasHighUnknownRatio ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800" role="status">
              当前文本可能无法准确识别对话轮次，但仍会保留原文。
            </p>
          ) : null}

          <ol className="mt-4 space-y-3">
            {preview.messages.slice(0, 3).map((message) => (
              <li className="rounded-lg border border-zinc-200 bg-white p-3" key={message.id}>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {message.role}
                </p>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                  {message.content}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

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
      {importResult ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900" role="status">
          <p className="font-semibold">Clipboard 导入成功</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-emerald-700">Conversation title</dt>
              <dd className="mt-1 font-medium">{importResult.title}</dd>
            </div>
            <div>
              <dt className="text-emerald-700">sourceType</dt>
              <dd className="mt-1 font-medium">{importResult.sourceType}</dd>
            </div>
            <div>
              <dt className="text-emerald-700">message count</dt>
              <dd className="mt-1 font-medium">{importResult.messageCount}</dd>
            </div>
            <div>
              <dt className="text-emerald-700">unknown count</dt>
              <dd className="mt-1 font-medium">{importResult.unknownCount}</dd>
            </div>
          </dl>
          <Link
            className="mt-4 inline-block rounded-lg bg-emerald-900 px-4 py-2.5 font-medium text-white hover:bg-emerald-800"
            href={`/conversation/${importResult.conversationId}?imported=clipboard`}
          >
            进入 Conversation
          </Link>
        </div>
      ) : null}

      <button
        className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
        disabled={!rawText.trim()}
        onClick={importClipboardText}
        type="button"
      >
        导入 Clipboard 文本
      </button>
      <p className="text-xs leading-5 text-zinc-500">
        此步骤使用所选 Profile 在本地解析并保存 Messages；不会生成 Proposal，也不会调用 AI。
      </p>
    </section>
  );
}
